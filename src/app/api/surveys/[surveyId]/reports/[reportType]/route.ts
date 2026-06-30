import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import type { Prisma } from "@/generated/prisma/client";

type ReportType =
  | "executive-summary"
  | "participation"
  | "question-results"
  | "department-breakdown"
  | "team-location-breakdown"
  | "manager-scoped"
  | "comments-themes"
  | "completion-tracker"
  | "non-completion";

type CellValue = string | number | boolean | Date | null;
type ReportSheet = { name: string; rows: CellValue[][] };
type SurveyForReport = Prisma.SurveyGetPayload<{
  include: {
    questions: true;
    sentimentAnalyses: true;
  };
}>;
type ResponseForReport = Prisma.SurveyResponseGetPayload<{
  include: {
    answers: true;
    department: { select: { id: true; name: true } };
    team: { select: { id: true; name: true } };
  };
}>;
type EmployeeForReport = Prisma.UserGetPayload<{
  include: {
    department: { select: { id: true; name: true } };
    team: { select: { id: true; name: true } };
  };
}>;
type CompletionForReport = { userId: string; completedAt: Date };
type ReportContext = {
  reportType: ReportType;
  reportLabel: string;
  survey: SurveyForReport;
  filters: { departmentId?: string | null; teamId?: string | null; location?: string | null };
  scope: "company" | "filtered";
  scopeLabel: string;
  generatedAt: Date;
  responses: ResponseForReport[];
  employees: EmployeeForReport[];
  completions: CompletionForReport[];
};

const reportLabels: Record<ReportType, string> = {
  "executive-summary": "Executive Summary",
  participation: "Participation Report",
  "question-results": "Question-by-Question Results",
  "department-breakdown": "Department Breakdown",
  "team-location-breakdown": "Team and Location Breakdown",
  "manager-scoped": "Manager-Scoped Report",
  "comments-themes": "Anonymous Comments and Themes",
  "completion-tracker": "Completion Tracker",
  "non-completion": "Non-Completion List",
};

