import { after, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import {
  analyzeStandaloneFeedback,
} from "@/lib/comment-analysis";
import { parseCommentThemes } from "@/lib/comment-analysis-types";
import type { Prisma } from "@/generated/prisma/client";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveyId = request.nextUrl.searchParams.get("surveyId");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 500);
  const maximumLimit = session.user.role === "admin" ? 5_000 : 500;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(maximumLimit, Math.max(1, Math.trunc(requestedLimit)))
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
      departmentProtected: false,
      source: "feedback" as const,
      survey: null,
      question: null,
      analysisSourceType: "feedback",
      analysisSourceId: item.id,
    })),
    ...surveyComments,
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
  const analysisFilters: Prisma.CommentAnalysisWhereInput[] = ["survey", "feedback"]
    .map((sourceType) => ({
      sourceType,
      sourceId: {
        in: data
          .filter((item) => item.analysisSourceType === sourceType)
          .map((item) => item.analysisSourceId),
      },
    }))
    .filter((filter) => filter.sourceId?.in?.length);
  const analyses = session.user.role === "admin" && analysisFilters.length
    ? await prisma.commentAnalysis.findMany({
        where: { OR: analysisFilters },
      })
    : [];
  const analysisBySource = new Map(
    analyses.map((analysis) => [
      `${analysis.sourceType}:${analysis.sourceId}`,
      {
        sentiment: analysis.sentiment,
        severity: analysis.severity,
        suggestedSeverity: analysis.suggestedSeverity,
        themes: parseCommentThemes(analysis.themes),
        confidence: analysis.confidence,
        reason: analysis.reason,
        model: analysis.model,
        analyzedAt: analysis.analyzedAt,
      },
    ])
  );
  const responseData = data.map((item) => {
    const { analysisSourceType, analysisSourceId, ...comment } = item;
    return {
      ...comment,
      analysis: analysisBySource.get(`${analysisSourceType}:${analysisSourceId}`) || null,
    };
  });

  return Response.json({ data: responseData });
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

  const [answers, departmentResponseCounts] = await Promise.all([
    prisma.answer.findMany({
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
        surveyResponse: {
          select: {
            submittedAt: true,
            surveyId: true,
            departmentId: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.surveyResponse.groupBy({
      by: ["surveyId", "departmentId"],
      where: { surveyId: { in: eligibleSurveyIds } },
      _count: { _all: true },
    }),
  ]);
  const reportableDepartments = new Set(
    departmentResponseCounts
      .filter((group) => group._count._all >= ANONYMITY_THRESHOLD)
      .map((group) => `${group.surveyId}:${group.departmentId}`)
  );

  return answers
    .filter((answer) => Boolean(answer.textValue?.trim()))
    .map((answer) => {
      const departmentIsReportable = reportableDepartments.has(
        `${answer.surveyResponse.surveyId}:${answer.surveyResponse.departmentId}`
      );

      return {
        id: `survey-comment-${answer.id}`,
        message: answer.textValue!.trim(),
        category: answer.question.section || "Survey comment",
        sentiment: null,
        status: "received",
        createdAt: answer.surveyResponse.submittedAt,
        department: departmentIsReportable ? answer.surveyResponse.department : null,
        departmentProtected: !departmentIsReportable,
        team: null,
        source: "survey" as const,
        survey: answer.question.survey,
        question: {
          text: answer.question.text,
          section: answer.question.section,
        },
        analysisSourceType: "survey",
        analysisSourceId: answer.id,
      };
    });
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
  const gatewayToken = request.headers.get("x-vercel-oidc-token") || undefined;

  after(async () => {
    try {
      const firstAttempt = await analyzeStandaloneFeedback(feedback.id, { gatewayToken });
      if (firstAttempt.failed > 0) {
        await analyzeStandaloneFeedback(feedback.id, { gatewayToken });
      }
    } catch (error) {
      console.error(
        "Standalone feedback analysis failed",
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
      );
    }
  });

  return Response.json({ data: feedback }, { status: 201 });
}
