import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentedBambooEmployeeWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const departmentCounts = await prisma.user.groupBy({
    by: ["departmentId"],
    where: departmentedBambooEmployeeWhere,
    _count: { _all: true },
  });
  const employeeCountsByDepartment = new Map(
    departmentCounts.map((department) => [department.departmentId, department._count._all])
  );

  const departments = await prisma.department.findMany({
    where: {
      id: { in: [...employeeCountsByDepartment.keys()] },
    },
    orderBy: { name: "asc" },
  });

  const latestSurvey = await prisma.survey.findFirst({
    where: { status: { in: ["active", "closed"] } },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      questions: {
        where: { type: "rating" },
        select: { id: true, options: true },
      },
    },
  });
  const standardRatingQuestionIds = (latestSurvey?.questions || [])
    .filter((question) => {
      const scale = ratingOptions(question.options);
      return Math.min(...scale) === 1 && Math.max(...scale) === 5;
    })
    .map((question) => question.id);

  const data = await Promise.all(
    departments.map(async (dept) => {
      const employeeCount = employeeCountsByDepartment.get(dept.id) || 0;
      const employeeWhere = {
        AND: [departmentedBambooEmployeeWhere, { departmentId: dept.id }],
      };
      const recentCompletions = latestSurvey
        ? await prisma.surveyCompletion.count({
            where: { surveyId: latestSurvey.id, user: employeeWhere },
          })
        : 0;

      const recentResponses = latestSurvey
        ? await prisma.surveyResponse.count({
            where: { surveyId: latestSurvey.id, departmentId: dept.id },
          })
        : 0;
      const ratingAnswers = latestSurvey &&
        recentResponses >= ANONYMITY_THRESHOLD &&
        standardRatingQuestionIds.length > 0
        ? await prisma.answer.findMany({
            where: {
              questionId: { in: standardRatingQuestionIds },
              ratingValue: { not: null },
              surveyResponse: {
                surveyId: latestSurvey.id,
                departmentId: dept.id,
              },
            },
            select: { ratingValue: true },
          })
        : [];

      const avgRating = ratingAnswers.length
        ? ratingAnswers.reduce((sum, a) => sum + (a.ratingValue || 0), 0) / ratingAnswers.length
        : null;

      return {
        id: dept.id,
        name: dept.name,
        employeeCount,
        completions: recentCompletions,
        participationRate: employeeCount
          ? Math.round((recentCompletions / employeeCount) * 100)
          : 0,
        avgRating: avgRating === null ? null : Math.round(avgRating * 10) / 10,
        ratingScaleMax: 5,
      };
    })
  );

  return Response.json({ data });
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
