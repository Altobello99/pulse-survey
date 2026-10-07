import { isReportableGroup } from "@/lib/constants";
import {
  DEPARTMENT_GROUPS,
  departmentBelongsToGroup,
} from "@/lib/department-groups";
import { calculateEnpsBreakdown } from "@/lib/enps";

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
  enpsScore: number | null;
  enpsResponses: number;
  enpsPromoters: number;
  enpsPassives: number;
  enpsDetractors: number;
  enpsPromotersPercent: number | null;
  enpsPassivesPercent: number | null;
  enpsDetractorsPercent: number | null;
  enpsSuppressed: boolean;
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

export type DepartmentEnpsReportRow = DecisionReportMetrics & {
  id: string;
  departmentName: string;
  sites: string[];
};

export type LeaderEnpsReportRow = DecisionReportMetrics & {
  id: string;
  name: string;
  email: string;
  departments: string[];
  sites: string[];
};

export type DecisionReportData = {
  company: DecisionReportMetrics;
  departmentSites: DepartmentSiteReportRow[];
  leaders: LeaderReportRow[];
  enpsDepartments: DepartmentEnpsReportRow[];
  enpsLeaders: LeaderEnpsReportRow[];
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
  const enpsQuestionId = input.questions.find(isEnpsQuestion)?.id || null;
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
    const suppressed = !isReportableGroup(completions);
    const enpsRatings = enpsQuestionId
      ? responses.flatMap((response) =>
          response.answers
            .filter((answer) => answer.questionId === enpsQuestionId)
            .map((answer) => answer.ratingValue)
            .filter((value): value is number => value !== null)
        )
      : [];
    const enps = calculateEnpsBreakdown(enpsRatings);
    const enpsSuppressed = suppressed || !isReportableGroup(enps.responses);

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
      enpsScore: enpsSuppressed ? null : enps.score,
      enpsResponses: enps.responses,
      enpsPromoters: enps.promoters,
      enpsPassives: enps.passives,
      enpsDetractors: enps.detractors,
      enpsPromotersPercent: enps.promotersPercent,
      enpsPassivesPercent: enps.passivesPercent,
      enpsDetractorsPercent: enps.detractorsPercent,
      enpsSuppressed,
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
    company: metricsFor(input.employees, input.responses),
    departmentSites: buildDepartmentSiteRows(input, metricsFor),
    leaders: buildLeaderRows(input, managerNames, metricsFor, questionAveragesFor),
    enpsDepartments: buildDepartmentEnpsRows(input, metricsFor),
    enpsLeaders: buildLeaderEnpsRows(input, managerNames, metricsFor),
    questionAverages: questionAveragesFor(input.responses, input.completions.length),
  };
}

function buildDepartmentEnpsRows(
  input: { employees: ReportEmployee[]; responses: ReportResponse[] },
  metricsFor: (
    employees: ReportEmployee[],
    responses: ReportResponse[]
  ) => DecisionReportMetrics
) {
  const groups = new Map<
    string,
    { departmentName: string; employees: ReportEmployee[] }
  >();

  for (const employee of input.employees) {
    const group = groups.get(employee.departmentId) || {
      departmentName: employee.department.name,
      employees: [],
    };
    group.employees.push(employee);
    groups.set(employee.departmentId, group);
  }

  return [...groups.entries()]
    .map(([departmentId, group]) => ({
      id: `enps-department:${departmentId}`,
      departmentName: group.departmentName,
      sites: unique(group.employees.map((employee) => employee.location)),
      ...metricsFor(
        group.employees,
        input.responses.filter((response) => response.departmentId === departmentId)
      ),
    }))
    .sort((left, right) => left.departmentName.localeCompare(right.departmentName));
}

function buildLeaderEnpsRows(
  input: { employees: ReportEmployee[]; responses: ReportResponse[] },
  managerNames: Map<string, string>,
  metricsFor: (
    employees: ReportEmployee[],
    responses: ReportResponse[]
  ) => DecisionReportMetrics
) {
  const managerEmails = uniqueEmails(
    input.employees.map((employee) => employee.managerEmail)
  );

  return managerEmails
    .map((email) => {
      const employees = descendantsFor(input.employees, email);
      const reportingEmails = new Set([
        email,
        ...employees.map((employee) => normalizeEmail(employee.email)),
      ]);
      const responses = input.responses.filter((response) =>
        reportingEmails.has(normalizeEmail(response.managerEmail))
      );

      return {
        id: `enps-leader:${email}`,
        name: managerNames.get(email) || email,
        email,
        departments: uniqueDepartmentNames(employees),
        sites: unique(employees.map((employee) => employee.location)),
        ...metricsFor(employees, responses),
      };
    })
    .filter((row) => row.employeeCount > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function descendantsFor(employees: ReportEmployee[], managerEmail: string) {
  const byManager = new Map<string, ReportEmployee[]>();
  for (const employee of employees) {
    const email = normalizeEmail(employee.managerEmail);
    if (!email) continue;
    const reports = byManager.get(email) || [];
    reports.push(employee);
    byManager.set(email, reports);
  }

  const descendants: ReportEmployee[] = [];
  const queue = [...(byManager.get(managerEmail) || [])];
  const seen = new Set<string>();
  while (queue.length) {
    const employee = queue.shift();
    if (!employee) continue;
    const email = normalizeEmail(employee.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    descendants.push(employee);
    queue.push(...(byManager.get(email) || []));
  }
  return descendants;
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
  const isEnps = Math.min(...scale) === 0 && Math.max(...scale) === 10;
  const suppressed =
    !isReportableGroup(completionCount) ||
    (isEnps && !isReportableGroup(ratings.length));
  const enps = calculateEnpsBreakdown(ratings);

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
    enpsScore: suppressed || !isEnps ? null : enps.score,
  };
}

function isEnpsQuestion(question: ReportQuestion) {
  if (question.type !== "rating") return false;
  const scale = ratingOptions(question);
  return Math.min(...scale) === 0 && Math.max(...scale) === 10;
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

function uniqueEmails(values: Array<string | null>) {
  return [...new Set(values.map(normalizeEmail).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function uniqueDepartmentNames(employees: ReportEmployee[]) {
  return [...new Set(employees.map((employee) => employee.department.name))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}
