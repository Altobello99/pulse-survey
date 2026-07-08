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
  location?: string | null;
};

type SessionUser = Session["user"];

export const activeBambooEmployeeWhere = {
  status: "active",
  bambooHrId: { not: null },
} satisfies Prisma.UserWhereInput;

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
    where: activeBambooEmployeeWhere,
    select: {
      id: true,
      email: true,
      managerEmail: true,
      departmentId: true,
      division: true,
      teamId: true,
      location: true,
    },
  });

  const currentEmail = normalizeEmail(user.email);
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
  if (user.role === "admin") return activeBambooEmployeeWhere;
  if (user.role === "manager") {
    const scope = await getManagerScope(user);
    return scope.employeeIds.length
      ? { AND: [activeBambooEmployeeWhere, { id: { in: scope.employeeIds } }] }
      : { id: "__none__" };
  }
  return { AND: [activeBambooEmployeeWhere, { id: user.id }] };
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
  const scopeOr: Prisma.SurveyResponseWhereInput[] = [];

  if (scope.managerEmails.length > 0) {
    scopeOr.push({ managerEmail: { in: scope.managerEmails } });
  }
  if (scope.teamIds.length > 0) {
    scopeOr.push({ teamId: { in: scope.teamIds } });
  }
  if (scope.divisions.length > 0) {
    scopeOr.push({ division: { in: scope.divisions } });
  }
  if (scope.locations.length > 0) {
    scopeOr.push({ location: { in: scope.locations } });
  }

  if (scopeOr.length === 0) return { surveyId, id: "__none__" };

  return applyFilters({ AND: [base, { OR: scopeOr }] }, filters);
}

function applyFilters(where: Prisma.SurveyResponseWhereInput, filters: AccessFilters) {
  const clauses: Prisma.SurveyResponseWhereInput[] = [where];

  if (filters.departmentId) clauses.push({ departmentId: filters.departmentId });
  if (filters.division) clauses.push({ division: filters.division });
  if (filters.teamId) clauses.push({ teamId: filters.teamId });
  if (filters.location) clauses.push({ location: filters.location });

  return clauses.length === 1 ? where : { AND: clauses };
}

function unique(values: string[]) {
  return [...new Set(values)];
}
