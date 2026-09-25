import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  departmentedBambooEmployeeWhere,
  getManagerScope,
  surveyHireDateWhere,
} from "@/lib/access";
import { ANONYMITY_THRESHOLD, isReportableGroup } from "@/lib/constants";
import { parseCommentThemes } from "@/lib/comment-analysis-types";
import { buildDailyParticipation } from "@/lib/participation";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const survey = await prisma.survey.findFirst({
    where: { status: { in: ["active", "closed"] } },
    orderBy: { startDate: "desc" },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!survey) return Response.json({ data: null });

  const scope = await getManagerScope(session.user);
  const scopedEmployeeWhere = scope.companyWide
    ? departmentedBambooEmployeeWhere
    : {
        AND: [
          departmentedBambooEmployeeWhere,
          { id: { in: scope.employeeIds } },
        ],
      };
  const employeeWhere = {
    AND: [
      scopedEmployeeWhere,
      surveyHireDateWhere(survey.startDate),
    ],
  };
  const responseWhere = scope.companyWide
    ? { surveyId: survey.id }
    : {
        surveyId: survey.id,
        managerEmail: { in: scope.managerEmails },
      };

  const [eligibleEmployees, completions, responses, actionCounts] = await Promise.all([
    prisma.user.findMany({
      where: employeeWhere,
      select: { id: true },
    }),
    prisma.surveyCompletion.findMany({
      where: { surveyId: survey.id, user: employeeWhere },
      select: { userId: true, completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.surveyResponse.findMany({
      where: responseWhere,
      select: {
        id: true,
        answers: {
          select: {
            id: true,
            questionId: true,
            ratingValue: true,
            choiceValue: true,
            textValue: true,
          },
        },
      },
    }),
    prisma.actionItem.groupBy({
      by: ["status"],
      where: { createdById: session.user.id },
      _count: { _all: true },
    }),
  ]);

  const reportable = isReportableGroup(completions.length, responses.length);
  const textAnswerIds = reportable
    ? responses.flatMap((response) =>
        response.answers
          .filter((answer) => Boolean(answer.textValue?.trim()))
          .map((answer) => answer.id)
      )
    : [];
  const analyses = textAnswerIds.length
    ? await prisma.commentAnalysis.findMany({
        where: {
          sourceType: "survey",
          sourceId: { in: textAnswerIds },
        },
        select: { sentiment: true, themes: true },
      })
    : [];

  const questionAverages = reportable
    ? survey.questions
        .filter((question) => question.type === "rating")
        .map((question) => {
          const scale = ratingOptions(question.options);
          const ratings = ratingsForQuestion(responses, question.id);
          return {
            id: question.id,
            order: question.order,
            section: question.section,
            question: question.text,
            responses: ratings.length,
            average: ratings.length >= ANONYMITY_THRESHOLD ? average(ratings) : null,
            scaleMin: Math.min(...scale),
            scaleMax: Math.max(...scale),
          };
        })
    : [];
  const standardQuestionIds = new Set(
    survey.questions
      .filter((question) => {
        if (question.type !== "rating") return false;
        const scale = ratingOptions(question.options);
        return Math.min(...scale) === 1 && Math.max(...scale) === 5;
      })
      .map((question) => question.id)
  );
  const standardRatings = reportable
    ? responses.flatMap((response) =>
        response.answers
          .filter(
            (answer) =>
              standardQuestionIds.has(answer.questionId) && answer.ratingValue !== null
          )
          .map((answer) => answer.ratingValue as number)
      )
    : [];
  const recommendationQuestion = survey.questions.find((question) => {
    if (question.type !== "rating") return false;
    const scale = ratingOptions(question.options);
    return Math.min(...scale) === 0 && Math.max(...scale) === 10;
  });
  const recommendationRatings =
    reportable && recommendationQuestion
      ? ratingsForQuestion(responses, recommendationQuestion.id)
      : [];
  const friendQuestion = survey.questions.find(
    (question) => question.type === "multiple_choice" && /best friend/i.test(question.text)
  );
  const friendChoices =
    reportable && friendQuestion
      ? responses.flatMap((response) =>
          response.answers
            .filter((answer) => answer.questionId === friendQuestion.id)
            .map((answer) => answer.choiceValue?.trim().toLowerCase())
            .filter((choice): choice is string => Boolean(choice))
        )
      : [];
  const sentimentCounts = buildSentimentCounts(analyses);
  const themes = buildThemeSummary(analyses);
  const commentsReportable = analyses.length >= ANONYMITY_THRESHOLD;
  const actions = Object.fromEntries(
    actionCounts.map((row) => [row.status, row._count._all])
  );
  const totalEmployees = eligibleEmployees.length;
  const completed = completions.length;

  return Response.json({
    data: {
      survey: {
        id: survey.id,
        title: survey.title,
        status: survey.status,
        startDate: survey.startDate,
        endDate: survey.endDate,
      },
      scopeType: scope.companyWide ? "company" : "reporting_tree",
      scopeEmployees: scope.employeeIds.length,
      hierarchyEmployees: scope.employeeIds.length,
      eligibleEmployees: totalEmployees,
      completions: completed,
      participationRate: totalEmployees
        ? Math.round((completed / totalEmployees) * 100)
        : 0,
      responseCount: responses.length,
      dailyParticipation: buildDailyParticipation(
        completions.map((completion) => completion.completedAt),
        survey.startDate,
        survey.endDate,
        totalEmployees
      ),
      suppressed: !reportable,
      suppressionMessage: reportable
        ? null
        : `Team results appear after at least ${ANONYMITY_THRESHOLD} employees complete the survey.`,
      averageRating: reportable ? average(standardRatings) : null,
      recommendationAverage: recommendationRatings.length
        ? average(recommendationRatings)
        : null,
      enps: recommendationRatings.length ? calculateEnps(recommendationRatings) : null,
      friendYesPercent: friendChoices.length
        ? Math.round(
            (friendChoices.filter((choice) => choice === "yes").length /
              friendChoices.length) *
              100
          )
        : null,
      questionAverages,
      writtenComments: reportable ? textAnswerIds.length : null,
      analyzedComments: reportable ? analyses.length : null,
      sentiment: reportable && commentsReportable ? sentimentCounts : null,
      themes: reportable && commentsReportable ? themes : [],
      actions: {
        open: actions.open || 0,
        inProgress: actions.in_progress || 0,
        completed: actions.completed || 0,
      },
      anonymityThreshold: ANONYMITY_THRESHOLD,
      generatedAt: new Date().toISOString(),
    },
  });
}

type ScopedResponse = {
  answers: Array<{ questionId: string; ratingValue: number | null }>;
};

function ratingsForQuestion(responses: ScopedResponse[], questionId: string) {
  return responses.flatMap((response) =>
    response.answers
      .filter((answer) => answer.questionId === questionId && answer.ratingValue !== null)
      .map((answer) => answer.ratingValue as number)
  );
}

function buildSentimentCounts(analyses: Array<{ sentiment: string }>) {
  const counts = { positive: 0, neutral: 0, negative: 0, mixed: 0, total: analyses.length };
  for (const analysis of analyses) {
    if (analysis.sentiment in counts && analysis.sentiment !== "total") {
      counts[analysis.sentiment as "positive" | "neutral" | "negative" | "mixed"] += 1;
    }
  }
  return counts;
}

function buildThemeSummary(analyses: Array<{ themes: string }>) {
  const counts = new Map<string, number>();
  for (const analysis of analyses) {
    for (const theme of parseCommentThemes(analysis.themes)) {
      counts.set(theme, (counts.get(theme) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= ANONYMITY_THRESHOLD)
    .map(([theme, count]) => ({ theme, count }))
    .sort((left, right) => right.count - left.count || left.theme.localeCompare(right.theme))
    .slice(0, 10);
}

function ratingOptions(options: string | null) {
  if (!options) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(options);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];
    const values = parsed
      .map((option) => Number(option))
      .filter((option) => Number.isInteger(option));
    return values.length ? values : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function calculateEnps(ratings: number[]) {
  const promoters = ratings.filter((rating) => rating >= 9).length;
  const detractors = ratings.filter((rating) => rating <= 6).length;
  return Math.round(((promoters - detractors) / ratings.length) * 100);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}
