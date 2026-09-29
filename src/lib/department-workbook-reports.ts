import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import XlsxPopulate, { type Sheet, type Workbook } from "xlsx-populate";
import { prisma } from "@/lib/prisma";
import { surveyRosterEmployeeWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD, isReportableGroup } from "@/lib/constants";

const MASTER_TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "templates",
  "pulse-survey-master-template.xlsx"
);
const DEPARTMENT_TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "templates",
  "pulse-survey-department-template.xlsx"
);
const TEMPLATE_DEPARTMENT_SHEET = "101 Leadership";
const RESERVED_SHEETS = new Set([
  "Read Me",
  "Raw - Dept Breakdown",
  "Raw - Comments",
]);
const COMMENT_THEMES = [
  "Other",
  "Communication",
  "Tools & Processes",
  "Customer Experience",
  "Culture",
  "Compensation & Benefits",
  "Leadership",
  "Career Growth",
  "Workload",
  "Facilities",
  "Safety",
  "Legal & Compliance",
] as const;
const COMMENT_SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;

type SurveyQuestion = {
  id: string;
  section: string | null;
  text: string;
  type: string;
  order: number;
  options: string | null;
};

type AnonymousComment = {
  question: string;
  comment: string;
  sentiment: string;
  severity: string;
  themes: string[];
};

export type DepartmentWorkbookOption = {
  id: string;
  name: string;
  employeeCount: number;
  completions: number;
};

type DepartmentReport = DepartmentWorkbookOption & {
  responses: number;
  participationRate: number;
  averageRating: number | null;
  suppressed: boolean;
  comments: AnonymousComment[];
};

export type DepartmentWorkbookReportData = {
  survey: {
    id: string;
    title: string;
    status: string;
    startDate: Date;
    endDate: Date;
    questions: SurveyQuestion[];
  };
  generatedAt: Date;
  totalEmployees: number;
  totalCompletions: number;
  totalResponses: number;
  participationRate: number;
  averageRating: number | null;
  departments: DepartmentReport[];
};

let templateBufferPromise: Promise<Buffer> | null = null;
let departmentTemplateBufferPromise: Promise<Buffer> | null = null;

