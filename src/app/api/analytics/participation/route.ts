import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScopedEmployeeWhere, getScopedResponseWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveys = await prisma.survey.findMany({
    where: { status: { in: ["active", "closed"] } },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      title: true,
      startDate: true,
      status: true,
      _count: { select: { completions: true } },
    },
  });

  const employeeWhere = await getScopedEmployeeWhere(session.user);
  const totalEmployees = await prisma.user.count({ where: employeeWhere });

  const data = await Promise.all(
    surveys.map(async (s) => {
      const responseCount = await prisma.surveyResponse.count({
        where: await getScopedResponseWhere(session.user, s.id),
      });
      const completions = await prisma.surveyCompletion.count({
        where: { surveyId: s.id, user: employeeWhere },
      });
      const hidden = session.user.role !== "admin" && responseCount < ANONYMITY_THRESHOLD;

      return {
        id: s.id,
        title: s.title,
        date: s.startDate,
        status: s.status,
        completions,
        total: totalEmployees,
        rate: totalEmployees ? Math.round((completions / totalEmployees) * 100) : 0,
        hidden,
      };
    })
  );

  return Response.json({ data });
}
