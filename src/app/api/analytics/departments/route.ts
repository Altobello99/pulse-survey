import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentedBambooEmployeeWhere } from "@/lib/access";

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
  });

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
        employeeCount,
        participationRate: employeeCount
          ? Math.round((recentCompletions / employeeCount) * 100)
          : 0,
        avgRating: Math.round(avgRating * 10) / 10,
      };
    })
  );

  return Response.json({ data });
}
