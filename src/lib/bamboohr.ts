import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isAdminEmail, normalizeEmail } from "@/lib/access";

const DEFAULT_COMPANY_DOMAIN = "clutchtechnologiesinc";

type BambooEmployee = {
  [key: string]: unknown;
  employeeId?: string;
  id?: string;
  employeeNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  preferredName?: string | null;
  workEmail?: string | null;
  bestEmail?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  division?: string | null;
  location?: string | null;
  team?: string | null;
  teams?: string | null;
  supervisor?: string | null;
  supervisorEmail?: string | null;
  reportsTo?: string | null;
  employmentStatus?: string | null;
  hireDate?: string | null;
};

type BambooListResponse = {
  data?: BambooEmployee[];
  meta?: {
    page?: {
      nextCursor?: string | null;
    };
  };
};

type BambooCustomReportResponse = {
  employees?: BambooEmployee[];
};

type BambooFieldMetadata = {
  id?: string | number;
  name?: string | null;
  alias?: string | null;
};

export type BambooSyncResult = {
  synced: number;
  admins: number;
  managers: number;
  deactivated: number;
  withDepartments: number;
  withDivisions: number;
  withLocations: number;
  withTeams: number;
};

const baseFields = [
  "workEmail",
  "bestEmail",
  "firstName",
  "lastName",
  "displayName",
  "preferredName",
  "jobTitle",
  "department",
  "division",
  "location",
  "team",
  "teams",
  "supervisor",
  "supervisorEmail",
  "reportsTo",
  "employmentStatus",
  "hireDate",
  "employeeNumber",
];

export async function syncBambooEmployees(): Promise<BambooSyncResult> {
  const apiKey = process.env.BAMBOOHR_API_KEY;
  const companyDomain = process.env.BAMBOOHR_COMPANY_DOMAIN || DEFAULT_COMPANY_DOMAIN;

  if (!apiKey) {
    throw new Error("BAMBOOHR_API_KEY is not configured");
  }

  const syncSource = await fetchActiveEmployees(companyDomain, apiKey);
  const employees = syncSource.employees;
  const normalized = employees
    .map((employee) => normalizeEmployee(employee, syncSource.teamFieldKeys))
    .filter((employee): employee is ReturnType<typeof normalizeEmployee> & { email: string } => Boolean(employee.email))
    .filter((employee) => isActiveEmploymentStatus(employee.employmentStatus));

  const seenEmails = new Set(normalized.map((employee) => employee.email));
  const managerEmails = new Set(
    normalized.map((employee) => employee.managerEmail).filter((email): email is string => Boolean(email))
  );

  let adminCount = 0;
  let managerCount = 0;
  const now = new Date();
  const nonAdminHash = await bcrypt.hash(randomUUID(), 10);
  const adminHash = await bcrypt.hash(process.env.ADMIN_BOOTSTRAP_PASSWORD || randomUUID(), 10);

  for (const employee of normalized) {
    const department = await prisma.department.upsert({
      where: { name: employee.department },
      create: { name: employee.department },
      update: {},
    });

    const team = employee.team
      ? await prisma.team.upsert({
          where: { name_departmentId: { name: employee.team, departmentId: department.id } },
          create: { name: employee.team, departmentId: department.id },
          update: {},
        })
      : null;

    const role = isAdminEmail(employee.email)
      ? "admin"
      : managerEmails.has(employee.email)
        ? "manager"
        : "employee";

    if (role === "admin") adminCount += 1;
    if (role === "manager") managerCount += 1;

    const existing = await prisma.user.findUnique({ where: { email: employee.email } });

    await prisma.user.upsert({
      where: { email: employee.email },
      create: {
        email: employee.email,
        name: employee.name,
        passwordHash: role === "admin" ? adminHash : nonAdminHash,
        role,
        jobTitle: employee.jobTitle,
        hireDate: employee.hireDate,
        managerEmail: employee.managerEmail,
        bambooHrId: employee.bambooHrId,
        employeeNumber: employee.employeeNumber,
        status: "active",
        location: employee.location,
        division: employee.division,
        bambooSyncedAt: now,
        departmentId: department.id,
        teamId: team?.id || null,
      },
      update: {
        name: employee.name,
        role,
        jobTitle: employee.jobTitle,
        hireDate: employee.hireDate,
        managerEmail: employee.managerEmail,
        bambooHrId: employee.bambooHrId,
        employeeNumber: employee.employeeNumber,
        status: "active",
        location: employee.location,
        division: employee.division,
        bambooSyncedAt: now,
        departmentId: department.id,
        teamId: team?.id || null,
        ...(role === "admin" && !existing ? { passwordHash: adminHash } : {}),
      },
    });
  }

  const deactivated = await prisma.user.updateMany({
    where: {
      email: { notIn: [...seenEmails] },
      role: { not: "admin" },
    },
    data: {
      status: "inactive",
      bambooSyncedAt: now,
    },
  });

  return {
    synced: normalized.length,
    admins: adminCount,
    managers: managerCount,
    deactivated: deactivated.count,
    withDepartments: normalized.filter((employee) => employee.department !== "Unassigned").length,
    withDivisions: normalized.filter((employee) => Boolean(employee.division)).length,
    withLocations: normalized.filter((employee) => Boolean(employee.location)).length,
    withTeams: normalized.filter((employee) => Boolean(employee.team)).length,
  };
}

