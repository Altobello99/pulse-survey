import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAndStoreComments } from "@/lib/comment-analysis";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true },
  });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  const answers = await prisma.answer.findMany({
    where: {
      textValue: { not: null },
      question: { surveyId, type: "free_text" },
    },
    select: {
      id: true,
      textValue: true,
      question: {
        select: {
          text: true,
          survey: { select: { title: true } },
        },
      },
    },
  });

  const result = await analyzeAndStoreComments(
    answers.map((answer) => ({
      sourceType: "survey" as const,
      sourceId: answer.id,
      text: answer.textValue || "",
      context: `Survey: ${answer.question.survey.title}; Question: ${answer.question.text}`,
    })),
    { gatewayToken: request.headers.get("x-vercel-oidc-token") || undefined }
  );

  return Response.json({ data: result });
}
