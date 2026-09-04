import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveyId = request.nextUrl.searchParams.get("surveyId");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 500);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
    : 500;
  const where: Prisma.FeedbackWhereInput = {};
  if (session.user.role === "manager") {
    where.departmentId = session.user.departmentId;
  }

  const feedback = surveyId
    ? []
    : await prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { department: true, team: true },
        take: limit,
      });

  const surveyComments = session.user.role === "admin"
    ? await getSurveyComments(surveyId, limit)
    : [];

  const data = [
    ...feedback.map((item) => ({
      ...item,
      source: "feedback" as const,
      survey: null,
      question: null,
    })),
    ...surveyComments,
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return Response.json({ data });
}

async function getSurveyComments(surveyId: string | null, limit: number) {
  const surveys = await prisma.survey.findMany({
    where: {
      status: { in: ["active", "closed"] },
      ...(surveyId ? { id: surveyId } : {}),
    },
    select: {
      id: true,
      title: true,
      _count: { select: { responses: true } },
    },
  });
  const eligibleSurveyIds = surveys
    .filter((survey) => survey._count.responses >= ANONYMITY_THRESHOLD)
    .map((survey) => survey.id);

  if (eligibleSurveyIds.length === 0) return [];

  const answers = await prisma.answer.findMany({
    where: {
      textValue: { not: null },
      question: {
        type: "free_text",
        surveyId: { in: eligibleSurveyIds },
      },
    },
    select: {
      id: true,
      textValue: true,
      question: {
        select: {
          text: true,
          section: true,
          survey: { select: { id: true, title: true } },
        },
      },
      surveyResponse: { select: { submittedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return answers
    .filter((answer) => Boolean(answer.textValue?.trim()))
    .map((answer) => ({
      id: `survey-comment-${answer.id}`,
      message: answer.textValue!.trim(),
      category: answer.question.section || "Survey comment",
      sentiment: null,
      status: "received",
      createdAt: answer.surveyResponse.submittedAt,
      department: null,
      team: null,
      source: "survey" as const,
      survey: answer.question.survey,
      question: {
        text: answer.question.text,
        section: answer.question.section,
      },
    }));
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "employee") {
    return Response.json({ error: "Feedback is only available to managers and admins" }, { status: 403 });
  }

  const body = await request.json();
  const { message, category, includeDepartment } = body;

  if (!message || message.trim().length < 10) {
    return Response.json({ error: "Message must be at least 10 characters" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      message,
      category: category || "other",
      departmentId: includeDepartment ? session.user.departmentId : null,
      teamId: includeDepartment ? session.user.teamId : null,
    },
  });

  return Response.json({ data: feedback }, { status: 201 });
}