export async function loadDepartmentWorkbookReportData(
  surveyId: string
): Promise<DepartmentWorkbookReportData | null> {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          section: true,
          text: true,
          type: true,
          order: true,
          options: true,
        },
      },
    },
  });
  if (!survey) return null;

  const employeeWhere = surveyRosterEmployeeWhere(survey.startDate);
  const employees = await prisma.user.findMany({
    where: employeeWhere,
    select: {
      id: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  const departmentIds = [...new Set(employees.map((employee) => employee.departmentId))];

  const [responses, completions] = await Promise.all([
    departmentIds.length
      ? prisma.surveyResponse.findMany({
          where: { surveyId, departmentId: { in: departmentIds } },
          select: {
            id: true,
            departmentId: true,
            submittedAt: true,
            answers: {
              select: {
                id: true,
                questionId: true,
                ratingValue: true,
                textValue: true,
              },
            },
          },
          orderBy: { submittedAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.surveyCompletion.findMany({
      where: { surveyId, user: employeeWhere },
      select: { userId: true },
    }),
  ]);

  const commentAnswerIds = responses.flatMap((response) =>
    response.answers
      .filter((answer) => Boolean(answer.textValue?.trim()))
      .map((answer) => answer.id)
  );
  const commentAnalyses = commentAnswerIds.length
    ? await prisma.commentAnalysis.findMany({
        where: { sourceType: "survey", sourceId: { in: commentAnswerIds } },
        select: {
          sourceId: true,
          sentiment: true,
          severity: true,
          themes: true,
        },
      })
    : [];

  const analysisByAnswerId = new Map(
    commentAnalyses.map((analysis) => [analysis.sourceId, analysis])
  );
  const questionById = new Map(survey.questions.map((question) => [question.id, question]));
  const standardRatingQuestionIds = new Set(
    survey.questions
      .filter((question) => isStandardRatingQuestion(question))
      .map((question) => question.id)
  );
  const completedUserIds = new Set(completions.map((completion) => completion.userId));
  const departmentEmployees = new Map<string, typeof employees>();

  for (const employee of employees) {
    const group = departmentEmployees.get(employee.departmentId) || [];
    group.push(employee);
    departmentEmployees.set(employee.departmentId, group);
  }

  const departments = [...departmentEmployees.entries()]
    .map(([departmentId, scopedEmployees]) => {
      const scopedResponses = responses.filter(
        (response) => response.departmentId === departmentId
      );
      const completionCount = scopedEmployees.filter((employee) =>
        completedUserIds.has(employee.id)
      ).length;
      const suppressed = !isReportableGroup(completionCount);
      const ratings = ratingValues(scopedResponses, standardRatingQuestionIds);
      const comments = suppressed
        ? []
        : scopedResponses.flatMap((response) =>
            response.answers.flatMap((answer) => {
              const comment = answer.textValue?.trim();
              if (!comment) return [];
              const analysis = analysisByAnswerId.get(answer.id);
              return [{
                question: questionById.get(answer.questionId)?.text || "Survey comment",
                comment,
                sentiment: normalizeSentiment(analysis?.sentiment),
                severity: normalizeSeverity(analysis?.severity),
                themes: normalizeThemes(analysis?.themes),
              }];
            })
          );

      return {
        id: departmentId,
        name: scopedEmployees[0].department.name,
        employeeCount: scopedEmployees.length,
        completions: completionCount,
        responses: scopedResponses.length,
        participationRate: scopedEmployees.length
          ? completionCount / scopedEmployees.length
          : 0,
        averageRating: suppressed ? null : average(ratings),
        suppressed,
        comments,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const companyRatings = ratingValues(responses, standardRatingQuestionIds);
  const totalCompletions = completions.length;

  return {
    survey,
    generatedAt: new Date(),
    totalEmployees: employees.length,
    totalCompletions,
    totalResponses: responses.length,
    participationRate: employees.length ? totalCompletions / employees.length : 0,
    averageRating: isReportableGroup(totalCompletions) ? average(companyRatings) : null,
    departments,
  };
}

export function departmentWorkbookOptions(data: DepartmentWorkbookReportData) {
  return data.departments.map(({ id, name, employeeCount, completions }) => ({
    id,
    name,
    employeeCount,
    completions,
  }));
}

export async function buildMasterDepartmentWorkbook(
  data: DepartmentWorkbookReportData
) {
  const workbook = await XlsxPopulate.fromDataAsync(await getTemplateBuffer());
  writeMasterReadMe(workbook, data);
  writeDepartmentBreakdown(requiredSheet(workbook, "Raw - Dept Breakdown"), data.departments);
  writeRawComments(requiredSheet(workbook, "Raw - Comments"), data.departments);

  const sheetNames = ensureDepartmentSheets(workbook, data.departments);
  for (const department of data.departments) {
    writeDepartmentDashboard(
      requiredSheet(workbook, sheetNames.get(department.id) || ""),
      department,
      data
    );
  }
  workbook.activeSheet("Read Me");

  const output = asBuffer(await workbook.outputAsync("nodebuffer"));
  return repairChartSheetReferences(output);
}

export async function buildSingleDepartmentWorkbook(
  data: DepartmentWorkbookReportData,
  departmentId: string
) {
  const department = data.departments.find((item) => item.id === departmentId);
  if (!department) return null;

  const workbook = await XlsxPopulate.fromDataAsync(
    await getDepartmentTemplateBuffer()
  );
  writeDepartmentReadMe(workbook, data, department);
  writeDepartmentBreakdown(requiredSheet(workbook, "Raw - Dept Breakdown"), [department]);
  writeRawComments(requiredSheet(workbook, "Raw - Comments"), [department]);
  writeDepartmentDashboard(
    requiredSheet(workbook, "Department Results"),
    department,
    data
  );
  workbook.activeSheet("Department Results");
  const output = asBuffer(await workbook.outputAsync("nodebuffer"));
  return repairChartSheetReferences(output);
}

export async function buildAllDepartmentWorkbooksZip(
  data: DepartmentWorkbookReportData
) {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let start = 0; start < data.departments.length; start += 4) {
    const batch = data.departments.slice(start, start + 4);
    const files = await Promise.all(
      batch.map(async (department) => ({
        department,
        buffer: await buildSingleDepartmentWorkbook(data, department.id),
      }))
    );
    for (const { department, buffer } of files) {
      if (!buffer) continue;
      const base = `${fileSlug(department.name)}-pulse-survey-results`;
      let filename = `${base}.xlsx`;
      let suffix = 2;
      while (usedNames.has(filename.toLowerCase())) {
        filename = `${base}-${suffix}.xlsx`;
        suffix += 1;
      }
      usedNames.add(filename.toLowerCase());
      zip.file(filename, buffer);
    }
  }

  return asBuffer(
    await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })
  );
}

export function workbookFilename(
  surveyTitle: string,
  mode: "master" | "department" | "all-departments",
  departmentName?: string
) {
  const survey = fileSlug(surveyTitle);
  if (mode === "master") return `${survey}-department-master.xlsx`;
  if (mode === "all-departments") return `${survey}-department-workbooks.zip`;
  return `${fileSlug(departmentName || "department")}-${survey}-results.xlsx`;
}

function ensureDepartmentSheets(workbook: Workbook, departments: DepartmentReport[]) {
  const actualNames = new Set(departments.map((department) => department.name));
  const existingDepartmentSheets = workbook
    .sheets()
    .filter((sheet) => !RESERVED_SHEETS.has(sheet.name()));
  const templateSheet = workbook.sheet(TEMPLATE_DEPARTMENT_SHEET) || existingDepartmentSheets[0];
  if (!templateSheet) throw new Error("The department workbook template has no dashboard sheet.");
  const result = new Map<string, string>();
  const usedSheetNames = new Set<string>(RESERVED_SHEETS);

  for (const department of departments) {
    const exactSheet = workbook.sheet(department.name);
    if (exactSheet) {
      result.set(department.id, exactSheet.name());
      usedSheetNames.add(exactSheet.name());
      continue;
    }

    const sheetName = uniqueSheetName(department.name, usedSheetNames);
    const sheet = workbook.cloneSheet(templateSheet, sheetName);
    result.set(department.id, sheet.name());
    usedSheetNames.add(sheet.name());
  }

  for (const sheet of [...workbook.sheets()]) {
    if (RESERVED_SHEETS.has(sheet.name())) continue;
    if (!actualNames.has(sheet.name()) && ![...result.values()].includes(sheet.name())) {
      sheet.delete();
    }
  }

  departments.forEach((department, index) => {
    workbook.moveSheet(result.get(department.id), index + 3);
  });
  return result;
}

function writeMasterReadMe(workbook: Workbook, data: DepartmentWorkbookReportData) {
  const sheet = requiredSheet(workbook, "Read Me");
  sheet.range("B2:C20").clear();
  sheet.cell("B2").value("Employee Pulse Survey - Department Dashboards");
  sheet.cell("B3").value(
    `${data.survey.title} | ${surveyPeriod(data)} | ${data.totalEmployees} eligible employees`
  );
  sheet.cell("B5").value("About this workbook");
  sheet.cell("B6").value("Source");
  sheet.cell("C6").value(
    `Generated from the live survey application on ${formatDateTime(data.generatedAt)}. No manual pasting is required.`
  );
  sheet.cell("B7").value("Eligible roster");
  sheet.cell("C7").value(
    "BambooHR employees who were active, assigned to a department, and hired before the survey opened. Employees currently on leave or inactive are excluded."
  );
  sheet.cell("B8").value("Privacy rule");
  sheet.cell("C8").value(
    `Ratings and comments are shown only when a department has at least ${ANONYMITY_THRESHOLD} eligible completions. Participation counts remain visible.`
  );
  sheet.cell("B10").value("Workbook contents");
  sheet.cell("C11").value(
    "Raw - Dept Breakdown contains the live department totals used by every dashboard tab."
  );
  sheet.cell("C12").value(
    "Raw - Comments contains anonymous survey comments for reportable departments and is included only in this admin master workbook."
  );
  sheet.cell("C13").value(
    "Each department tab contains its participation, overall 1-5 rating, comment themes, sentiment, and anonymous comments."
  );
  sheet.cell("B15").value("Distribution");
  sheet.cell("C16").value(
    "Keep this master workbook within HR and the c-suite. Use the app's department-specific download for leader distribution; those files contain no comments or other departments."
  );
  sheet.cell("B18").value("Company benchmark");
  sheet.cell("C19").value(companyBenchmark(data));
}

function writeDepartmentReadMe(
  workbook: Workbook,
  data: DepartmentWorkbookReportData,
  department: DepartmentReport
) {
  const sheet = requiredSheet(workbook, "Read Me");
  sheet.range("B2:C20").clear();
  sheet.cell("B2").value(`${department.name} - Employee Pulse Survey Results`);
  sheet.cell("B3").value(`${data.survey.title} | ${surveyPeriod(data)}`);
  sheet.cell("B5").value("About this workbook");
  sheet.cell("B6").value("Department");
  sheet.cell("C6").value(department.name);
  sheet.cell("B7").value("Department results");
  sheet.cell("C7").value(
    `${department.completions}/${department.employeeCount} eligible employees completed the survey (${formatPercent(department.participationRate)}).`
  );
  sheet.cell("B8").value("Company benchmark");
  sheet.cell("C8").value(companyBenchmark(data));
  sheet.cell("B10").value("Privacy");
  sheet.cell("C11").value(
    `Ratings, themes, sentiment, and anonymous written comments are shown only with at least ${ANONYMITY_THRESHOLD} eligible completions. This workbook contains no employee identities or data from other departments.`
  );
  sheet.cell("B13").value("Distribution");
  sheet.cell("C14").value(
    "This department-specific file is intended for HR-administered distribution to the named department leader."
  );
  sheet.cell("B16").value("Generated");
  sheet.cell("C17").value(formatDateTime(data.generatedAt));
}

function writeDepartmentBreakdown(sheet: Sheet, departments: DepartmentReport[]) {
  sheet.range("A1:G120").clear();
  sheet.cell("A1").value("Generated securely from the Employee Pulse Survey app");
  sheet.range("A2:G2").value([[
    "Group",
    "Eligible Employees",
    "Completed",
    "Responses",
    "Participation Rate",
    "Average Rating",
    "Suppression Note",
  ]]);
  if (departments.length) {
    sheet.range(`A3:G${departments.length + 2}`).value(
      departments.map((department) => [
        department.name,
        department.employeeCount,
        department.completions,
        department.responses,
        formatPercent(department.participationRate),
        department.suppressed ? "Protected" : department.averageRating,
        department.suppressed
          ? `Fewer than ${ANONYMITY_THRESHOLD} eligible completions; ratings and comments are protected.`
          : null,
      ])
    );
  }
}

function writeRawComments(sheet: Sheet, departments: DepartmentReport[]) {
  sheet.range("A1:F3000").clear();
  sheet.cell("A1").value(
    "Admin-only anonymous comments generated from the Employee Pulse Survey app"
  );
  sheet.range("A2:F2").value([[
    "Department",
    "Question",
    "Comment",
    "Sentiment",
    "Severity",
    "Themes",
  ]]);
  const rows = departments
    .flatMap((department) =>
      department.comments.map((comment) => [
        department.name,
        comment.question,
        comment.comment,
        comment.sentiment,
        comment.severity,
        comment.themes.join(", "),
      ])
    )
    .slice(0, 2998);
  if (rows.length) sheet.range(`A3:F${rows.length + 2}`).value(rows);
}

function writeDepartmentDashboard(
  sheet: Sheet,
  department: DepartmentReport,
  data: DepartmentWorkbookReportData
) {
  sheet.column("A").hidden(true);
  sheet.column("H").width(18);
  sheet.column("I").width(8);
  sheet.column("M").hidden(true);
  sheet.cell("A1").value(department.name);
  sheet.cell("A2").value(department.suppressed ? 1 : 0);
  sheet.cell("B2").value(`${department.name} - Pulse Survey Results`);
  sheet.cell("B3").value(
    `${data.survey.title} | ${surveyPeriod(data)} | Source: Employee Pulse Survey app`
  );
  sheet.cell("B6").value(department.employeeCount);
  sheet.cell("E6").value(department.completions);
  sheet.cell("H6").value(department.participationRate);
  sheet
    .cell("K6")
    .value(department.suppressed ? "N/A" : department.averageRating);
  sheet.cell("B8").value(companyBenchmark(data));
  sheet.cell("B9").value(
    department.suppressed
      ? `Results are protected because fewer than ${ANONYMITY_THRESHOLD} eligible employees completed the survey. Participation counts remain visible, but ratings and comments are not shown.`
      : null
  );
  sheet.cell("B11").value("Overall rating");
  sheet.cell("B12").value(
    "The department score is the average across all standard 1-5 rating questions. The company-wide result is shown above for context."
  );

  for (let row = 14; row <= 142; row += 1) sheet.row(row).hidden(false);
  const themeCounts = countThemes(department.comments);
  sheet.range("C17:C28").value(
    COMMENT_THEMES.map((theme) => [department.suppressed ? 0 : themeCounts.get(theme) || 0])
  );
  const sentimentCounts = countSentiments(department.comments);
  sheet.range("C32:C35").value(
    COMMENT_SENTIMENTS.map((sentiment) => [
      department.suppressed ? 0 : sentimentCounts.get(sentiment) || 0,
    ])
  );
  sheet.range("B43:M142").clear();
  const comments = department.suppressed ? [] : department.comments.slice(0, 100);
  sheet.cell("B41").value(`Written Comments for This Team (${comments.length})`);
  sheet.cell("H41").value(comments.length);
  if (comments.length) {
    sheet.range(`B43:F${comments.length + 42}`).value(
      comments.map((comment, index) => [
        index + 1,
        titleCase(comment.sentiment),
        titleCase(comment.severity),
        comment.themes.join(", "),
        comment.comment,
      ])
    );
  }
}

async function getTemplateBuffer() {
  templateBufferPromise ||= readFile(MASTER_TEMPLATE_PATH);
  return templateBufferPromise;
}

async function getDepartmentTemplateBuffer() {
  departmentTemplateBufferPromise ||= readFile(DEPARTMENT_TEMPLATE_PATH);
  return departmentTemplateBufferPromise;
}

function ratingValues(
  responses: Array<{ answers: Array<{ questionId: string; ratingValue: number | null }> }>,
  questionIds: Set<string>
) {
  return responses.flatMap((response) =>
    response.answers
      .filter((answer) => questionIds.has(answer.questionId))
      .map((answer) => answer.ratingValue)
      .filter((value): value is number => value !== null)
  );
}

function requiredSheet(workbook: Workbook, name: string) {
  const sheet = workbook.sheet(name);
  if (!sheet) throw new Error(`Workbook template is missing the "${name}" sheet.`);
  return sheet;
}

function isStandardRatingQuestion(question: SurveyQuestion) {
  if (question.type !== "rating") return false;
  const scale = ratingOptions(question.options);
  return Math.min(...scale) === 1 && Math.max(...scale) === 5;
}

function ratingOptions(options: string | null) {
  if (!options) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(options);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];
    const values = parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
    return values.length ? values : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function normalizeThemes(themes: string | null | undefined) {
  if (!themes) return ["Other"];
  let values: string[] = [];
  try {
    const parsed = JSON.parse(themes);
    if (Array.isArray(parsed)) values = parsed.map(String);
  } catch {
    values = themes.split(",");
  }
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned : ["Other"];
}

function normalizeSentiment(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  return COMMENT_SENTIMENTS.includes(normalized as (typeof COMMENT_SENTIMENTS)[number])
    ? normalized
    : "neutral";
}

function normalizeSeverity(value: string | null | undefined) {
  return (value || "pending analysis").trim().toLowerCase();
}

function countThemes(comments: AnonymousComment[]) {
  const aliases = new Map(COMMENT_THEMES.map((theme) => [theme.toLowerCase(), theme]));
  const counts = new Map<string, number>();
  for (const comment of comments) {
    const matched = new Set<string>();
    for (const rawTheme of comment.themes) {
      matched.add(aliases.get(rawTheme.toLowerCase()) || "Other");
    }
    for (const theme of matched) counts.set(theme, (counts.get(theme) || 0) + 1);
  }
  return counts;
}

function countSentiments(comments: AnonymousComment[]) {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    counts.set(comment.sentiment, (counts.get(comment.sentiment) || 0) + 1);
  }
  return counts;
}

function companyBenchmark(data: DepartmentWorkbookReportData) {
  const rating = data.averageRating === null ? "N/A" : `${data.averageRating.toFixed(1)} / 5`;
  return `Company-wide overall average rating: ${rating} | Company-wide participation: ${formatPercent(data.participationRate)} (${data.totalCompletions}/${data.totalEmployees} completed)`;
}

function surveyPeriod(data: DepartmentWorkbookReportData) {
  return `${formatDate(data.survey.startDate)} - ${formatDate(data.survey.endDate)}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueSheetName(value: string, usedNames: Set<string>) {
  const clean = value.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Department";
  let candidate = clean.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const ending = ` ${suffix}`;
    candidate = `${clean.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  return candidate;
}

function fileSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "survey";
}

function asBuffer(value: unknown) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new Error("Workbook generator returned an unsupported buffer type.");
}

async function repairChartSheetReferences(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const workbookRels = await zip
    .file("xl/_rels/workbook.xml.rels")
    ?.async("string");
  if (!workbookXml || !workbookRels) return buffer;

  const relationshipTargets = relationshipMap(workbookRels, "xl/workbook.xml");
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)];
  const claimedDrawingPaths = new Set<string>();
  const counters = {
    drawing: nextPartNumber(zip, /^xl\/drawings\/drawing(\d+)\.xml$/),
    chart: nextPartNumber(zip, /^xl\/charts\/chart(\d+)\.xml$/),
  };
  let contentTypes = await zip.file("[Content_Types].xml")?.async("string");

  for (const sheetMatch of sheets) {
    const attributes = xmlAttributes(sheetMatch[1]);
    const sheetName = decodeXml(attributes.name || "");
    const sheetPath = relationshipTargets.get(attributes["r:id"] || "");
    if (!sheetName || !sheetPath) continue;
    const sheetXml = await zip.file(sheetPath)?.async("string");
    if (!sheetXml) continue;
    const drawingId = sheetXml.match(/<drawing\b[^>]*r:id="([^"]+)"[^>]*\/?\s*>/)?.[1];
    if (!drawingId) continue;
    const sheetRelsPath = relationshipPath(sheetPath);
    const sheetRels = await zip.file(sheetRelsPath)?.async("string");
    if (!sheetRels) continue;
    let drawingPath = relationshipMap(sheetRels, sheetPath).get(drawingId);
    if (!drawingPath) continue;
    let chartPaths: string[];

    if (claimedDrawingPaths.has(drawingPath)) {
      const cloned = await cloneDrawingForSheet({
        zip,
        drawingPath,
        sheetPath,
        sheetRelsPath,
        sheetRels,
        drawingId,
        counters,
        contentTypes,
      });
      if (!cloned) continue;
      drawingPath = cloned.drawingPath;
      chartPaths = cloned.chartPaths;
      contentTypes = cloned.contentTypes;
    } else {
      claimedDrawingPaths.add(drawingPath);
      const drawingRels = await zip
        .file(relationshipPath(drawingPath))
        ?.async("string");
      if (!drawingRels) continue;
      chartPaths = [...relationshipMap(drawingRels, drawingPath).values()].filter(
        (partPath) => partPath.startsWith("xl/charts/")
      );
    }

    claimedDrawingPaths.add(drawingPath);
    for (const chartPath of chartPaths) {
      const chartFile = zip.file(chartPath);
      const chartXml = await chartFile?.async("string");
      if (!chartXml) continue;
      const referenceName = escapeXml(sheetName.replace(/'/g, "''"));
      const patched = chartXml.replace(
        /(<c:f>)(?:&apos;[^<]*?&apos;|'[^<]*?'|[^<]*?)!/g,
        `$1&apos;${referenceName}&apos;!`
      );
      zip.file(chartPath, patched);
    }
  }

  if (contentTypes) zip.file("[Content_Types].xml", contentTypes);

  return asBuffer(await zip.generateAsync({ type: "nodebuffer" }));
}

async function cloneDrawingForSheet({
  zip,
  drawingPath,
  sheetPath,
  sheetRelsPath,
  sheetRels,
  drawingId,
  counters,
  contentTypes,
}: {
  zip: JSZip;
  drawingPath: string;
  sheetPath: string;
  sheetRelsPath: string;
  sheetRels: string;
  drawingId: string;
  counters: { drawing: number; chart: number };
  contentTypes: string | undefined;
}) {
  const drawingXml = await zip.file(drawingPath)?.async("string");
  const drawingRelsPath = relationshipPath(drawingPath);
  const drawingRels = await zip.file(drawingRelsPath)?.async("string");
  if (!drawingXml || !drawingRels) return null;

  const newDrawingPath = `xl/drawings/drawing${counters.drawing}.xml`;
  counters.drawing += 1;
  let newDrawingRels = drawingRels;
  const chartPaths: string[] = [];

  for (const match of drawingRels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = xmlAttributes(match[1]);
    if (!attributes.Id || !attributes.Target || !attributes.Type?.endsWith("/chart")) {
      continue;
    }
    const sourceChartPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(drawingPath), attributes.Target)
    );
    const sourceChart = await zip.file(sourceChartPath)?.async("string");
    if (!sourceChart) continue;
    const newChartPath = `xl/charts/chart${counters.chart}.xml`;
    counters.chart += 1;
    zip.file(newChartPath, sourceChart);
    chartPaths.push(newChartPath);
    newDrawingRels = replaceRelationshipTarget(
      newDrawingRels,
      attributes.Id,
      relativePackageTarget(newDrawingPath, newChartPath)
    );
    if (contentTypes) {
      contentTypes = cloneContentTypeOverride(
        contentTypes,
        sourceChartPath,
        newChartPath
      );
    }
  }

  zip.file(newDrawingPath, drawingXml);
  zip.file(relationshipPath(newDrawingPath), newDrawingRels);
  zip.file(
    sheetRelsPath,
    replaceRelationshipTarget(
      sheetRels,
      drawingId,
      relativePackageTarget(sheetPath, newDrawingPath)
    )
  );
  if (contentTypes) {
    contentTypes = cloneContentTypeOverride(
      contentTypes,
      drawingPath,
      newDrawingPath
    );
  }

  return {
    drawingPath: newDrawingPath,
    chartPaths,
    contentTypes,
  };
}

