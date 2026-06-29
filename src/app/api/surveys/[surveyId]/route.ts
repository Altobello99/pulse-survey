import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { surveyId } = await params;
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      _count: { select: { responses: true } },
      sentimentAnalyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
    },
  });

  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  const completion = await prisma.surveyCompletion.findUnique({
    where: { userId_surveyId: { userId: session.user.id, surveyId } },
  });
  const completed = !!completion;

  return Response.json({ data: { ...survey, completed } });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const body = await request.json();
  const { title, description, frequency, startDate, endDate, status, questions } = body;

  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (frequency !== undefined) updateData.frequency = frequency;
  if (startDate !== undefined) updateData.startDate = new Date(startDate);
  if (endDate !== undefined) updateData.endDate = new Date(endDate);
  if (status !== undefined) updateData.status = status;

  const survey = await prisma.survey.update({
    where: { id: surveyId },
    data: updateData,
  });

  // If questions provided, replace them
  if (questions) {
    await prisma.question.deleteMany({ where: { surveyId } });
    await prisma.question.createMany({
      data: questions.map((q: any, i: number) => ({
        surveyId,
        text: q.text,
        section: q.section?.trim() || null,
        type: q.type,
        required: q.required ?? true,
        order: i,
        options: q.options ? JSON.stringify(q.options) : null,
      })),
    });
  }

  return Response.json({ data: survey });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  await prisma.survey.delete({ where: { id: surveyId } });
  return Response.json({ data: { deleted: true } });
}
