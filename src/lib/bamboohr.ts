import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isAdminEmail, normalizeEmail } from "@/lib/access";

const DEFAULT_COMPANY_DOMAIN = "clutchtechnologiesinc";

type BambooEmployee = {
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
  supervisor?: string | null;
  supervisorEmail?: string | null;
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

export type BambooSyncResult = {
  synced: number;
  admins: number;
  managers: number;
  deactivated: number;
  withDepartments: number;
  withLocations: number;
};

const fields = [
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
  "supervisor",
  "supervisorEmail",
  "employmentStatus",
  "hireDate",
  "employeeNumber",
].join(",");

export async function syncBambooEmployees(): Promise<BambooSyncResult> {
  const apiKey = process.env.BAMBOOHR_API_KEY;
  const companyDomain = process.env.BAMBOOHR_COMPANY_DOMAIN || DEFAULT_COMPANY_DOMAIN;

  if (!apiKey) {
    throw new Error("BAMBOOHR_API_KEY is not configured");
  }

  const employees = await fetchActiveEmployees(companyDomain, apiKey);
  const normalized = employees
    .map(normalizeEmployee)
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

    const teamName = employee.division || employee.location || employee.department;
    const team = await prisma.team.upsert({
      where: { name_departmentId: { name: teamName, departmentId: department.id } },
      create: { name: teamName, departmentId: department.id },
      update: {},
    });

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
        teamId: team.id,
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
        teamId: team.id,
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
    withLocations: normalized.filter((employee) => Boolean(employee.location)).length,
  };
}

async function fetchActiveEmployees(companyDomain: string, apiKey: string) {
  try {
    return await fetchEmployeesFromCustomReport(companyDomain, apiKey);
  } catch {
    return fetchEmployeesFromListEndpoint(companyDomain, apiKey);
  }
}

async function fetchEmployeesFromCustomReport(companyDomain: string, apiKey: string) {
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
      fields: fields.split(","),
    }),
  });

  if (!res.ok) {
    throw new Error(`BambooHR custom report failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as BambooCustomReportResponse;
  return json.employees || [];
}

async function fetchEmployeesFromListEndpoint(companyDomain: string, apiKey: string) {
  const employees: BambooEmployee[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`https://${companyDomain}.bamboohr.com/api/v1/employees`);
    url.searchParams.set("fields", fields);
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

function normalizeEmployee(employee: BambooEmployee) {
  const email = normalizeEmail(employee.workEmail || employee.bestEmail);
  const firstName = (employee.preferredName || employee.firstName || "").trim();
  const lastName = (employee.lastName || "").trim();
  const name = (employee.displayName || `${firstName} ${lastName}`.trim() || email).trim();
  const managerEmail = extractEmail(employee.supervisorEmail || employee.supervisor);

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
    managerEmail,
    hireDate: employee.hireDate ? new Date(employee.hireDate) : null,
  };
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
