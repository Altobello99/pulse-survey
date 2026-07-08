import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import {
  canViewRawComments,
  canViewResults,
  getScopedEmployeeWhere,
  getScopedResponseWhere,
  type AccessFilters,
} from "@/lib/access";
import type { Prisma } from "@/generated/prisma/client";

type FilterOption = {
  id: string;
  name: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canViewResults(session.user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const filters = getFilters(request);

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      sentimentAnalyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
    },
  });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  const responseWhere = await getScopedResponseWhere(session.user, surveyId, filters);
  const responses = await prisma.surveyResponse.findMany({
    where: responseWhere,
    include: { answers: true, department: true, team: true },
  });

  const employeeWhere = applyEmployeeFilters(
    await getScopedEmployeeWhere(session.user),
    filters
  );
  const totalEmployees = await prisma.user.count({ where: employeeWhere });
  const completions = await prisma.surveyCompletion.count({
    where: { surveyId, user: employeeWhere },
  });

  const filterOptions = await getFilterOptions(session.user);
  const canShowDetailedResults =
    session.user.role === "admin" || responses.length >= ANONYMITY_THRESHOLD;

  if (!canShowDetailedResults) {
    return Response.json({
      data: {
        survey,
        questionResults: [],
        participationRate: totalEmployees ? Math.round((completions / totalEmployees) * 100) : 0,
        totalResponses: responses.length,
        totalEmployees,
        completions,
        sentiment: null,
        departmentBreakdown: [],
        divisionBreakdown: [],
        teamBreakdown: [],
        locationBreakdown: [],
        filterOptions,
        suppressed: true,
        suppressionMessage: `Results are hidden until at least ${ANONYMITY_THRESHOLD} people in this group respond.`,
      },
    });
  }

  const showRawComments = canViewRawComments(session.user);
  const questionResults = survey.questions.map((question) => {
    const qAnswers = responses.flatMap((response) =>
      response.answers.filter((answer) => answer.questionId === question.id)
    );

    if (question.type === "rating") {
      const ratings = qAnswers
        .map((answer) => answer.ratingValue)
        .filter((value): value is number => value !== null);
      const avg = ratings.length
        ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
        : 0;
      const distribution = ratingOptions(question).map((rating) => ({
        rating,
        count: ratings.filter((value) => value === rating).length,
      }));
      return {
        ...question,
        resultType: "rating" as const,
        average: Math.round(avg * 10) / 10,
        distribution,
        total: ratings.length,
      };
    }

    if (question.type === "multiple_choice") {
      const choices = qAnswers
        .map((answer) => answer.choiceValue)
        .filter((value): value is string => value !== null);
      const options: string[] = question.options ? JSON.parse(question.options) : [];
      const distribution = options.map((option) => ({
        option,
        count: choices.filter((choice) => choice === option).length,
      }));
      return {
        ...question,
        resultType: "multiple_choice" as const,
        distribution,
        total: choices.length,
      };
    }

    const texts = qAnswers
      .map((answer) => answer.textValue)
      .filter((value): value is string => value !== null && value.trim() !== "");

    return {
      ...question,
      resultType: "free_text" as const,
      responses: showRawComments ? texts : [],
      total: texts.length,
      rawResponsesHidden: !showRawComments,
    };
  });

  const departmentBreakdown = await buildDepartmentBreakdown(surveyId, responseWhere, employeeWhere);
  const divisionBreakdown = await buildDivisionBreakdown(surveyId, responseWhere, employeeWhere);
  const teamBreakdown = await buildTeamBreakdown(surveyId, responseWhere, employeeWhere);
  const locationBreakdown = await buildLocationBreakdown(surveyId, responseWhere, employeeWhere);

  return Response.json({
    data: {
      survey: {
        ...survey,
        allowAnonymous: survey.allowAnonymous,
        publicToken: survey.publicToken,
      },
      questionResults,
      participationRate: totalEmployees ? Math.round((completions / totalEmployees) * 100) : 0,
      totalResponses: responses.length,
      totalEmployees,
      completions,
      sentiment: survey.sentimentAnalyses[0] || null,
      departmentBreakdown,
      divisionBreakdown,
      teamBreakdown,
      locationBreakdown,
      filterOptions,
      suppressed: false,
    },
  });
}

