import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentedBambooEmployeeWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

const BREAKDOWNS = ["department", "location", "department_location"] as const;
type Breakdown = (typeof BREAKDOWNS)[number];

type GroupDefinition = {
  id: string;
  label: string;
  departmentId: string | null;
  departmentName: string | null;
  location: string | null;
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveyId = request.nextUrl.searchParams.get("surveyId");
  if (!surveyId) {
    return Response.json({ error: "Missing surveyId" }, { status: 400 });
  }

  const requestedBreakdown = request.nextUrl.searchParams.get("breakdown") || "department_location";
  if (!BREAKDOWNS.includes(requestedBreakdown as Breakdown)) {
    return Response.json({ error: "Invalid breakdown" }, { status: 400 });
  }

  const breakdown = requestedBreakdown as Breakdown;
  const departmentIdFilter = request.nextUrl.searchParams.get("departmentId")?.trim() || null;
  const locationFilter = request.nextUrl.searchParams.get("location")?.trim() || null;

  const [survey, activeEmployees] = await Promise.all([
    prisma.survey.findUnique({
      where: { id: surveyId },
      select: {
        id: true,
        title: true,
        questions: {
          where: { type: "rating" },
          orderBy: { order: "asc" },
          select: {
            id: true,
            text: true,
            section: true,
            order: true,
            options: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: departmentedBambooEmployeeWhere,
      select: {
        departmentId: true,
        location: true,
        department: { select: { name: true } },
      },
    }),
  ]);

  if (!survey) {
    return Response.json({ error: "Survey not found" }, { status: 404 });
  }

  const departmentOptions = new Map<string, string>();
  const locationOptions = new Set<string>();
  for (const employee of activeEmployees) {
    departmentOptions.set(employee.departmentId, employee.department.name);
    if (employee.location) locationOptions.add(employee.location);
  }

  const filteredEmployees = activeEmployees.filter((employee) => {
    if (departmentIdFilter && employee.departmentId !== departmentIdFilter) return false;
    if (locationFilter && employee.location !== locationFilter) return false;
    return true;
  });

  const groupDefinitions = new Map<string, GroupDefinition>();
  for (const employee of filteredEmployees) {
    const definition = makeGroupDefinition(
      breakdown,
      employee.departmentId,
      employee.department.name,
      employee.location
    );
    groupDefinitions.set(definition.id, definition);
  }

  const filteredDepartmentIds = [...new Set(filteredEmployees.map((employee) => employee.departmentId))];
  const responses = await prisma.surveyResponse.findMany({
    where: {
      surveyId,
      departmentId: departmentIdFilter
        ? departmentIdFilter
        : { in: filteredDepartmentIds },
      ...(locationFilter ? { location: locationFilter } : {}),
    },
    select: {
      departmentId: true,
      location: true,
      department: { select: { name: true } },
      answers: {
        where: {
          questionId: { in: survey.questions.map((question) => question.id) },
          ratingValue: { not: null },
        },
        select: { questionId: true, ratingValue: true },
      },
    },
  });

  const responsesByGroup = new Map<string, typeof responses>();
  for (const response of responses) {
    const group = makeGroupDefinition(
      breakdown,
      response.departmentId,
      response.department.name,
      response.location
    );
    if (!groupDefinitions.has(group.id)) continue;

    const existing = responsesByGroup.get(group.id) || [];
    existing.push(response);
    responsesByGroup.set(group.id, existing);
  }

  const questions = survey.questions.map((question) => {
    const scale = ratingOptions(question.options);
    return {
      id: question.id,
      text: question.text,
      section: question.section || "Other",
      order: question.order,
      scaleMin: Math.min(...scale),
      scaleMax: Math.max(...scale),
    };
  });

  const groups = [...groupDefinitions.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((group) => {
      const groupResponses = responsesByGroup.get(group.id) || [];
      const responseCount = groupResponses.length;
      const status = responseCount === 0
        ? "no_responses"
        : responseCount < ANONYMITY_THRESHOLD
          ? "suppressed"
          : "available";

      return {
        ...group,
        responseCount: status === "available" ? responseCount : null,
        status,
        ratings: questions.map((question) => {
          const values = groupResponses.flatMap((response) =>
            response.answers
              .filter((answer) => answer.questionId === question.id)
              .map((answer) => answer.ratingValue)
              .filter((value): value is number => value !== null)
          );

          return {
            questionId: question.id,
            average: status === "available" && values.length >= ANONYMITY_THRESHOLD
              ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
              : null,
          };
        }),
      };
    });

  return Response.json({
    data: {
      survey: { id: survey.id, title: survey.title },
      breakdown,
      questions,
      groups,
      filterOptions: {
        departments: [...departmentOptions.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        locations: [...locationOptions].sort((a, b) => a.localeCompare(b)),
      },
      threshold: ANONYMITY_THRESHOLD,
    },
  });
}

function makeGroupDefinition(
  breakdown: Breakdown,
  departmentId: string,
  departmentName: string,
  location: string | null
): GroupDefinition {
  const locationLabel = location || "Location not recorded";

  if (breakdown === "department") {
    return {
      id: `department:${departmentId}`,
      label: departmentName,
      departmentId,
      departmentName,
      location: null,
    };
  }

  if (breakdown === "location") {
    return {
      id: `location:${locationLabel}`,
      label: locationLabel,
      departmentId: null,
      departmentName: null,
      location,
    };
  }

  return {
    id: `department-location:${departmentId}:${locationLabel}`,
    label: `${departmentName} - ${locationLabel}`,
    departmentId,
    departmentName,
    location,
  };
}

function ratingOptions(options: string | null) {
  if (!options) return [1, 2, 3, 4, 5];

  try {
    const parsed = JSON.parse(options);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];
    const values = parsed
      .map((option) => Number(option))
      .filter((option) => Number.isInteger(option));
    return values.length ? values : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}
