import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const analyses = await prisma.sentimentAnalysis.findMany({
    orderBy: { analyzedAt: "asc" },
    include: { survey: { select: { title: true, startDate: true } } },
  });

  const data = analyses.map((a) => ({
    surveyTitle: a.survey.title,
    date: a.survey.startDate,
    sentiment: a.sentiment,
    score: a.score,
    themes: JSON.parse(a.themes),
  }));

  return Response.json({ data });
}
