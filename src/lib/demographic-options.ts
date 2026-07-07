import { prisma } from "@/lib/prisma";
import { DEMOGRAPHIC_OPTION_EMPLOYEE_THRESHOLD } from "@/lib/constants";

export type EligibleDepartmentOption = {
  id: string;
  name: string;
  employeeCount: number;
};

export type EligibleLocationOption = {
  name: string;
  employeeCount: number;
};

export async function getEligibleSurveyDemographics() {
  const [departmentCounts, locationCounts] = await Promise.all([
    prisma.user.groupBy({
      by: ["departmentId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["location"],
      where: { status: "active", location: { not: null } },
      _count: { _all: true },
      orderBy: { location: "asc" },
    }),
  ]);

  const eligibleDepartmentCounts = new Map(
    departmentCounts
      .filter((row) => row._count._all >= DEMOGRAPHIC_OPTION_EMPLOYEE_THRESHOLD)
      .map((row) => [row.departmentId, row._count._all])
  );

  const departments = await prisma.department.findMany({
    where: { id: { in: [...eligibleDepartmentCounts.keys()] } },
    orderBy: { name: "asc" },
  });

  return {
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      employeeCount: eligibleDepartmentCounts.get(department.id) || 0,
    })),
    locations: locationCounts
      .filter(
        (row): row is typeof row & { location: string } =>
          Boolean(row.location) && row._count._all >= DEMOGRAPHIC_OPTION_EMPLOYEE_THRESHOLD
      )
      .map((row) => ({
        name: row.location,
        employeeCount: row._count._all,
      })),
  };
}

export async function getAnonymousFallbackDepartmentId() {
  const department = await prisma.department.upsert({
    where: { name: "Unassigned" },
    update: {},
    create: { name: "Unassigned" },
    select: { id: true },
  });

  return department.id;
}
