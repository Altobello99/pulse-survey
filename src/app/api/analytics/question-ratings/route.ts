import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentedBambooEmployeeWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import {
  DEPARTMENT_GROUPS,
  departmentBelongsToGroup,
  findDepartmentGroup,
} from "@/lib/department-groups";

const BREAKDOWNS = ["overall", "department", "location", "department_location"] as const;
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
  const departmentGroupIdFilter = request.nextUrl.searchParams.get("departmentGroup")?.trim() || null;
  const locationFilter = request.nextUrl.searchParams.get("location")?.trim() || null;
  const departmentGroupFilter = findDepartmentGroup(departmentGroupIdFilter);

  if (departmentGroupIdFilter && !departmentGroupFilter) {
    return Response.json({ error: "Invalid department group" }, { status: 400 });
  }

  if (departmentIdFilter && departmentGroupFilter) {
    return Response.json(
      { error: "Choose either a department or a department group" },
      { status: 400 }
    );
  }

  const [survey, activeEmployees] = await Promise.all([
    prisma.survey.findUnique({
      where: { id: surveyId },
      select: {
        id: true,
        title: true,
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            text: true,
            section: true,
            type: true,
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

  const ratingQuestions = survey.questions.filter((question) => question.type === "rating");
  const enpsQuestion = ratingQuestions.find((question) => {
    const scale = ratingOptions(question.options);
    return Math.min(...scale) === 0 && Math.max(...scale) === 10 &&
      /recommend.+place to work/i.test(question.text);
  }) || null;
  const bestFriendQuestion = survey.questions.find(
    (question) => question.type === "multiple_choice" && /best friend at work/i.test(question.text)
  ) || null;
  const analyticsQuestionIds = [
    ...ratingQuestions.map((question) => question.id),
    ...(bestFriendQuestion ? [bestFriendQuestion.id] : []),
  ];

  const departmentOptions = new Map<string, string>();
  const locationOptions = new Set<string>();
  for (const employee of activeEmployees) {
    departmentOptions.set(employee.departmentId, employee.department.name);
    if (employee.location) locationOptions.add(employee.location);
  }

  const filteredEmployees = activeEmployees.filter((employee) => {
    if (departmentIdFilter && employee.departmentId !== departmentIdFilter) return false;
    if (
      departmentGroupFilter &&
      !departmentBelongsToGroup(employee.department.name, departmentGroupFilter)
    ) return false;
    if (locationFilter && employee.location !== locationFilter) return false;
    return true;
  });

  const overallLabel = buildOverallLabel({
    departmentName: departmentIdFilter ? departmentOptions.get(departmentIdFilter) || null : null,
    departmentGroupName: departmentGroupFilter?.name || null,
    location: locationFilter,
  });

  const groupDefinitions = new Map<string, GroupDefinition>();
  for (const employee of filteredEmployees) {
    const definition = makeGroupDefinition(
      breakdown,
      employee.departmentId,
      employee.department.name,
      employee.location,
      overallLabel
    );
    groupDefinitions.set(definition.id, definition);
  }

  const filteredDepartmentIds = [...new Set(filteredEmployees.map((employee) => employee.departmentId))];
  const responses = await prisma.surveyResponse.findMany({
    where: {
      surveyId,
      departmentId: { in: filteredDepartmentIds },
      ...(locationFilter ? { location: locationFilter } : {}),
    },
    select: {
      departmentId: true,
      location: true,
      department: { select: { name: true } },
      answers: {
        where: {
          questionId: { in: analyticsQuestionIds },
          OR: [
            { ratingValue: { not: null } },
            { choiceValue: { not: null } },
          ],
        },
        select: { questionId: true, ratingValue: true, choiceValue: true },
      },
    },
  });

  const responsesByGroup = new Map<string, typeof responses>();
  for (const response of responses) {
    const group = makeGroupDefinition(
      breakdown,
      response.departmentId,
      response.department.name,
      response.location,
      overallLabel
    );
    if (!groupDefinitions.has(group.id)) continue;

    const existing = responsesByGroup.get(group.id) || [];
    existing.push(response);
    responsesByGroup.set(group.id, existing);
  }

  const questions = ratingQuestions.map((question) => {
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

  const enpsValues = enpsQuestion
    ? responses.flatMap((response) =>
        response.answers
          .filter((answer) => answer.questionId === enpsQuestion.id)
          .map((answer) => answer.ratingValue)
          .filter((value): value is number => value !== null)
      )
    : [];
  const enpsStatus = metricStatus(Boolean(enpsQuestion), enpsValues.length);
  const promoters = enpsValues.filter((value) => value >= 9).length;
  const passives = enpsValues.filter((value) => value >= 7 && value <= 8).length;
  const detractors = enpsValues.filter((value) => value <= 6).length;
  const enpsScore = enpsValues.length
    ? Math.round(((promoters - detractors) / enpsValues.length) * 100)
    : null;

  const bestFriendChoices = bestFriendQuestion
    ? responses.flatMap((response) =>
        response.answers
          .filter((answer) => answer.questionId === bestFriendQuestion.id)
          .map((answer) => answer.choiceValue?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value))
      )
    : [];
  const bestFriendStatus = metricStatus(Boolean(bestFriendQuestion), bestFriendChoices.length);
  const friendYes = bestFriendChoices.filter((value) => value === "yes").length;
  const friendNo = bestFriendChoices.filter((value) => value === "no").length;
  const friendPreferNotToSay = bestFriendChoices.filter(
    (value) => value === "prefer not to say"
  ).length;

  return Response.json({
    data: {
      survey: { id: survey.id, title: survey.title },
      breakdown,
      questions,
      groups,
      metrics: {
        enps: {
          questionText: enpsQuestion?.text || null,
          status: enpsStatus,
          totalResponses: enpsStatus === "available" ? enpsValues.length : null,
          score: enpsStatus === "available" ? enpsScore : null,
          promotersCount: enpsStatus === "available" ? promoters : null,
          passivesCount: enpsStatus === "available" ? passives : null,
          detractorsCount: enpsStatus === "available" ? detractors : null,
          promotersPercent: enpsStatus === "available"
            ? percentage(promoters, enpsValues.length)
            : null,
          passivesPercent: enpsStatus === "available"
            ? percentage(passives, enpsValues.length)
            : null,
          detractorsPercent: enpsStatus === "available"
            ? percentage(detractors, enpsValues.length)
            : null,
        },
        bestFriend: {
          questionText: bestFriendQuestion?.text || null,
          status: bestFriendStatus,
          totalResponses: bestFriendStatus === "available" ? bestFriendChoices.length : null,
          yesPercent: bestFriendStatus === "available"
            ? percentage(friendYes, bestFriendChoices.length)
            : null,
          noPercent: bestFriendStatus === "available"
            ? percentage(friendNo, bestFriendChoices.length)
            : null,
          preferNotToSayPercent: bestFriendStatus === "available"
            ? percentage(friendPreferNotToSay, bestFriendChoices.length)
            : null,
        },
      },
      filterOptions: {
        departments: [...departmentOptions.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        departmentGroups: DEPARTMENT_GROUPS.map((group) => {
          const groupedDepartments = [...departmentOptions.entries()]
            .filter(([, name]) => departmentBelongsToGroup(name, group))
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

          return {
            id: group.id,
            name: group.name,
            departmentCodes: [...group.departmentCodes],
            departmentIds: groupedDepartments.map((department) => department.id),
          };
        }).filter((group) => group.departmentIds.length > 0),
        locations: [...locationOptions].sort((a, b) => a.localeCompare(b)),
      },
      threshold: ANONYMITY_THRESHOLD,
    },
  });
}

function metricStatus(questionExists: boolean, responseCount: number) {
  if (!questionExists) return "not_configured" as const;
  if (responseCount === 0) return "no_responses" as const;
  if (responseCount < ANONYMITY_THRESHOLD) return "suppressed" as const;
  return "available" as const;
}

function percentage(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0;
}

function makeGroupDefinition(
  breakdown: Breakdown,
  departmentId: string,
  departmentName: string,
  location: string | null,
  overallLabel: string
): GroupDefinition {
  const locationLabel = location || "Location not recorded";

  if (breakdown === "overall") {
    return {
      id: "overall",
      label: overallLabel,
      departmentId: null,
      departmentName: null,
      location: null,
    };
  }

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

function buildOverallLabel({
  departmentName,
  departmentGroupName,
  location,
}: {
  departmentName: string | null;
  departmentGroupName: string | null;
  location: string | null;
}) {
  const scope = departmentGroupName
    ? `${departmentGroupName} combined`
    : departmentName || "All departments";
  return location ? `${scope} - ${location}` : scope;
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
