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
  const [departmentCounts, divisionCounts, teamCounts, locationCounts] = await Promise.all([
    prisma.user.groupBy({
      by: ["departmentId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["division"],
      where: { status: "active", division: { not: null } },
      _count: { _all: true },
      orderBy: { division: "asc" },
    }),
    prisma.user.groupBy({
      by: ["teamId"],
      where: { status: "active", teamId: { not: null } },
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
    where: {
      id: { in: [...eligibleDepartmentCounts.keys()] },
      name: { not: "Unassigned" },
    },
    orderBy: { name: "asc" },
  });
  const eligibleTeamCounts = new Map(
    teamCounts
      .filter(
        (row): row is typeof row & { teamId: string } =>
          Boolean(row.teamId) && row._count._all >= DEMOGRAPHIC_OPTION_EMPLOYEE_THRESHOLD
      )
      .map((row) => [row.teamId, row._count._all])
  );
  const teams = await prisma.team.findMany({
    where: {
      id: { in: [...eligibleTeamCounts.keys()] },
      name: { not: "Unassigned" },
    },
    include: { department: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return {
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      employeeCount: eligibleDepartmentCounts.get(department.id) || 0,
    })),
    divisions: divisionCounts
      .filter(
        (row): row is typeof row & { division: string } =>
          Boolean(row.division) && row._count._all >= DEMOGRAPHIC_OPTION_EMPLOYEE_THRESHOLD
      )
      .map((row) => ({
        name: row.division,
        employeeCount: row._count._all,
      })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      departmentId: team.departmentId,
      departmentName: team.department.name,
      employeeCount: eligibleTeamCounts.get(team.id) || 0,
      shiftLabel: formatShiftLine(team.name),
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

function formatShiftLine(name: string) {
  const match = name.match(/line\s*([123])/i);
  if (!match) return name;
  const line = match[1];
  return line === "3" ? `Line ${line} - Nights` : `Line ${line}`;
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
