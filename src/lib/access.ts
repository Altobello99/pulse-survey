import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "michael-anthony.altobello@clutch.ca")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

export type AccessFilters = {
  departmentId?: string | null;
  division?: string | null;
  teamId?: string | null;
  teamIds?: string[] | null;
  location?: string | null;
};

type SessionUser = Session["user"];

const employeeEmailDomain = (
  process.env.GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase() || "clutch.ca"
).replace(/^@/, "");

export const activeBambooEmployeeWhere = {
  status: "active",
  bambooHrId: { not: null },
  email: { endsWith: `@${employeeEmailDomain}` },
} satisfies Prisma.UserWhereInput;

export const departmentedBambooEmployeeWhere = {
  AND: [
    activeBambooEmployeeWhere,
    { department: { name: { not: "Unassigned" } } },
  ],
} satisfies Prisma.UserWhereInput;

export function surveyHireDateWhere(surveyStartDate: Date): Prisma.UserWhereInput {
  return { hireDate: { lt: surveyStartDay(surveyStartDate) } };
}

export function surveyRosterEmployeeWhere(
  surveyStartDate: Date
): Prisma.UserWhereInput {
  return {
    AND: [departmentedBambooEmployeeWhere, surveyHireDateWhere(surveyStartDate)],
  };
}

export function isOnSurveyOpeningRoster(
  hireDate: Date | null | undefined,
  surveyStartDate: Date
) {
  return Boolean(hireDate && hireDate < surveyStartDay(surveyStartDate));
}

export function normalizeEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.has(normalizeEmail(email));
}

export function canManageSurveys(user: SessionUser) {
  return user.role === "admin";
}

export function canViewResults(user: SessionUser) {
  return user.role === "admin" || user.role === "manager";
}

export function canViewRawComments(user: SessionUser) {
  return user.role === "admin";
}

export async function getManagerScope(user: SessionUser) {
  if (user.role === "admin") {
    return {
      companyWide: true,
      employeeIds: [] as string[],
      employeeEmails: [] as string[],
      managerEmails: [] as string[],
      departmentIds: [] as string[],
      divisions: [] as string[],
      teamIds: [] as string[],
      locations: [] as string[],
    };
  }

  const allActiveUsers = await prisma.user.findMany({
    where: departmentedBambooEmployeeWhere,
    select: {
      id: true,
      email: true,
      jobTitle: true,
      managerEmail: true,
      departmentId: true,
      division: true,
      teamId: true,
      location: true,
    },
  });

  const currentEmail = normalizeEmail(user.email);
  const currentUser = allActiveUsers.find(
    (employee) => normalizeEmail(employee.email) === currentEmail
  );
  const companyWide = isCompanyWideExecutive(currentUser?.jobTitle);

  if (companyWide) {
    const employeeEmails = allActiveUsers.map((employee) => normalizeEmail(employee.email));
    return {
      companyWide: true,
      employeeIds: allActiveUsers.map((employee) => employee.id),
      employeeEmails,
      managerEmails: unique([currentEmail, ...employeeEmails]),
      departmentIds: unique(allActiveUsers.map((employee) => employee.departmentId)),
      divisions: unique(
        allActiveUsers
          .map((employee) => employee.division)
          .filter((division): division is string => Boolean(division))
      ),
      teamIds: unique(
        allActiveUsers
          .map((employee) => employee.teamId)
          .filter((id): id is string => Boolean(id))
      ),
      locations: unique(
        allActiveUsers
          .map((employee) => employee.location)
          .filter((location): location is string => Boolean(location))
      ),
    };
  }

  const directReportsByManager = new Map<string, typeof allActiveUsers>();

  for (const employee of allActiveUsers) {
    const managerEmail = normalizeEmail(employee.managerEmail);
    if (!managerEmail) continue;
    const reports = directReportsByManager.get(managerEmail) || [];
    reports.push(employee);
    directReportsByManager.set(managerEmail, reports);
  }

  const scopedEmployees: typeof allActiveUsers = [];
  const queue = [...(directReportsByManager.get(currentEmail) || [])];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const employee = queue.shift();
    if (!employee || seen.has(employee.email)) continue;

    seen.add(employee.email);
    scopedEmployees.push(employee);
    queue.push(...(directReportsByManager.get(normalizeEmail(employee.email)) || []));
  }

  const scopedEmails = scopedEmployees.map((employee) => normalizeEmail(employee.email));
  const scopedManagerEmails = [currentEmail, ...scopedEmails].filter((email, index, arr) => {
    return email && arr.indexOf(email) === index;
  });

  return {
    companyWide: false,
    employeeIds: scopedEmployees.map((employee) => employee.id),
    employeeEmails: scopedEmails,
    managerEmails: scopedManagerEmails,
    departmentIds: unique(scopedEmployees.map((employee) => employee.departmentId)),
    divisions: unique(scopedEmployees.map((employee) => employee.division).filter((division): division is string => Boolean(division))),
    teamIds: unique(scopedEmployees.map((employee) => employee.teamId).filter((id): id is string => Boolean(id))),
    locations: unique(scopedEmployees.map((employee) => employee.location).filter((location): location is string => Boolean(location))),
  };
}

export async function getScopedEmployeeWhere(user: SessionUser): Promise<Prisma.UserWhereInput> {
  if (user.role === "admin") return departmentedBambooEmployeeWhere;
  if (user.role === "manager") {
    const scope = await getManagerScope(user);
    if (scope.companyWide) return departmentedBambooEmployeeWhere;
    return scope.employeeIds.length
      ? { AND: [departmentedBambooEmployeeWhere, { id: { in: scope.employeeIds } }] }
      : { id: "__none__" };
  }
  return { AND: [departmentedBambooEmployeeWhere, { id: user.id }] };
}

export async function getScopedResponseWhere(
  user: SessionUser,
  surveyId: string,
  filters: AccessFilters = {}
): Promise<Prisma.SurveyResponseWhereInput> {
  const base: Prisma.SurveyResponseWhereInput = { surveyId };

  if (user.role === "admin") {
    return applyFilters(base, filters);
  }

  if (user.role !== "manager") {
    return { surveyId, id: "__none__" };
  }

  const scope = await getManagerScope(user);
  if (scope.companyWide) return applyFilters(base, filters);
  if (scope.managerEmails.length === 0) return { surveyId, id: "__none__" };

  // Responses store only the respondent's BambooHR manager email. Including
  // each manager in the reporting tree covers direct and indirect reports
  // without widening access to unrelated employees who share demographics.
  return applyFilters(
    { AND: [base, { managerEmail: { in: scope.managerEmails } }] },
    filters
  );
}

function isCompanyWideExecutive(jobTitle: string | null | undefined) {
  const normalizedTitle = (jobTitle || "").trim().toLowerCase();
  return normalizedTitle === "ceo" || normalizedTitle === "chief executive officer";
}

function applyFilters(where: Prisma.SurveyResponseWhereInput, filters: AccessFilters) {
  const clauses: Prisma.SurveyResponseWhereInput[] = [where];

  if (filters.departmentId) clauses.push({ departmentId: filters.departmentId });
  if (filters.division) clauses.push({ division: filters.division });
  if (filters.teamIds) clauses.push({ teamId: { in: filters.teamIds } });
  else if (filters.teamId) clauses.push({ teamId: filters.teamId });
  if (filters.location) clauses.push({ location: filters.location });

  return clauses.length === 1 ? where : { AND: clauses };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function surveyStartDay(surveyStartDate: Date) {
  const date = new Date(surveyStartDate);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
