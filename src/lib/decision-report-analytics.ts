import { isReportableGroup } from "@/lib/constants";
import {
  DEPARTMENT_GROUPS,
  departmentBelongsToGroup,
} from "@/lib/department-groups";

type ReportQuestion = {
  id: string;
  section: string | null;
  text: string;
  type: string;
  order: number;
  options: string | null;
};

type ReportEmployee = {
  id: string;
  email: string;
  name: string;
  departmentId: string;
  department: { id: string; name: string };
  managerEmail: string | null;
  location: string | null;
};

type ReportResponse = {
  id: string;
  departmentId: string;
  department: { id: string; name: string };
  managerEmail: string | null;
  location: string | null;
  answers: Array<{
    questionId: string;
    ratingValue: number | null;
  }>;
};

type ReportCompletion = { userId: string };
type ManagerDirectoryEntry = { email: string; name: string };

export type DecisionReportMetrics = {
  employeeCount: number;
  completions: number;
  responses: number;
  participationRate: number;
  averageRating: number | null;
  ratingScaleMax: 5;
  suppressed: boolean;
};

export type DepartmentSiteReportRow = DecisionReportMetrics & {
  id: string;
  groupType: "production" | "department";
  departmentName: string;
  site: string;
  siteLabel: string;
};

export type QuestionAverageReportRow = {
  id: string;
  order: number;
  section: string | null;
  question: string;
  responses: number;
  average: number | null;
  scaleMin: number;
  scaleMax: number;
  suppressed: boolean;
  isEnps: boolean;
  enpsScore: number | null;
};

export type LeaderReportRow = DecisionReportMetrics & {
  id: string;
  name: string;
  email: string | null;
  questionAverages: QuestionAverageReportRow[];
};

export type DecisionReportData = {
  departmentSites: DepartmentSiteReportRow[];
  leaders: LeaderReportRow[];
  questionAverages: QuestionAverageReportRow[];
};

export function buildDecisionReportData(input: {
  questions: ReportQuestion[];
  employees: ReportEmployee[];
  responses: ReportResponse[];
  completions: ReportCompletion[];
  managerDirectory?: ManagerDirectoryEntry[];
}): DecisionReportData {
  const completionIds = new Set(input.completions.map((completion) => completion.userId));
  const standardQuestionIds = new Set(
    input.questions
      .filter((question) => isStandardRatingQuestion(question))
      .map((question) => question.id)
  );
  const managerNames = new Map(
    (input.managerDirectory || []).map((manager) => [
      normalizeEmail(manager.email),
      manager.name,
    ])
  );

  const metricsFor = (employees: ReportEmployee[], responses: ReportResponse[]) => {
    const ratings = responses.flatMap((response) =>
      response.answers
        .filter((answer) => standardQuestionIds.has(answer.questionId))
        .map((answer) => answer.ratingValue)
        .filter((value): value is number => value !== null)
    );
    const completions = employees.filter((employee) => completionIds.has(employee.id)).length;
    const suppressed = !isReportableGroup(completions, responses.length);

    return {
      employeeCount: employees.length,
      completions,
      responses: responses.length,
      participationRate: employees.length
        ? Math.round((completions / employees.length) * 100)
        : 0,
      averageRating: suppressed ? null : average(ratings),
      ratingScaleMax: 5 as const,
      suppressed,
    };
  };

  const questionAveragesFor = (
    responses: ReportResponse[],
    completionCount: number
  ) =>
    input.questions
      .filter((question) => question.type === "rating")
      .map((question) => buildQuestionAverage(question, responses, completionCount));

  return {
    departmentSites: buildDepartmentSiteRows(input, metricsFor),
    leaders: buildLeaderRows(input, managerNames, metricsFor, questionAveragesFor),
    questionAverages: questionAveragesFor(input.responses, input.completions.length),
  };
}