const reportTypes = new Set(Object.keys(reportLabels));

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string; reportType: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId, reportType: rawReportType } = await params;
  if (!reportTypes.has(rawReportType)) {
    return Response.json({ error: "Unknown report type" }, { status: 404 });
  }

  const reportType = rawReportType as ReportType;
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const context = await buildReportContext(request, surveyId, reportType);
  if (!context) return Response.json({ error: "Survey not found" }, { status: 404 });

  const sheets = buildReportSheets(context, reportType);
  const filename = makeFilename(context.survey.title, reportType, format);

  if (format === "csv") {
    return new Response(toCsv(sheets), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  return new Response(new Uint8Array(toXlsx(sheets)), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

async function buildReportContext(
  request: NextRequest,
  surveyId: string,
  reportType: ReportType
): Promise<ReportContext | null> {
  const scope = request.nextUrl.searchParams.get("scope") === "company" ? "company" : "filtered";
  const filters =
    scope === "company"
      ? {}
      : {
          departmentId: request.nextUrl.searchParams.get("departmentId"),
          teamId: request.nextUrl.searchParams.get("teamId"),
          location: request.nextUrl.searchParams.get("location"),
        };

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      sentimentAnalyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
    },
  });
  if (!survey) return null;

  const responseWhere = applyResponseFilters({ surveyId }, filters);
  const employeeWhere = applyEmployeeFilters({ status: "active" }, filters);

  const [responses, employees, completions] = await Promise.all([
    prisma.surveyResponse.findMany({
      where: responseWhere,
      include: {
        answers: true,
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.user.findMany({
      where: employeeWhere,
      include: {
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.surveyCompletion.findMany({
      where: { surveyId, user: employeeWhere },
      select: { userId: true, completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  return {
    reportType,
    reportLabel: reportLabels[reportType],
    survey,
    filters,
    scope,
    scopeLabel: buildScopeLabel(scope, filters),
    generatedAt: new Date(),
    responses,
    employees,
    completions,
  };
}

function buildReportSheets(context: ReportContext, reportType: ReportType): ReportSheet[] {
  switch (reportType) {
    case "executive-summary":
      return buildExecutiveSummary(context);
    case "participation":
      return buildParticipationReport(context);
    case "question-results":
      return buildQuestionResultsReport(context);
    case "department-breakdown":
      return buildDepartmentBreakdownReport(context);
    case "team-location-breakdown":
      return buildTeamLocationReport(context);
    case "manager-scoped":
      return buildManagerScopedReport(context);
    case "comments-themes":
      return buildCommentsThemesReport(context);
    case "completion-tracker":
      return buildCompletionTrackerReport(context);
    case "non-completion":
      return buildNonCompletionReport(context);
  }
}

function buildExecutiveSummary(context: ReportContext): ReportSheet[] {
  const metrics = getOverallMetrics(context);
  const rows = [
    ...summaryRows(context),
    [],
    ["Metric", "Value"],
    ["Active employees in scope", metrics.totalEmployees],
    ["Completed surveys", metrics.completions],
    ["Anonymous responses", metrics.responses],
    ["Participation rate", `${metrics.participationRate}%`],
    ["Overall average rating", metrics.averageRating || "No ratings yet"],
    ["Open written comments", metrics.comments],
    [],
    ["AI sentiment", context.survey.sentimentAnalyses[0]?.sentiment || "Not analyzed"],
    ["AI summary", context.survey.sentimentAnalyses[0]?.summary || "Run AI analysis from the results page."],
  ];

  return [
    { name: "Executive Summary", rows },
    { name: "Charts", rows: chartRows([["Participation rate", metrics.participationRate], ["Average rating x20", metrics.averageRating * 20]]) },
  ];
}

function buildParticipationReport(context: ReportContext): ReportSheet[] {
  return [
    { name: "Summary", rows: [...summaryRows(context), [], ...participationSummaryRows(context)] },
    { name: "By Department", rows: breakdownRows(context, "department") },
    { name: "By Team", rows: breakdownRows(context, "team") },
    { name: "By Location", rows: breakdownRows(context, "location") },
    { name: "Charts", rows: chartRows(participationChartData(context)) },
  ];
}

function buildQuestionResultsReport(context: ReportContext): ReportSheet[] {
  const rows: CellValue[][] = [
    ...summaryRows(context),
    [],
    [
      "Section",
      "Question",
      "Type",
      "Responses",
      "Average",
      "Rating 1",
      "Rating 2",
      "Rating 3",
      "Rating 4",
      "Rating 5",
      "Choice / Note",
      "Count",
    ],
  ];

  for (const question of context.survey.questions) {
    const answers = answersForQuestion(context, question.id);
    if (question.type === "rating") {
      const ratings = answers
        .map((answer) => answer.ratingValue)
        .filter((value): value is number => value !== null);
      rows.push([
        question.section || "",
        question.text,
        question.type,
        ratings.length,
        average(ratings),
        ...[1, 2, 3, 4, 5].map((rating) => ratings.filter((value) => value === rating).length),
        "",
        "",
      ]);
    } else if (question.type === "multiple_choice") {
      const choices = answers
        .map((answer) => answer.choiceValue)
        .filter((value): value is string => Boolean(value));
      const options = question.options ? safeJsonArray(question.options) : [];
      for (const option of options) {
        rows.push([
          question.section || "",
          question.text,
          question.type,
          choices.length,
          "",
          "",
          "",
          "",
          "",
          "",
          option,
          choices.filter((choice) => choice === option).length,
        ]);
      }
    } else {
      const comments = textAnswers(answers);
      rows.push([question.section || "", question.text, question.type, comments.length, "", "", "", "", "", "", "Written comments", comments.length]);
    }
  }

  return [
    { name: "Question Results", rows },
    { name: "Charts", rows: chartRows(questionChartData(context)) },
  ];
}

function buildDepartmentBreakdownReport(context: ReportContext): ReportSheet[] {
  return [
    { name: "Summary", rows: summaryRows(context) },
    { name: "Department Breakdown", rows: breakdownRows(context, "department") },
    { name: "Charts", rows: chartRows(breakdownChartData(context, "department")) },
  ];
}

function buildTeamLocationReport(context: ReportContext): ReportSheet[] {
  return [
    { name: "Summary", rows: summaryRows(context) },
    { name: "Team Breakdown", rows: breakdownRows(context, "team") },
    { name: "Location Breakdown", rows: breakdownRows(context, "location") },
    { name: "Charts", rows: chartRows([...breakdownChartData(context, "team"), ...breakdownChartData(context, "location")]) },
  ];
}

function buildManagerScopedReport(context: ReportContext): ReportSheet[] {
  const managerEmails = [
    ...new Set(context.employees.map((employee) => normalizeEmail(employee.managerEmail)).filter(Boolean)),
  ];

  const rows: CellValue[][] = [
    ...summaryRows(context),
    [],
    ["Manager Email", "Manager Name", "Employees", "Completed", "Incomplete", "Responses", "Participation Rate", "Average Rating", "Suppression"],
  ];

  if (managerEmails.length === 0) {
    rows.push(["No manager mapping found", "", "", "", "", "", "", "", "BambooHR did not provide manager emails."]);
  }

  for (const managerEmail of managerEmails) {
    const employees = context.employees.filter((employee) => normalizeEmail(employee.managerEmail) === managerEmail);
    const manager = context.employees.find((employee) => normalizeEmail(employee.email) === managerEmail);
    const completions = context.completions.filter((completion) =>
      employees.some((employee) => employee.id === completion.userId)
    );
    const responses = context.responses.filter((response) => normalizeEmail(response.managerEmail) === managerEmail);
    const ratings = ratingValues(responses);
    const suppressed = responses.length < ANONYMITY_THRESHOLD;
    rows.push([
      managerEmail,
      manager?.name || "",
      employees.length,
      completions.length,
      Math.max(employees.length - completions.length, 0),
      suppressed ? `Suppressed (<${ANONYMITY_THRESHOLD})` : responses.length,
      suppressed || employees.length === 0 ? "Suppressed" : `${Math.round((completions.length / employees.length) * 100)}%`,
      suppressed ? "Suppressed" : average(ratings),
      suppressed ? `Fewer than ${ANONYMITY_THRESHOLD} responses` : "",
    ]);
  }

  return [
    { name: "Summary", rows: summaryRows(context) },
    { name: "Manager Scoped", rows },
    { name: "Charts", rows: chartRows(managerEmails.map((email) => [email, context.employees.filter((employee) => normalizeEmail(employee.managerEmail) === email).length])) },
  ];
}

function buildCommentsThemesReport(context: ReportContext): ReportSheet[] {
  const themeRows: CellValue[][] = [
    ...summaryRows(context),
    [],
    ["Theme", "Source", "Notes"],
  ];
  const analysis = context.survey.sentimentAnalyses[0];
  if (analysis) {
    for (const theme of safeJsonArray(analysis.themes)) {
      themeRows.push([theme, "AI analysis", analysis.summary]);
    }
  } else {
    themeRows.push(["Not analyzed", "AI analysis", "Run AI analysis from the results page to generate grouped themes."]);
  }

  const commentRows: CellValue[][] = [
    ...summaryRows(context),
    [],
    ["Section", "Question", "Anonymous Comment"],
  ];
  for (const question of context.survey.questions.filter((question) => question.type === "free_text")) {
    for (const comment of textAnswers(answersForQuestion(context, question.id))) {
      commentRows.push([question.section || "", question.text, comment]);
    }
  }
  if (commentRows.length === summaryRows(context).length + 2) {
    commentRows.push(["", "", "No written comments yet."]);
  }

  return [
    { name: "Grouped Themes", rows: themeRows },
    { name: "Raw Comments", rows: commentRows },
  ];
}

function buildCompletionTrackerReport(context: ReportContext): ReportSheet[] {
  return [
    { name: "Summary", rows: [...summaryRows(context), [], ...completionSummaryRows(context)] },
    { name: "Employee Completion", rows: employeeCompletionRows(context, false) },
    { name: "By Department", rows: completionGroupRows(context, "department") },
    { name: "By Team", rows: completionGroupRows(context, "team") },
    { name: "By Location", rows: completionGroupRows(context, "location") },
    { name: "Charts", rows: chartRows(completionChartData(context)) },
  ];
}

function buildNonCompletionReport(context: ReportContext): ReportSheet[] {
  return [
    { name: "Summary", rows: [...summaryRows(context), [], ...completionSummaryRows(context)] },
    { name: "Non-Completed Employees", rows: employeeCompletionRows(context, true) },
    { name: "By Department", rows: completionGroupRows(context, "department") },
    { name: "By Team", rows: completionGroupRows(context, "team") },
    { name: "By Location", rows: completionGroupRows(context, "location") },
  ];
}

function summaryRows(context: ReportContext): CellValue[][] {
  return [
    ["Report", context.reportLabel],
    ["Survey", context.survey.title],
    ["Status", context.survey.status],
    ["Start Date", formatDate(context.survey.startDate)],
    ["End Date", formatDate(context.survey.endDate)],
    ["Scope", context.scopeLabel],
    ["Generated At", formatDateTime(context.generatedAt)],
    ["Anonymity Rule", `Breakdowns with fewer than ${ANONYMITY_THRESHOLD} responses are suppressed.`],
  ];
}

function participationSummaryRows(context: ReportContext): CellValue[][] {
  const metrics = getOverallMetrics(context);
  return [
    ["Metric", "Value"],
    ["Employees in scope", metrics.totalEmployees],
    ["Completed", metrics.completions],
    ["Incomplete", Math.max(metrics.totalEmployees - metrics.completions, 0)],
    ["Anonymous responses", metrics.responses],
    ["Participation rate", `${metrics.participationRate}%`],
  ];
}

function completionSummaryRows(context: ReportContext): CellValue[][] {
  const completed = new Set(context.completions.map((completion) => completion.userId));
  return [
    ["Metric", "Value"],
    ["Employees in scope", context.employees.length],
    ["Completed", completed.size],
    ["Not completed", context.employees.filter((employee) => !completed.has(employee.id)).length],
    ["Completion rate", context.employees.length ? `${Math.round((completed.size / context.employees.length) * 100)}%` : "0%"],
  ];
}

function breakdownRows(context: ReportContext, groupBy: "department" | "team" | "location"): CellValue[][] {
  const rows: CellValue[][] = [
    ...summaryRows(context),
    [],
    ["Group", "Employees", "Completed", "Responses", "Participation Rate", "Average Rating", "Suppression"],
  ];

  for (const group of groupSurveyData(context, groupBy)) {
    const suppressed = group.responses.length < ANONYMITY_THRESHOLD;
    rows.push([
      group.name,
      group.employees.length,
      suppressed ? `Suppressed (<${ANONYMITY_THRESHOLD})` : group.completions.length,
      suppressed ? `Suppressed (<${ANONYMITY_THRESHOLD})` : group.responses.length,
      suppressed || group.employees.length === 0 ? "Suppressed" : `${Math.round((group.completions.length / group.employees.length) * 100)}%`,
      suppressed ? "Suppressed" : average(ratingValues(group.responses)),
      suppressed ? `Fewer than ${ANONYMITY_THRESHOLD} responses` : "",
    ]);
  }

  return rows;
}

function employeeCompletionRows(context: ReportContext, incompleteOnly: boolean): CellValue[][] {
  const completed = new Map(context.completions.map((completion) => [completion.userId, completion.completedAt]));
  const rows: CellValue[][] = [
    ...summaryRows(context),
    [],
    ["Name", "Email", "Department", "Team", "Location", "Manager Email", "Status", "Completed", "Completed At"],
  ];

  for (const employee of context.employees) {
    const completedAt = completed.get(employee.id);
    if (incompleteOnly && completedAt) continue;
    rows.push([
      employee.name,
      employee.email,
      employee.department?.name || "",
      employee.team?.name || "",
      employee.location || "",
      employee.managerEmail || "",
      employee.status,
      completedAt ? "Yes" : "No",
      completedAt ? formatDateTime(completedAt) : "",
    ]);
  }

  if (rows.length === summaryRows(context).length + 2) {
    rows.push(["No employees found", "", "", "", "", "", "", "", ""]);
  }

  return rows;
}

function completionGroupRows(context: ReportContext, groupBy: "department" | "team" | "location"): CellValue[][] {
  const completed = new Set(context.completions.map((completion) => completion.userId));
  const groups = groupEmployees(context, groupBy);
  const rows: CellValue[][] = [
    ...summaryRows(context),
    [],
    ["Group", "Employees", "Completed", "Not Completed", "Completion Rate"],
  ];

  for (const group of groups) {
    const completedCount = group.employees.filter((employee) => completed.has(employee.id)).length;
    rows.push([
      group.name,
      group.employees.length,
      completedCount,
      Math.max(group.employees.length - completedCount, 0),
      group.employees.length ? `${Math.round((completedCount / group.employees.length) * 100)}%` : "0%",
    ]);
  }

  return rows;
}

function getOverallMetrics(context: ReportContext) {
  const ratings = ratingValues(context.responses);
  const comments = context.responses.flatMap((response) =>
    response.answers
      .map((answer) => answer.textValue)
      .filter((value): value is string => Boolean(value && value.trim()))
  );

  return {
    totalEmployees: context.employees.length,
    completions: context.completions.length,
    responses: context.responses.length,
    participationRate: context.employees.length ? Math.round((context.completions.length / context.employees.length) * 100) : 0,
    averageRating: average(ratings),
    comments: comments.length,
  };
}

function groupSurveyData(context: ReportContext, groupBy: "department" | "team" | "location") {
  return groupEmployees(context, groupBy).map((group) => {
    const employeeIds = new Set(group.employees.map((employee) => employee.id));
    return {
      ...group,
      completions: context.completions.filter((completion) => employeeIds.has(completion.userId)),
      responses: context.responses.filter((response) => {
        if (groupBy === "department") return response.departmentId === group.id;
        if (groupBy === "team") return response.teamId === group.id;
        return (response.location || "Unassigned") === group.id;
      }),
    };
  });
}

function groupEmployees(context: ReportContext, groupBy: "department" | "team" | "location") {
  const groups = new Map<string, { id: string; name: string; employees: typeof context.employees }>();

  for (const employee of context.employees) {
    const id =
      groupBy === "department"
        ? employee.departmentId
        : groupBy === "team"
          ? employee.teamId || "Unassigned"
          : employee.location || "Unassigned";
    const name =
      groupBy === "department"
        ? employee.department?.name || "Unassigned"
        : groupBy === "team"
          ? employee.team?.name || "Unassigned"
          : employee.location || "Unassigned";

    const group = groups.get(id) || { id, name, employees: [] as typeof context.employees };
    group.employees.push(employee);
    groups.set(id, group);
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function participationChartData(context: ReportContext): [string, number][] {
  return groupSurveyData(context, "department")
    .filter((group) => group.responses.length >= ANONYMITY_THRESHOLD && group.employees.length > 0)
    .map((group) => [group.name, Math.round((group.completions.length / group.employees.length) * 100)]);
}

function breakdownChartData(context: ReportContext, groupBy: "department" | "team" | "location"): [string, number][] {
  return groupSurveyData(context, groupBy)
    .filter((group) => group.responses.length >= ANONYMITY_THRESHOLD)
    .map((group) => [group.name, average(ratingValues(group.responses))]);
}

function questionChartData(context: ReportContext): [string, number][] {
  return context.survey.questions
    .filter((question) => question.type === "rating")
    .map((question) => {
      const ratings = answersForQuestion(context, question.id)
        .map((answer) => answer.ratingValue)
        .filter((value): value is number => value !== null);
      return [question.text, average(ratings)] as [string, number];
    });
}

function completionChartData(context: ReportContext): [string, number][] {
  const completed = new Set(context.completions.map((completion) => completion.userId));
  return groupEmployees(context, "department").map((group) => {
    const completedCount = group.employees.filter((employee) => completed.has(employee.id)).length;
    return [group.name, group.employees.length ? Math.round((completedCount / group.employees.length) * 100) : 0];
  });
}

function chartRows(data: [string, number][]): CellValue[][] {
  const max = Math.max(...data.map(([, value]) => value), 1);
  return [
    ["Chart Data", "Value", "Bar"],
    ...data.map(([label, value]) => [label, value, bar(value, max)]),
  ];
}

function answersForQuestion(context: ReportContext, questionId: string) {
  return context.responses.flatMap((response) =>
    response.answers.filter((answer) => answer.questionId === questionId)
  );
}

function ratingValues(responses: ReportContext["responses"]) {
  return responses
    .flatMap((response) => response.answers)
    .map((answer) => answer.ratingValue)
    .filter((value): value is number => value !== null);
}

function textAnswers(answers: ReturnType<typeof answersForQuestion>) {
  return answers
    .map((answer) => answer.textValue)
    .filter((value): value is string => Boolean(value && value.trim()));
}

function applyResponseFilters(where: Prisma.SurveyResponseWhereInput, filters: { departmentId?: string | null; teamId?: string | null; location?: string | null }) {
  const clauses: Prisma.SurveyResponseWhereInput[] = [where];
  if (filters.departmentId) clauses.push({ departmentId: filters.departmentId });
  if (filters.teamId) clauses.push({ teamId: filters.teamId });
  if (filters.location) clauses.push({ location: filters.location });
  return clauses.length === 1 ? where : { AND: clauses };
}

function applyEmployeeFilters(where: Prisma.UserWhereInput, filters: { departmentId?: string | null; teamId?: string | null; location?: string | null }) {
  const clauses: Prisma.UserWhereInput[] = [where];
  if (filters.departmentId) clauses.push({ departmentId: filters.departmentId });
  if (filters.teamId) clauses.push({ teamId: filters.teamId });
  if (filters.location) clauses.push({ location: filters.location });
  return clauses.length === 1 ? where : { AND: clauses };
}

function toXlsx(sheets: ReportSheet[]) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    worksheet["!cols"] = columnWidths(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheet.name));
  }
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

function toCsv(sheets: ReportSheet[]) {
  return `\uFEFF${sheets
    .map((sheet) => [
      [`Sheet: ${sheet.name}`],
      ...sheet.rows,
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\n"))
    .join("\n\n")}`;
}

function csvCell(value: CellValue) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function columnWidths(rows: CellValue[][]) {
  const maxCols = Math.max(...rows.map((row) => row.length), 1);
  return Array.from({ length: maxCols }, (_, column) => {
    const width = rows.reduce((max, row) => {
      const value = String(row[column] ?? "");
      return Math.max(max, Math.min(value.length + 2, 60));
    }, 12);
    return { wch: width };
  });
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report";
}

function makeFilename(surveyTitle: string, reportType: ReportType, format: "xlsx" | "csv") {
  return `${surveyTitle}_${reportType}`.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() + `.${format}`;
}

function buildScopeLabel(scope: string, filters: { departmentId?: string | null; teamId?: string | null; location?: string | null }) {
  if (scope === "company") return "Company-wide";
  const parts = [
    filters.departmentId ? `Department ${filters.departmentId}` : "",
    filters.teamId ? `Team ${filters.teamId}` : "",
    filters.location ? `Location ${filters.location}` : "",
  ].filter(Boolean);
  return parts.length ? `Current filters: ${parts.join(", ")}` : "Company-wide";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 16);
}

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function bar(value: number, max: number) {
  const length = max > 0 ? Math.round((value / max) * 24) : 0;
  return `${"#".repeat(length)}${".".repeat(Math.max(24 - length, 0))}`;
}
