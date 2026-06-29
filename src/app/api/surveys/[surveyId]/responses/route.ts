import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SubmittedAnswer = {
  questionId: string;
  ratingValue?: number | null;
  choiceValue?: string | null;
  textValue?: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.loginId) {
    return Response.json(
      { error: "Sign in with Google to submit an employee survey response" },
      { status: 403 }
    );
  }
  if (session.user.status !== "active") {
    return Response.json({ error: "Only active employees can submit surveys" }, { status: 403 });
  }

  const { surveyId } = await params;

  // Check if already completed
  const existing = await prisma.surveyCompletion.findUnique({
    where: { userId_surveyId: { userId: session.user.id, surveyId } },
  });
  if (existing) {
    return Response.json({ error: "Already completed" }, { status: 409 });
  }

  // Check survey is active
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  const now = new Date();
  if (
    !survey ||
    survey.status !== "active" ||
    survey.startDate > now ||
    survey.endDate < now
  ) {
    return Response.json({ error: "Survey not available" }, { status: 400 });
  }

  const body = await request.json();
  const { answers } = body as { answers?: SubmittedAnswer[] };

  // CONFIDENTIALITY: Round submittedAt to nearest hour so it cannot be
  // correlated with login timestamps or auth logs to identify respondents.
  const fuzzedTime = new Date();
  fuzzedTime.setMinutes(0, 0, 0);

  // Check team size - if below threshold, strip team ID to prevent identification
  const { ANONYMITY_THRESHOLD } = await import("@/lib/constants");
  const teamSize = session.user.teamId
    ? await prisma.user.count({ where: { teamId: session.user.teamId } })
    : 0;
  const safeTeamId = teamSize >= ANONYMITY_THRESHOLD ? session.user.teamId : null;

  // Create anonymous response (no userId!)
  await prisma.$transaction([
    prisma.surveyResponse.create({
      data: {
        surveyId,
        departmentId: session.user.departmentId,
        teamId: safeTeamId,
        managerEmail: session.user.managerEmail,
        location: session.user.location,
        division: session.user.division,
        submittedAt: fuzzedTime,
        answers: {
          create: (answers || []).map((a) => ({
            questionId: a.questionId,
            ratingValue: a.ratingValue ?? null,
            choiceValue: a.choiceValue ?? null,
            textValue: a.textValue ?? null,
          })),
        },
      },
    }),
    // Track completion separately (no link to response content)
    prisma.surveyCompletion.create({
      data: { userId: session.user.id, surveyId },
    }),
  ]);

  return Response.json({ data: { success: true } }, { status: 201 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId },
    include: { answers: { include: { question: true } } },
  });

  return Response.json({ data: responses });
}
