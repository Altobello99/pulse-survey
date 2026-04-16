import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const departments = await prisma.department.findMany({
    include: {
      _count: { select: { users: true } },
      surveyResponses: {
        include: { answers: true },
      },
    },
  });

  const latestSurvey = await prisma.survey.findFirst({
    where: { status: { in: ["active", "closed"] } },
    orderBy: { startDate: "desc" },
  });

  const data = await Promise.all(
    departments.map(async (dept) => {
      const recentResponses = latestSurvey
        ? await prisma.surveyResponse.count({
            where: { surveyId: latestSurvey.id, departmentId: dept.id },
          })
        : 0;

      // Average rating across all responses for this department
      const ratingAnswers = await prisma.answer.findMany({
        where: {
          ratingValue: { not: null },
          surveyResponse: { departmentId: dept.id },
        },
        select: { ratingValue: true },
      });

      const avgRating = ratingAnswers.length
        ? ratingAnswers.reduce((sum, a) => sum + (a.ratingValue || 0), 0) / ratingAnswers.length
        : 0;

      return {
        id: dept.id,
        name: dept.name,
        employeeCount: dept._count.users,
        participationRate: dept._count.users
          ? Math.round((recentResponses / dept._count.users) * 100)
          : 0,
        avgRating: Math.round(avgRating * 10) / 10,
      };
    })
  );

  return Response.json({ data });
}