async function fetchActiveEmployees(companyDomain: string, apiKey: string) {
  const teamFieldKeys = await discoverTeamFieldKeys(companyDomain, apiKey);
  const fields = unique([...baseFields, ...teamFieldKeys]);

  try {
    return {
      employees: await fetchEmployeesFromCustomReport(companyDomain, apiKey, fields),
      teamFieldKeys,
    };
  } catch {
    return {
      employees: await fetchEmployeesFromListEndpoint(companyDomain, apiKey, fields),
      teamFieldKeys,
    };
  }
}

async function discoverTeamFieldKeys(companyDomain: string, apiKey: string) {
  try {
    const url = new URL(`https://${companyDomain}.bamboohr.com/api/v1/meta/fields`);
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
      },
    });

    if (!res.ok) return [];

    const fields = (await res.json()) as BambooFieldMetadata[];
    return unique(
      fields
        .filter((field) => {
          const name = String(field.name || "").trim().toLowerCase();
          const alias = String(field.alias || "").trim().toLowerCase();
          return ["team", "teams"].includes(name) || ["team", "teams"].includes(alias);
        })
        .flatMap((field) => [field.alias, field.id])
        .filter((value): value is string | number => Boolean(value))
        .map(String)
    );
  } catch {
    return [];
  }
}

async function fetchEmployeesFromCustomReport(companyDomain: string, apiKey: string, fields: string[]) {
  const url = new URL(`https://${companyDomain}.bamboohr.com/api/v1/reports/custom`);
  url.searchParams.set("format", "json");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
    },
    body: JSON.stringify({
      title: "Employee Pulse Survey Sync",
      fields,
    }),
  });

  if (!res.ok) {
    throw new Error(`BambooHR custom report failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as BambooCustomReportResponse;
  return json.employees || [];
}

async function fetchEmployeesFromListEndpoint(companyDomain: string, apiKey: string, fields: string[]) {
  const employees: BambooEmployee[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`https://${companyDomain}.bamboohr.com/api/v1/employees`);
    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("filter[status]", "active");
    url.searchParams.set("page[limit]", "2500");
    if (cursor) url.searchParams.set("page[after]", cursor);

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
      },
    });

    if (!res.ok) {
      throw new Error(`BambooHR sync failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as BambooListResponse;
    employees.push(...(json.data || []));
    cursor = json.meta?.page?.nextCursor || null;
  } while (cursor);

  return employees;
}

function normalizeEmployee(employee: BambooEmployee, teamFieldKeys: string[]) {
  const email = normalizeEmail(employee.workEmail || employee.bestEmail);
  const firstName = (employee.preferredName || employee.firstName || "").trim();
  const lastName = (employee.lastName || "").trim();
  const name = (employee.displayName || `${firstName} ${lastName}`.trim() || email).trim();
  const managerEmail = extractEmail(employee.supervisorEmail || employee.supervisor || employee.reportsTo);
  const team = firstStringValue(employee, ["teams", "team", ...teamFieldKeys]);

  return {
    email,
    name,
    bambooHrId: employee.employeeId || employee.id || null,
    employeeNumber: employee.employeeNumber || null,
    jobTitle: employee.jobTitle || null,
    employmentStatus: employee.employmentStatus || null,
    department: employee.department || "Unassigned",
    division: employee.division || null,
    location: employee.location || null,
    team,
    managerEmail,
    hireDate: parseBambooDate(employee.hireDate),
  };
}

function firstStringValue(employee: BambooEmployee, keys: string[]) {
  for (const key of keys) {
    const value = employee[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return null;
}

function parseBambooDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActiveEmploymentStatus(status: string | null | undefined) {
  const normalized = (status || "").trim().toLowerCase();
  if (!normalized) return true;
  return !["inactive", "terminated", "deceased"].includes(normalized);
}

function extractEmail(value: string | null | undefined) {
  const raw = normalizeEmail(value);
  if (!raw) return null;
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return match?.[0] || null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
