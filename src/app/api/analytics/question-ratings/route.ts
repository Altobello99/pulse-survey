import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentedBambooEmployeeWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveyId = request.nextUrl.searchParams.get("surveyId");
  if (!surveyId) {
    return Response.json({ error: "Missing surveyId" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
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
          order: true,
          options: true,
        },
      },
    },
  });

  if (!survey) {
    return Response.json({ error: "Survey not found" }, { status: 404 });
  }

  const departmentCounts = await prisma.user.groupBy({
    by: ["departmentId"],
    where: departmentedBambooEmployeeWhere,
    _count: { _all: true },
  });
  const departmentIds = departmentCounts.map((department) => department.departmentId);

  const [departments, responses] = await Promise.all([
    prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.surveyResponse.findMany({
      where: {
        surveyId,
        departmentId: { in: departmentIds },
      },
      select: {
        departmentId: true,
        answers: {
          where: {
            questionId: { in: survey.questions.map((question) => question.id) },
            ratingValue: { not: null },
          },
          select: { questionId: true, ratingValue: true },
        },
      },
    }),
  ]);

  const responsesByDepartment = new Map<string, typeof responses>();
  for (const response of responses) {
    const existing = responsesByDepartment.get(response.departmentId) || [];
    existing.push(response);
    responsesByDepartment.set(response.departmentId, existing);
  }

  const questions = survey.questions.map((question) => {
    const scale = ratingOptions(question.options);
    return {
      id: question.id,
      text: question.text,
      order: question.order,
      scaleMin: Math.min(...scale),
      scaleMax: Math.max(...scale),
    };
  });

  const departmentData = departments.map((department) => {
    const departmentResponses = responsesByDepartment.get(department.id) || [];
    const responseCount = departmentResponses.length;
    const status = responseCount === 0
      ? "no_responses"
      : responseCount < ANONYMITY_THRESHOLD
        ? "suppressed"
        : "available";

    return {
      id: department.id,
      name: department.name,
      responseCount: status === "available" ? responseCount : null,
      status,
      ratings: questions.map((question) => {
        const values = departmentResponses.flatMap((response) =>
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
      questions,
      departments: departmentData,
      threshold: ANONYMITY_THRESHOLD,
    },
  });
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
