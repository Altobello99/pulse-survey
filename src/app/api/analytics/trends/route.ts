import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getScopedEmployeeWhere,
  getScopedResponseWhere,
  surveyHireDateWhere,
} from "@/lib/access";
import { isReportableGroup } from "@/lib/constants";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const analyses = await prisma.sentimentAnalysis.findMany({
    orderBy: { analyzedAt: "asc" },
    include: { survey: { select: { title: true, startDate: true } } },
  });

  const data = [];
  for (const analysis of analyses) {
    const employeeWhere = {
      AND: [
        await getScopedEmployeeWhere(session.user),
        surveyHireDateWhere(analysis.survey.startDate),
      ],
    };
    const [responseCount, completionCount] = await Promise.all([
      prisma.surveyResponse.count({
        where: await getScopedResponseWhere(session.user, analysis.surveyId),
      }),
      prisma.surveyCompletion.count({
        where: { surveyId: analysis.surveyId, user: employeeWhere },
      }),
    ]);
    if (!isReportableGroup(completionCount, responseCount)) continue;

    data.push({
      surveyTitle: analysis.survey.title,
      date: analysis.survey.startDate,
      sentiment: analysis.sentiment,
      score: analysis.score,
      themes: JSON.parse(analysis.themes),
    });
  }

  return Response.json({ data });
}
