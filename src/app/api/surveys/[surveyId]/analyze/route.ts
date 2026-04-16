import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeSentiment } from "@/lib/sentiment";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;

  // Check cooldown
  const recent = await prisma.sentimentAnalysis.findFirst({
    where: { surveyId },
    orderBy: { analyzedAt: "desc" },
  });
  if (recent && Date.now() - new Date(recent.analyzedAt).getTime() < 5 * 60 * 1000) {
    return Response.json(
      { error: "Analysis was run recently. Please wait 5 minutes." },
      { status: 429 }
    );
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: true },
  });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  // Get free-text responses
  const freeTextQuestions = survey.questions.filter((q) => q.type === "free_text");
  if (freeTextQuestions.length === 0) {
    return Response.json({ error: "No free-text questions to analyze" }, { status: 400 });
  }

  const results = [];
  for (const question of freeTextQuestions) {
    const answers = await prisma.answer.findMany({
      where: { questionId: question.id, textValue: { not: null } },
    });
    const texts = answers.map((a) => a.textValue!).filter((t) => t.trim() !== "");

    if (texts.length === 0) continue;

    const result = await analyzeSentiment(survey.title, question.text, texts);

    const analysis = await prisma.sentimentAnalysis.create({
      data: {
        surveyId,
        questionId: question.id,
        sentiment: result.sentiment,
        score: result.score,
        themes: JSON.stringify(result.themes),
        insights: JSON.stringify(result.insights),
        summary: result.summary,
      },
    });
    results.push(analysis);
  }

  return Response.json({ data: results });
}
