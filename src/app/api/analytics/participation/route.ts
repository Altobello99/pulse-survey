import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getScopedEmployeeWhere,
  getScopedResponseWhere,
  surveyHireDateWhere,
} from "@/lib/access";
import { isReportableGroup } from "@/lib/constants";
import { buildDailyParticipation } from "@/lib/participation";

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
      endDate: true,
      status: true,
    },
  });

  const scopedEmployeeWhere = await getScopedEmployeeWhere(session.user);

  const data = await Promise.all(
    surveys.map(async (s) => {
      const employeeWhere = {
        AND: [scopedEmployeeWhere, surveyHireDateWhere(s.startDate)],
      };
      const responseWhere = await getScopedResponseWhere(session.user, s.id);
      const [responseCount, completionRows, totalEmployees] = await Promise.all([
        prisma.surveyResponse.count({
          where: responseWhere,
        }),
        prisma.surveyCompletion.findMany({
          where: { surveyId: s.id, user: employeeWhere },
          select: { completedAt: true },
          orderBy: { completedAt: "asc" },
        }),
        prisma.user.count({ where: employeeWhere }),
      ]);
      const completions = completionRows.length;
      const hidden = !isReportableGroup(completions, responseCount);

      return {
        id: s.id,
        title: s.title,
        date: s.startDate,
        status: s.status,
        completions,
        total: totalEmployees,
        rate: totalEmployees ? Math.round((completions / totalEmployees) * 100) : 0,
        hidden,
        daily: hidden
          ? []
          : buildDailyParticipation(
              completionRows.map((completion) => completion.completedAt),
              s.startDate,
              s.endDate,
              totalEmployees
            ),
      };
    })
  );

  return Response.json({ data });
}
