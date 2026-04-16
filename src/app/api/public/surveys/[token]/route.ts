import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Public survey endpoint - no auth required, uses shared token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const survey = await prisma.survey.findUnique({
    where: { publicToken: token },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!survey || !survey.allowAnonymous) {
    return Response.json({ error: "Survey not found" }, { status: 404 });
  }

  const now = new Date();
  if (survey.status !== "active" || survey.startDate > now || survey.endDate < now) {
    return Response.json({ error: "Survey is not currently active" }, { status: 400 });
  }

  return Response.json({
    data: {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      questions: survey.questions,
    },
  });
}

function hashFingerprint(fp: string) {
  return crypto.createHash("sha256").update(fp).digest("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json();
  const { answers, fingerprint } = body;

  if (!fingerprint) {
    return Response.json({ error: "Missing fingerprint" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { publicToken: token },
  });

  if (!survey || !survey.allowAnonymous) {
    return Response.json({ error: "Survey not found" }, { status: 404 });
  }

  const now = new Date();
  if (survey.status !== "active" || survey.startDate > now || survey.endDate < now) {
    return Response.json({ error: "Survey is not currently active" }, { status: 400 });
  }

  // Fingerprint-based duplicate prevention (doesn't identify user)
  const fpHash = hashFingerprint(fingerprint);
  const existing = await prisma.anonymousToken.findUnique({
    where: { surveyId_fingerprint: { surveyId: survey.id, fingerprint: fpHash } },
  });
  if (existing) {
    return Response.json({ error: "Already submitted" }, { status: 409 });
  }

  // Fuzz timestamp to nearest hour
  const fuzzedTime = new Date();
  fuzzedTime.setMinutes(0, 0, 0);

  // Use a sentinel "anonymous" department so we don't even record department
  // Find or create a placeholder department for anonymous responses
  let anonDept = await prisma.department.findUnique({ where: { name: "__anonymous__" } });
  if (!anonDept) {
    anonDept = await prisma.department.create({ data: { name: "__anonymous__" } });
  }

  await prisma.$transaction([
    prisma.surveyResponse.create({
      data: {
        surveyId: survey.id,
        departmentId: anonDept.id,
        teamId: null,
        submittedAt: fuzzedTime,
        answers: {
          create: (answers || []).map((a: any) => ({
            questionId: a.questionId,
            ratingValue: a.ratingValue ?? null,
            choiceValue: a.choiceValue ?? null,
            textValue: a.textValue ?? null,
          })),
        },
      },
    }),
    prisma.anonymousToken.create({
      data: { surveyId: survey.id, fingerprint: fpHash },
    }),
  ]);

  return Response.json({ data: { success: true } }, { status: 201 });
}
