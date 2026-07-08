import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getAnonymousFallbackDepartmentId,
  getEligibleSurveyDemographics,
} from "@/lib/demographic-options";

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
  const { answers, departmentId, division, teamId, location } = body as {
    answers?: SubmittedAnswer[];
    departmentId?: string | null;
    division?: string | null;
    teamId?: string | null;
    location?: string | null;
  };
  const demographicOptions = await getEligibleSurveyDemographics();
  const eligibleDepartmentIds = new Set(
    demographicOptions.departments.map((department) => department.id)
  );
  const eligibleDivisions = new Set(
    demographicOptions.divisions.map((option) => option.name)
  );
  const eligibleTeamIds = new Set(
    demographicOptions.teams.map((team) => team.id)
  );
  const eligibleLocations = new Set(
    demographicOptions.locations.map((option) => option.name)
  );
  const requestedDepartmentId = departmentId?.trim() || "";
  const requestedDivision = division?.trim() || "";
  const requestedTeamId = teamId?.trim() || "";
  const requestedLocation = location?.trim() || "";

  if (requestedDepartmentId && !eligibleDepartmentIds.has(requestedDepartmentId)) {
    return Response.json(
      { error: "That department is not available for this survey." },
      { status: 400 }
    );
  }

  if (requestedDivision && !eligibleDivisions.has(requestedDivision)) {
    return Response.json(
      { error: "That division is not available for this survey." },
      { status: 400 }
    );
  }

  if (requestedTeamId && !eligibleTeamIds.has(requestedTeamId)) {
    return Response.json(
      { error: "That shift/line is not available for this survey." },
      { status: 400 }
    );
  }

  if (requestedLocation && !eligibleLocations.has(requestedLocation)) {
    return Response.json(
      { error: "That location is not available for this survey." },
      { status: 400 }
    );
  }

  const departmentEligibleFromBamboo = eligibleDepartmentIds.has(session.user.departmentId);
  const divisionEligibleFromBamboo = session.user.division
    ? eligibleDivisions.has(session.user.division)
    : false;
  const teamEligibleFromBamboo = session.user.teamId
    ? eligibleTeamIds.has(session.user.teamId)
    : false;
  const locationEligibleFromBamboo = session.user.location
    ? eligibleLocations.has(session.user.location)
    : false;
  const safeDepartmentId =
    requestedDepartmentId ||
    (departmentEligibleFromBamboo
      ? session.user.departmentId
      : await getAnonymousFallbackDepartmentId());
  const safeDivision =
    requestedDivision || (divisionEligibleFromBamboo ? session.user.division : null);
  const safeTeamId =
    requestedTeamId || (teamEligibleFromBamboo ? session.user.teamId : null);
  const safeLocation =
    requestedLocation || (locationEligibleFromBamboo ? session.user.location : null);

  // CONFIDENTIALITY: Round submittedAt to nearest hour so it cannot be
  // correlated with login timestamps or auth logs to identify respondents.
  const fuzzedTime = new Date();
  fuzzedTime.setMinutes(0, 0, 0);

  // Create anonymous response (no userId!)
  await prisma.$transaction([
    prisma.surveyResponse.create({
      data: {
        surveyId,
        departmentId: safeDepartmentId,
        teamId: safeTeamId,
        managerEmail: session.user.managerEmail,
        location: safeLocation,
        division: safeDivision,
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
