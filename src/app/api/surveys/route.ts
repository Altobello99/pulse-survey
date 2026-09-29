import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  departmentedBambooEmployeeWhere,
  isOnSurveyOpeningRoster,
  normalizeEmail,
  surveyRosterEmployeeWhere,
} from "@/lib/access";
import { ensureSurveyRosterSnapshot } from "@/lib/results-roster";

type SurveyQuestionInput = {
  text: string;
  section?: string | null;
  type: string;
  required?: boolean;
  options?: unknown[] | null;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const surveys = await prisma.survey.findMany({
    include: {
      questions: { orderBy: { order: "asc" } },
      _count: { select: { responses: true, completions: true } },
      resultsRelease: { select: { resultsReleasedAt: true } },
      resultsGrants: {
        where: { leaderEmail: normalizeEmail(session.user.email) },
        select: { resultsReleasedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const completions = await prisma.surveyCompletion.findMany({
    where: { userId: session.user.id },
    select: { surveyId: true },
  });
  const completedIds = new Set(completions.map((c) => c.surveyId));
  const eligibleCompletionCounts = await Promise.all(
    surveys.map((survey) =>
      prisma.surveyCompletion.count({
        where: {
          surveyId: survey.id,
          user: surveyRosterEmployeeWhere(survey.startDate),
        },
      })
    )
  );
  const employee = await prisma.user.findFirst({
    where: { AND: [departmentedBambooEmployeeWhere, { id: session.user.id }] },
    select: { hireDate: true },
  });
  const withEmployeeStatus = surveys.map((survey, index) => {
    const { resultsRelease, resultsGrants, ...publicSurvey } = survey;
    const surveyClosed = survey.status === "closed" || survey.endDate < new Date();
    return {
      ...publicSurvey,
      _count: {
        responses: session.user.role === "admin" ? survey._count.responses : 0,
        completions:
          session.user.role === "admin" ? eligibleCompletionCounts[index] : 0,
      },
      completed: completedIds.has(survey.id),
      eligible: isOnSurveyOpeningRoster(employee?.hireDate, survey.startDate),
      resultsAvailable:
        session.user.role === "admin" ||
        (surveyClosed &&
          Boolean(
            resultsRelease?.resultsReleasedAt || resultsGrants[0]?.resultsReleasedAt
          )),
    };
  });

  // Employees only see surveys that are actively open right now. Historical,
  // draft, and closed surveys are admin/manager-only.
  if (session.user.role === "employee") {
    const now = new Date();
    const filtered = withEmployeeStatus.filter(
      (s) =>
        s.status === "active" &&
        new Date(s.startDate) <= now &&
        new Date(s.endDate) >= now
    );

    return Response.json(
      { data: filtered },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  return Response.json(
    { data: withEmployeeStatus },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string | null;
    frequency?: string | null;
    startDate?: string;
    endDate?: string;
    status?: string;
    questions?: SurveyQuestionInput[];
  };
  const { title, description, frequency, startDate, endDate, status, questions } = body;

  if (!title || !startDate || !endDate) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const survey = await prisma.survey.create({
    data: {
      title,
      description,
      frequency,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || "draft",
      createdById: session.user.id,
      questions: {
        create: (questions || []).map((q, i) => ({
          text: q.text,
          section: q.section?.trim() || null,
          type: q.type,
          required: q.required ?? true,
          order: i,
          options: q.options ? JSON.stringify(q.options) : null,
        })),
      },
    },
    include: { questions: true },
  });

  if (survey.status === "active") {
    await ensureSurveyRosterSnapshot(survey.id);
  }

  return Response.json({ data: survey }, { status: 201 });
}
