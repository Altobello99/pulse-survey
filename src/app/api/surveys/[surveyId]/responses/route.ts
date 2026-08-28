import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { departmentedBambooEmployeeWhere } from "@/lib/access";
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

type SurveyQuestion = {
  id: string;
  type: string;
  required: boolean;
  options: string | null;
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

  const employee = await prisma.user.findFirst({
    where: { AND: [departmentedBambooEmployeeWhere, { id: session.user.id }] },
    select: {
      departmentId: true,
      division: true,
      teamId: true,
      location: true,
      managerEmail: true,
    },
  });
  if (!employee) {
    return Response.json(
      { error: "Your BambooHR Job Information is missing a department. Please contact HR before submitting the survey." },
      { status: 403 }
    );
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
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  const now = new Date();
  if (
    !survey ||
    survey.status !== "active" ||
    survey.startDate > now ||
    survey.endDate < now
  ) {
    return Response.json({ error: "Survey not available" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    answers?: unknown[];
    departmentId?: string | null;
    division?: string | null;
    teamId?: string | null;
    location?: string | null;
  } | null;
  if (!body) return Response.json({ error: "Invalid request body" }, { status: 400 });

  const { departmentId, division, teamId, location } = body;
  const answerValidation = validateAnswers(survey.questions, body.answers);
  if (answerValidation.error) {
    return Response.json({ error: answerValidation.error }, { status: 400 });
  }

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

  const departmentEligibleFromBamboo = eligibleDepartmentIds.has(employee.departmentId);
  const divisionEligibleFromBamboo = employee.division
    ? eligibleDivisions.has(employee.division)
    : false;
  const teamEligibleFromBamboo = employee.teamId
    ? eligibleTeamIds.has(employee.teamId)
    : false;
  const locationEligibleFromBamboo = employee.location
    ? eligibleLocations.has(employee.location)
    : false;
  const safeDepartmentId =
    requestedDepartmentId ||
    (departmentEligibleFromBamboo
      ? employee.departmentId
      : await getAnonymousFallbackDepartmentId());
  const safeDivision =
    requestedDivision || (divisionEligibleFromBamboo ? employee.division : null);
  const safeTeamId =
    requestedTeamId || (teamEligibleFromBamboo ? employee.teamId : null);
  const safeLocation =
    requestedLocation || (locationEligibleFromBamboo ? employee.location : null);

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
        managerEmail: employee.managerEmail,
        location: safeLocation,
        division: safeDivision,
        submittedAt: fuzzedTime,
        answers: {
          create: answerValidation.answers.map((a) => ({
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

function validateAnswers(questions: SurveyQuestion[], submitted: unknown[] | undefined) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answeredQuestionIds = new Set<string>();
  const answers: SubmittedAnswer[] = [];

  for (const item of submitted || []) {
    if (!item || typeof item !== "object") {
      return { answers: [], error: "Invalid survey answer" };
    }

    const raw = item as Partial<SubmittedAnswer>;
    if (typeof raw.questionId !== "string") {
      return { answers: [], error: "Invalid survey answer" };
    }

    const question = questionById.get(raw.questionId);
    if (!question) {
      return { answers: [], error: "An answer does not belong to this survey" };
    }
    if (answeredQuestionIds.has(question.id)) {
      return { answers: [], error: "A question was answered more than once" };
    }

    if (question.type === "rating") {
      if (raw.ratingValue === null || raw.ratingValue === undefined) continue;
      if (!Number.isInteger(raw.ratingValue) || !ratingOptions(question).includes(raw.ratingValue)) {
        return { answers: [], error: "A rating is outside the allowed scale" };
      }
      answers.push({ questionId: question.id, ratingValue: raw.ratingValue });
    } else if (question.type === "multiple_choice") {
      if (raw.choiceValue === null || raw.choiceValue === undefined || raw.choiceValue === "") continue;
      if (
        typeof raw.choiceValue !== "string" ||
        !choiceOptions(question).includes(raw.choiceValue)
      ) {
        return { answers: [], error: "A selected answer is not an available option" };
      }
      answers.push({ questionId: question.id, choiceValue: raw.choiceValue });
    } else if (question.type === "free_text") {
      if (raw.textValue === null || raw.textValue === undefined) continue;
      if (typeof raw.textValue !== "string") {
        return { answers: [], error: "Invalid written response" };
      }
      if (raw.textValue.trim() === "") continue;
      if (raw.textValue.length > 5000) {
        return { answers: [], error: "A written response is too long" };
      }
      answers.push({ questionId: question.id, textValue: raw.textValue.trim() });
    } else {
      return { answers: [], error: "Unsupported survey question type" };
    }

    answeredQuestionIds.add(question.id);
  }

  if (questions.some((question) => question.required && !answeredQuestionIds.has(question.id))) {
    return { answers: [], error: "Please answer all required questions" };
  }

  return { answers, error: null };
}

function choiceOptions(question: SurveyQuestion) {
  if (!question.options) return [];
  try {
    const parsed = JSON.parse(question.options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function ratingOptions(question: SurveyQuestion) {
  const values = choiceOptions(question)
    .map(Number)
    .filter((value) => Number.isInteger(value));
  return values.length ? values : [1, 2, 3, 4, 5];
}