function ratingOptions(question: { options: string | null }) {
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

function getFilters(request: NextRequest): AccessFilters {
  const params = request.nextUrl.searchParams;
  return {
    departmentId: params.get("departmentId"),
    division: params.get("division"),
    teamId: params.get("teamId"),
    location: params.get("location"),
  };
}

function applyEmployeeFilters(where: Prisma.UserWhereInput, filters: AccessFilters) {
  const clauses: Prisma.UserWhereInput[] = [where];
  if (filters.departmentId) clauses.push({ departmentId: filters.departmentId });
  if (filters.division) clauses.push({ division: filters.division });
  if (filters.teamId) clauses.push({ teamId: filters.teamId });
  if (filters.location) clauses.push({ location: filters.location });
  return clauses.length === 1 ? where : { AND: clauses };
}

async function getFilterOptions(user: Session["user"]) {
  const employeeWhere = await getScopedEmployeeWhere(user);
  const employees = await prisma.user.findMany({
    where: employeeWhere,
    select: {
      location: true,
      division: true,
      department: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return {
    departments: uniqueBy(
      employees.map((employee) => employee.department).filter(Boolean),
      "id"
    ),
    divisions: [...new Set(employees.map((employee) => employee.division).filter(Boolean))],
    teams: uniqueBy(
      employees
        .map((employee) => employee.team)
        .filter((team): team is FilterOption => Boolean(team)),
      "id"
    ),
    locations: [...new Set(employees.map((employee) => employee.location).filter(Boolean))],
  };
}

async function buildDivisionBreakdown(
  surveyId: string,
  responseWhere: Prisma.SurveyResponseWhereInput,
  employeeWhere: Prisma.UserWhereInput
) {
  const divisions = await prisma.user.findMany({
    where: { AND: [employeeWhere, { division: { not: null } }] },
    distinct: ["division"],
    select: { division: true },
    orderBy: { division: "asc" },
  });

  return Promise.all(
    divisions
      .filter((row): row is { division: string } => Boolean(row.division))
      .map(async ({ division }) => {
        const scopedResponseWhere = {
          AND: [responseWhere, { division }],
        } satisfies Prisma.SurveyResponseWhereInput;
        return buildBreakdownRow(
          surveyId,
          division,
          division,
          scopedResponseWhere,
          { AND: [employeeWhere, { division }] }
        );
      })
  );
}

async function buildDepartmentBreakdown(
  surveyId: string,
  responseWhere: Prisma.SurveyResponseWhereInput,
  employeeWhere: Prisma.UserWhereInput
) {
  const departments = await prisma.department.findMany({
    where: { users: { some: employeeWhere } },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    departments.map(async (department) => {
      const scopedResponseWhere = {
        AND: [responseWhere, { departmentId: department.id }],
      } satisfies Prisma.SurveyResponseWhereInput;
      return buildBreakdownRow(
        surveyId,
        department.id,
        department.name,
        scopedResponseWhere,
        { AND: [employeeWhere, { departmentId: department.id }] }
      );
    })
  );
}

async function buildTeamBreakdown(
  surveyId: string,
  responseWhere: Prisma.SurveyResponseWhereInput,
  employeeWhere: Prisma.UserWhereInput
) {
  const teams = await prisma.team.findMany({
    where: { users: { some: employeeWhere } },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    teams.map(async (team) => {
      const scopedResponseWhere = {
        AND: [responseWhere, { teamId: team.id }],
      } satisfies Prisma.SurveyResponseWhereInput;
      return buildBreakdownRow(
        surveyId,
        team.id,
        team.name,
        scopedResponseWhere,
        { AND: [employeeWhere, { teamId: team.id }] }
      );
    })
  );
}

async function buildLocationBreakdown(
  surveyId: string,
  responseWhere: Prisma.SurveyResponseWhereInput,
  employeeWhere: Prisma.UserWhereInput
) {
  const locations = await prisma.user.findMany({
    where: { AND: [employeeWhere, { location: { not: null } }] },
    distinct: ["location"],
    select: { location: true },
    orderBy: { location: "asc" },
  });

  return Promise.all(
    locations
      .filter((location): location is { location: string } => Boolean(location.location))
      .map(async ({ location }) => {
        const scopedResponseWhere = {
          AND: [responseWhere, { location }],
        } satisfies Prisma.SurveyResponseWhereInput;
        return buildBreakdownRow(
          surveyId,
          location,
          location,
          scopedResponseWhere,
          { AND: [employeeWhere, { location }] }
        );
      })
  );
}

async function buildBreakdownRow(
  surveyId: string,
  id: string,
  name: string,
  responseWhere: Prisma.SurveyResponseWhereInput,
  employeeWhere: Prisma.UserWhereInput
) {
  const [employeeCount, responseCount, completionCount, ratingAnswers] = await Promise.all([
    prisma.user.count({ where: employeeWhere }),
    prisma.surveyResponse.count({ where: responseWhere }),
    prisma.surveyCompletion.count({ where: { surveyId, user: employeeWhere } }),
    prisma.answer.findMany({
      where: {
        ratingValue: { not: null },
        surveyResponse: responseWhere,
      },
      select: { ratingValue: true },
    }),
  ]);

  const showMetrics = responseCount >= ANONYMITY_THRESHOLD;
  const avgRating =
    showMetrics && ratingAnswers.length
      ? Math.round(
          (ratingAnswers.reduce((sum, answer) => sum + (answer.ratingValue || 0), 0) /
            ratingAnswers.length) *
            10
        ) / 10
      : 0;

  return {
    id,
    name,
    employeeCount,
    responses: responseCount,
    completions: completionCount,
    participationRate: employeeCount ? Math.round((completionCount / employeeCount) * 100) : 0,
    avgRating,
    suppressed: !showMetrics,
  };
}

function uniqueBy<T extends { id: string }>(items: T[], key: keyof T) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = String(item[key]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