function buildDepartmentSiteRows(
  input: {
    employees: ReportEmployee[];
    responses: ReportResponse[];
  },
  metricsFor: (
    employees: ReportEmployee[],
    responses: ReportResponse[]
  ) => DecisionReportMetrics
) {
  const rows: DepartmentSiteReportRow[] = [];
  const production = DEPARTMENT_GROUPS.find((group) => group.id === "production");

  if (production) {
    const productionEmployees = input.employees.filter((employee) =>
      departmentBelongsToGroup(employee.department.name, production)
    );
    const productionResponses = input.responses.filter((response) =>
      departmentBelongsToGroup(response.department.name, production)
    );

    for (const site of unique(productionEmployees.map((employee) => employee.location))) {
      const employees = productionEmployees.filter(
        (employee) => normalizeGroupValue(employee.location) === site
      );
      const responses = productionResponses.filter(
        (response) => normalizeGroupValue(response.location) === site
      );
      rows.push({
        id: `production:${site}`,
        groupType: "production",
        departmentName: "Production Total",
        site,
        siteLabel: shortSiteLabel(site),
        ...metricsFor(employees, responses),
      });
    }
  }

  const employeeGroups = new Map<
    string,
    { departmentId: string; departmentName: string; site: string; employees: ReportEmployee[] }
  >();
  for (const employee of input.employees) {
    const site = normalizeGroupValue(employee.location);
    const key = `${employee.departmentId}:${site}`;
    const group = employeeGroups.get(key) || {
      departmentId: employee.departmentId,
      departmentName: employee.department.name,
      site,
      employees: [],
    };
    group.employees.push(employee);
    employeeGroups.set(key, group);
  }

  for (const [key, group] of employeeGroups) {
    const responses = input.responses.filter(
      (response) =>
        response.departmentId === group.departmentId &&
        normalizeGroupValue(response.location) === group.site
    );
    rows.push({
      id: `department:${key}`,
      groupType: "department",
      departmentName: group.departmentName,
      site: group.site,
      siteLabel: shortSiteLabel(group.site),
      ...metricsFor(group.employees, responses),
    });
  }

  return rows.sort((left, right) => {
    if (left.groupType !== right.groupType) return left.groupType === "production" ? -1 : 1;
    return (
      left.siteLabel.localeCompare(right.siteLabel) ||
      left.departmentName.localeCompare(right.departmentName)
    );
  });
}

function buildLeaderRows(
  input: {
    questions: ReportQuestion[];
    employees: ReportEmployee[];
    responses: ReportResponse[];
  },
  managerNames: Map<string, string>,
  metricsFor: (
    employees: ReportEmployee[],
    responses: ReportResponse[]
  ) => DecisionReportMetrics,
  questionAveragesFor: (
    responses: ReportResponse[],
    completionCount: number
  ) => QuestionAverageReportRow[]
) {
  const groups = new Map<string, ReportEmployee[]>();
  for (const employee of input.employees) {
    const email = normalizeEmail(employee.managerEmail) || "not-listed";
    const employees = groups.get(email) || [];
    employees.push(employee);
    groups.set(email, employees);
  }

  return [...groups.entries()]
    .map(([email, employees]) => {
      const responses = input.responses.filter(
        (response) => (normalizeEmail(response.managerEmail) || "not-listed") === email
      );
      const emailValue = email === "not-listed" ? null : email;
      const metrics = metricsFor(employees, responses);
      return {
        id: email,
        name: emailValue
          ? managerNames.get(email) || email
          : "No leader listed in BambooHR",
        email: emailValue,
        ...metrics,
        questionAverages: questionAveragesFor(responses, metrics.completions),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildQuestionAverage(
  question: ReportQuestion,
  responses: ReportResponse[],
  completionCount: number
) {
  const scale = ratingOptions(question);
  const ratings = responses.flatMap((response) =>
    response.answers
      .filter((answer) => answer.questionId === question.id)
      .map((answer) => answer.ratingValue)
      .filter((value): value is number => value !== null)
  );
  const suppressed = !isReportableGroup(completionCount, ratings.length);
  const isEnps = Math.min(...scale) === 0 && Math.max(...scale) === 10;

  return {
    id: question.id,
    order: question.order,
    section: question.section,
    question: question.text,
    responses: ratings.length,
    average: suppressed ? null : average(ratings),
    scaleMin: Math.min(...scale),
    scaleMax: Math.max(...scale),
    suppressed,
    isEnps,
    enpsScore: suppressed || !isEnps ? null : calculateEnps(ratings),
  };
}

function isStandardRatingQuestion(question: ReportQuestion) {
  if (question.type !== "rating") return false;
  const scale = ratingOptions(question);
  return Math.min(...scale) === 1 && Math.max(...scale) === 5;
}

function ratingOptions(question: Pick<ReportQuestion, "options">) {
  if (!question.options) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(question.options);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];
    const values = parsed
      .map((option) => Number(option))
      .filter((option) => Number.isInteger(option));
    return values.length ? values : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function calculateEnps(ratings: number[]) {
  if (!ratings.length) return null;
  const promoters = ratings.filter((rating) => rating >= 9).length;
  const detractors = ratings.filter((rating) => rating <= 6).length;
  return Math.round(((promoters - detractors) / ratings.length) * 100);
}

function shortSiteLabel(site: string) {
  if (site === "Not listed") return site;
  const name = site
    .replace(/^\d+\s+/, "")
    .split(/\s+[\u2013\u2014-]\s+/)[0]
    .trim();
  const normalized = name.toLowerCase();
  const alias = normalized.includes("wolfedale")
    ? "WD"
    : normalized.includes("goldthorne")
      ? "GT"
      : null;
  return alias ? `${name} (${alias})` : name || site;
}

function normalizeGroupValue(value: string | null) {
  return value?.trim() || "Not listed";
}

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function unique(values: Array<string | null>) {
  return [...new Set(values.map(normalizeGroupValue))].sort((a, b) => a.localeCompare(b));
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}