function nextPartNumber(zip: JSZip, pattern: RegExp) {
  return Object.keys(zip.files).reduce((highest, name) => {
    const match = name.match(pattern);
    return match ? Math.max(highest, Number(match[1]) + 1) : highest;
  }, 1);
}

function replaceRelationshipTarget(xml: string, relationshipId: string, target: string) {
  const escapedId = escapeRegExp(relationshipId);
  return xml.replace(
    new RegExp(`(<Relationship\\b(?=[^>]*Id="${escapedId}")[^>]*Target=")[^"]*(")`),
    `$1${escapeXml(target)}$2`
  );
}

function relativePackageTarget(ownerPath: string, targetPath: string) {
  return path.posix.relative(path.posix.dirname(ownerPath), targetPath);
}

function cloneContentTypeOverride(xml: string, sourcePath: string, targetPath: string) {
  if (xml.includes(`PartName="/${targetPath}"`)) return xml;
  const sourcePattern = new RegExp(
    `<Override\\b[^>]*PartName="/${escapeRegExp(sourcePath)}"[^>]*/>`
  );
  const sourceTag = xml.match(sourcePattern)?.[0];
  if (!sourceTag) return xml;
  const clonedTag = sourceTag.replace(`/${sourcePath}`, `/${targetPath}`);
  return xml.replace("</Types>", `${clonedTag}</Types>`);
}

function relationshipMap(xml: string, ownerPath: string) {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = xmlAttributes(match[1]);
    if (!attributes.Id || !attributes.Target) continue;
    result.set(
      attributes.Id,
      path.posix.normalize(path.posix.join(path.posix.dirname(ownerPath), attributes.Target))
    );
  }
  return result;
}

function relationshipPath(ownerPath: string) {
  return path.posix.join(
    path.posix.dirname(ownerPath),
    "_rels",
    `${path.posix.basename(ownerPath)}.rels`
  );
}

function xmlAttributes(value: string) {
  const attributes: Record<string, string> = {};
  for (const match of value.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function decodeXml(value: string) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
