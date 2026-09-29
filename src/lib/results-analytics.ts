import { createHash } from "node:crypto";
import type { Session } from "next-auth";
import {
  canManageResultsRelease,
  hasCompanyWideResultsAccess,
  normalizeEmail,
} from "@/lib/access";
import { ANONYMITY_THRESHOLD, isReportableGroup } from "@/lib/constants";
import { parseCommentThemes, COMMENT_SEVERITY_RANK } from "@/lib/comment-analysis-types";
import { DEPARTMENT_GROUPS, departmentBelongsToGroup } from "@/lib/department-groups";
import { prisma } from "@/lib/prisma";
import { ensureSurveyRosterSnapshot } from "@/lib/results-roster";

type SessionUser = Session["user"];

export type ResultsFilters = {
  scope?: "company" | "organization" | "direct" | "leadership";
  departmentIds?: string[];
  locations?: string[];
  divisions?: string[];
  teamIds?: string[];
  viewAsEmail?: string | null;
};

type Snapshot = {
  userId: string | null;
  email: string;
  role: string | null;
  managerEmail: string | null;
  departmentId: string;
  departmentName: string;
  teamId: string | null;
  teamName: string | null;
  location: string | null;
  division: string | null;
};

type SurveyQuestion = {
  id: string;
  order: number;
  section: string | null;
  text: string;
  type: string;
  options: string | null;
};

type ResponseRow = {
  id: string;
  departmentId: string;
  managerEmail: string | null;
  location: string | null;
  division: string | null;
  teamId: string | null;
  submittedAt: Date;
  answers: Array<{
    id: string;
    questionId: string;
    ratingValue: number | null;
    choiceValue: string | null;
    textValue: string | null;
  }>;
};

type CompletionRow = { userId: string; completedAt: Date };

type MetricSet = ReturnType<typeof buildMetrics>;

export type ResultsReleaseMode = "admin" | "global" | "manager_test" | "locked";

type HierarchyRow = ReturnType<typeof compactMetrics> & {
  id: string;
  type: "department" | "combined";
  department: string;
  location: string;
  label: string;
};

export async function getResultsAccessContext(user: SessionUser) {
  const dbUser = await prisma.user.findUnique({
    where: { email: normalizeEmail(user.email) },
    select: { id: true, email: true, role: true, jobTitle: true },
  });

  if (!dbUser) {
    return {
      allowed: false,
      canManage: false,
      companyWide: false,
      executive: false,
      user: null,
    };
  }

  const companyWide = hasCompanyWideResultsAccess(dbUser);
  const canManage = canManageResultsRelease(dbUser);
  const executive = /\b(chief|ceo|founder)\b/i.test(dbUser.jobTitle || "");
  const reports = companyWide
    ? 1
    : await prisma.user.count({
        where: { managerEmail: { equals: dbUser.email, mode: "insensitive" } },
      });

  return {
    allowed: companyWide || dbUser.role === "manager" || reports > 0,
    canManage,
    companyWide,
    executive,
    user: dbUser,
  };
}

export async function getSurveyResultsReleaseAccess(
  surveyId: string,
  sessionUser: SessionUser
) {
  const access = await getResultsAccessContext(sessionUser);
  if (!access.allowed || !access.user) {
    return { allowed: false, mode: "locked" as const, testRelease: false };
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: {
      status: true,
      endDate: true,
      resultsRelease: {
        select: {
          resultsReleasedAt: true,
          insightsReleasedAt: true,
          commentsReleasedAt: true,
        },
      },
    },
  });
  if (!survey) throw new ResultsAccessError("Survey not found", 404);

  if (access.canManage) {
    return { allowed: true, mode: "admin" as const, testRelease: false };
  }

  const leaderEmail = normalizeEmail(access.user.email);
  const targetedRelease = await prisma.surveyResultsGrant.findUnique({
    where: { surveyId_leaderEmail: { surveyId, leaderEmail } },
    select: {
      resultsReleasedAt: true,
      insightsReleasedAt: true,
      commentsReleasedAt: true,
    },
  });
  const surveyClosed = survey.status === "closed" || survey.endDate < new Date();
  const mode = releaseModeFor(
    false,
    surveyClosed,
    survey.resultsRelease,
    targetedRelease
  );

  return {
    allowed: mode !== "locked",
    mode,
    testRelease: mode === "manager_test",
  };
}

export async function buildResultsData(
  surveyId: string,
  sessionUser: SessionUser,
  filters: ResultsFilters = {}
) {
  const access = await getResultsAccessContext(sessionUser);
  if (!access.allowed || !access.user) throw new ResultsAccessError("Forbidden", 403);

  await ensureSurveyRosterSnapshot(surveyId);

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      resultsRelease: true,
    },
  });
  if (!survey) throw new ResultsAccessError("Survey not found", 404);

  const actorEmail = normalizeEmail(access.user.email);
  const actorGrant = access.canManage
    ? null
    : await prisma.surveyResultsGrant.findUnique({
        where: { surveyId_leaderEmail: { surveyId, leaderEmail: actorEmail } },
      });
  const viewerRelease = mergeRelease(survey.resultsRelease, actorGrant);
  const surveyClosed = survey.status === "closed" || survey.endDate < new Date();
  const releaseMode = releaseModeFor(
    access.canManage,
    surveyClosed,
    survey.resultsRelease,
    actorGrant
  );
  const released = releaseMode !== "locked";
  if (!access.canManage && !released) {
    return {
      locked: true,
      access: {
        ...serializeAccess(access),
        releaseMode,
        testRelease: false,
      },
      survey: serializeSurvey(survey),
      release: serializeRelease(viewerRelease),
      anonymityThreshold: ANONYMITY_THRESHOLD,
    };
  }

  const [roster, completions, responses, reviews, employeeNames] = await Promise.all([
    prisma.surveyRosterSnapshot.findMany({
      where: { surveyId, eligible: true },
      select: {
        userId: true,
        email: true,
        role: true,
        managerEmail: true,
        departmentId: true,
        departmentName: true,
        teamId: true,
        teamName: true,
        location: true,
        division: true,
      },
    }),
    prisma.surveyCompletion.findMany({
      where: { surveyId },
      select: { userId: true, completedAt: true },
    }),
    prisma.surveyResponse.findMany({
      where: { surveyId },
      select: {
        id: true,
        departmentId: true,
        managerEmail: true,
        location: true,
        division: true,
        teamId: true,
        submittedAt: true,
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
    prisma.resultCommentReview.findMany({ where: { surveyId } }),
    prisma.user.findMany({ select: { name: true } }),
  ]);

  const allRoster = roster.map(normalizeSnapshot);
  const requestedViewAs = normalizeEmail(filters.viewAsEmail);
  const viewAsEmail = access.canManage && requestedViewAs ? requestedViewAs : null;
  const effectiveEmail = viewAsEmail || actorEmail;
  const leaderEmails = managerEmailsInRoster(allRoster);

  if (viewAsEmail && !leaderEmails.has(viewAsEmail)) {
    throw new ResultsAccessError("The selected leader does not have a reporting group in this survey.", 400);
  }
  const targetGrant = viewAsEmail
    ? await prisma.surveyResultsGrant.findUnique({
        where: { surveyId_leaderEmail: { surveyId, leaderEmail: viewAsEmail } },
      })
    : null;

  const requestedScope = filters.scope || (access.companyWide && !viewAsEmail ? "company" : "organization");
  const scope = normalizeScope(requestedScope, access.companyWide && !viewAsEmail);
  const baseRoster = rosterForScope(allRoster, effectiveEmail, scope, leaderEmails);
  if (!access.companyWide && baseRoster.length === 0) {
    throw new ResultsAccessError("No authorised survey results were found for this reporting group.", 403);
  }

  const normalizedFilters = normalizeFilters(filters);
  const selectedRoster = applyRosterFilters(baseRoster, normalizedFilters);
  const scopedResponses = responsesForScope(
    responses,
    allRoster,
    baseRoster,
    effectiveEmail,
    scope,
    normalizedFilters
  );
  const completionIds = new Set(completions.map((completion) => completion.userId));
  const selectedCompletions = selectedRoster.filter(
    (employee) => employee.userId && completionIds.has(employee.userId)
  ).length;
  const metrics = buildMetrics(
    survey.questions,
    scopedResponses,
    selectedRoster.length,
    selectedCompletions
  );

  const companyRoster = allRoster;
  const companyCompletionCount = companyRoster.filter(
    (employee) => employee.userId && completionIds.has(employee.userId)
  ).length;
  const companyMetrics = buildMetrics(
    survey.questions,
    responses,
    companyRoster.length,
    companyCompletionCount
  );
  const parentBenchmark = buildParentBenchmark({
    questions: survey.questions,
    responses,
    roster: allRoster,
    completions,
    effectiveEmail,
    filters: normalizedFilters,
  });

  const hierarchyRows = buildHierarchyRows({
    questions: survey.questions,
    roster: selectedRoster,
    responses: scopedResponses,
    completionIds,
  });
  const comparison = buildComparisonData({
    questions: survey.questions,
    allRoster,
    allResponses: responses,
    selectedMetrics: metrics,
    companyMetrics,
    hierarchyRows,
    completionIds,
    effectiveEmail,
    scope,
    scopeLabel: buildScopeLabel(scope, selectedRoster, normalizedFilters),
    filters: normalizedFilters,
  });
  const textAnswers = scopedResponses.flatMap((response) =>
    response.answers
      .filter((answer) => Boolean(answer.textValue?.trim()))
      .map((answer) => ({
        ...answer,
        response,
        textValue: answer.textValue!.trim(),
      }))
  );
  const analyses = textAnswers.length
    ? await prisma.commentAnalysis.findMany({
        where: {
          sourceType: "survey",
          sourceId: { in: textAnswers.map((answer) => answer.id) },
        },
      })
    : [];
  const analysisByAnswer = new Map(analyses.map((analysis) => [analysis.sourceId, analysis]));
  const reviewByAnswer = new Map(reviews.map((review) => [review.answerId, review]));
  const themes = buildThemes(analyses);
  const sentiment = buildSentiment(analyses);
  const reportable = isReportableGroup(selectedCompletions);
  const canSeeAllComments = access.canManage || access.executive;
  const commentsReleased = Boolean(viewerRelease.commentsReleasedAt);
  const allowManagerComments = !canSeeAllComments && commentsReleased;
  const names = employeeNames.map((employee) => employee.name).filter(Boolean);
  const comments = reportable
    ? textAnswers
        .filter((answer) => {
          if (canSeeAllComments) return true;
          return allowManagerComments && reviewByAnswer.get(answer.id)?.status === "approved";
        })
        .map((answer) => {
          const analysis = analysisByAnswer.get(answer.id);
          const review = reviewByAnswer.get(answer.id);
          const question = survey.questions.find((item) => item.id === answer.questionId);
          return {
            id: access.canManage ? answer.id : undefined,
            text: sanitizeAnonymousComment(answer.textValue, names),
            question: question?.text || "Written response",
            department: departmentNameForId(allRoster, answer.response.departmentId),
            location: answer.response.location || "Location not listed",
            sentiment: analysis?.sentiment || "pending",
            severity: analysis?.severity || "pending",
            themes: parseCommentThemes(analysis?.themes),
            status: access.canManage ? review?.status || "pending" : undefined,
            submittedAt: answer.response.submittedAt.toISOString(),
          };
        })
        .sort(compareComments)
    : [];

  const scopeKey = buildScopeKey({
    surveyId,
    effectiveEmail: scope === "company" ? "company" : effectiveEmail,
    scope,
    filters: normalizedFilters,
  });
  const scopeLabel = buildScopeLabel(scope, selectedRoster, normalizedFilters);
  const generatedInsights = buildInsightCandidates({
    metrics,
    hierarchyRows,
    themes,
    scopeLabel,
  });
  const storedInsights = await prisma.resultInsight.findMany({
    where: { surveyId, scopeKey },
    orderBy: [{ sortOrder: "asc" }, { generatedAt: "asc" }],
  });
  const visibleInsights = storedInsights.length
    ? storedInsights
        .filter((insight) => access.canManage || insight.status === "approved")
        .map(serializeInsight)
    : access.canManage
      ? generatedInsights.map((insight) => ({ ...insight, id: null, status: "pending" }))
      : [];
  const insightsReleased = Boolean(viewerRelease.insightsReleasedAt);

  await writeResultsAudit({
    surveyId,
    user: sessionUser,
    action: "view_results",
    scopeKey,
    metadata: {
      scope,
      departmentIds: normalizedFilters.departmentIds,
      locations: normalizedFilters.locations,
      divisions: normalizedFilters.divisions,
      teamIds: normalizedFilters.teamIds,
      viewAs: Boolean(viewAsEmail),
    },
  });

  return {
    locked: false,
    access: {
      ...serializeAccess(access),
      viewingAsLeader: Boolean(viewAsEmail),
      releaseMode,
      testRelease: releaseMode === "manager_test",
    },
    survey: serializeSurvey(survey),
    release: serializeRelease(access.canManage ? survey.resultsRelease : viewerRelease),
    targetRelease: viewAsEmail ? serializeRelease(targetGrant) : null,
    scope: {
      type: scope,
      label: scopeLabel,
      key: scopeKey,
      options: scopeOptions(access.companyWide && !viewAsEmail, baseRoster, leaderEmails),
    },
    filters: {
      selected: normalizedFilters,
      options: buildFilterOptions(baseRoster),
    },
    metrics: {
      ...metrics,
      enps: companyMetrics.enps,
      enpsResponses: companyMetrics.enpsResponses,
      enpsLabel: "Company-wide eNPS",
    },
    benchmarks: {
      company: benchmarkFromMetrics("Company-wide", companyMetrics),
      parent: parentBenchmark,
    },
    questions: reportable ? metrics.questions : metrics.questions.map(protectQuestion),
    hierarchy: hierarchyRows,
    comparison,
    sentiment: reportable ? sentiment : null,
    themes: reportable ? themes : [],
    comments,
    commentAccess: {
      mode: access.canManage ? "review" : access.executive ? "all" : "approved_only",
      released: canSeeAllComments ? released : commentsReleased,
      totalInScope: reportable ? textAnswers.length : null,
      visible: comments.length,
    },
    insights:
      access.canManage || insightsReleased
        ? visibleInsights
        : [],
    insightCandidates: access.canManage ? generatedInsights : undefined,
    insightsAwaitingRelease:
      !access.canManage && (!insightsReleased || visibleInsights.length === 0),
    anonymityThreshold: ANONYMITY_THRESHOLD,
    generatedAt: new Date().toISOString(),
  };
}

export async function getResultsCatalog(sessionUser: SessionUser) {
  const access = await getResultsAccessContext(sessionUser);
  if (!access.allowed || !access.user) throw new ResultsAccessError("Forbidden", 403);
  const actorEmail = normalizeEmail(access.user.email);

  const surveys = await prisma.survey.findMany({
    where: access.canManage
      ? { status: { in: ["active", "closed"] } }
      : {
          AND: [
            { OR: [{ status: "closed" }, { endDate: { lt: new Date() } }] },
            {
              OR: [
                { resultsRelease: { resultsReleasedAt: { not: null } } },
                {
                  resultsGrants: {
                    some: {
                      leaderEmail: actorEmail,
                      resultsReleasedAt: { not: null },
                    },
                  },
                },
              ],
            },
          ],
        },
    orderBy: { startDate: "desc" },
    include: {
      resultsRelease: true,
      resultsGrants: { where: { leaderEmail: actorEmail } },
    },
  });

  const latestSurvey = surveys[0];
  let leaders: Array<{ email: string; name: string; detail: string }> = [];
  if (access.canManage && latestSurvey) {
    await ensureSurveyRosterSnapshot(latestSurvey.id);
    const managerEmails = await prisma.surveyRosterSnapshot.findMany({
      where: { surveyId: latestSurvey.id, managerEmail: { not: null } },
      distinct: ["managerEmail"],
      select: { managerEmail: true },
    });
    const emails = managerEmails
      .map((item) => normalizeEmail(item.managerEmail))
      .filter(Boolean);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, name: true, department: { select: { name: true } }, location: true },
      orderBy: { name: "asc" },
    });
    leaders = users.map((user) => ({
      email: user.email,
      name: user.name,
      detail: [user.department.name, shortLocation(user.location)].filter(Boolean).join(" | "),
    }));
  }

  return {
    access: serializeAccess(access),
    surveys: surveys.map((survey) => ({
      ...serializeSurvey(survey),
      release: serializeRelease(
        access.canManage
          ? survey.resultsRelease
          : mergeRelease(survey.resultsRelease, survey.resultsGrants[0] || null)
      ),
    })),
    leaders,
  };
}

export async function writeResultsAudit(input: {
  surveyId?: string | null;
  user: SessionUser;
  action: string;
  scopeKey?: string | null;
  format?: string | null;
  metadata?: unknown;
}) {
  try {
    await prisma.resultsAuditLog.create({
      data: {
        surveyId: input.surveyId || null,
        actorId: input.user.id,
        actorEmail: normalizeEmail(input.user.email),
        action: input.action,
        scopeKey: input.scopeKey || null,
        format: input.format || null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  } catch (error) {
    console.error("Unable to write results audit log", error);
  }
}

export class ResultsAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function serializeAccess(access: Awaited<ReturnType<typeof getResultsAccessContext>>) {
  return {
    canManage: access.canManage,
    companyWide: access.companyWide,
    executive: access.executive,
  };
}

function serializeSurvey(survey: {
  id: string;
  title: string;
  status: string;
  startDate: Date;
  endDate: Date;
}) {
  return {
    id: survey.id,
    title: survey.title,
    status: survey.status,
    startDate: survey.startDate.toISOString(),
    endDate: survey.endDate.toISOString(),
  };
}

function serializeRelease(
  release:
    | {
        resultsReleasedAt: Date | null;
        insightsReleasedAt: Date | null;
        commentsReleasedAt: Date | null;
      }
    | null
) {
  return {
    resultsReleasedAt: release?.resultsReleasedAt?.toISOString() || null,
    insightsReleasedAt: release?.insightsReleasedAt?.toISOString() || null,
    commentsReleasedAt: release?.commentsReleasedAt?.toISOString() || null,
  };
}

function mergeRelease(
  globalRelease: {
    resultsReleasedAt: Date | null;
    insightsReleasedAt: Date | null;
    commentsReleasedAt: Date | null;
  } | null,
  targetedRelease: {
    resultsReleasedAt: Date | null;
    insightsReleasedAt: Date | null;
    commentsReleasedAt: Date | null;
  } | null
) {
  return {
    resultsReleasedAt:
      globalRelease?.resultsReleasedAt || targetedRelease?.resultsReleasedAt || null,
    insightsReleasedAt:
      globalRelease?.insightsReleasedAt || targetedRelease?.insightsReleasedAt || null,
    commentsReleasedAt:
      globalRelease?.commentsReleasedAt || targetedRelease?.commentsReleasedAt || null,
  };
}

function releaseModeFor(
  canManage: boolean,
  surveyClosed: boolean,
  globalRelease: { resultsReleasedAt: Date | null } | null,
  targetedRelease: { resultsReleasedAt: Date | null } | null
): ResultsReleaseMode {
  if (canManage) return "admin";
  if (!surveyClosed) return "locked";
  if (globalRelease?.resultsReleasedAt) return "global";
  if (targetedRelease?.resultsReleasedAt) return "manager_test";
  return "locked";
}

function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    email: normalizeEmail(snapshot.email),
    managerEmail: normalizeEmail(snapshot.managerEmail) || null,
  };
}

function normalizeScope(
  requested: NonNullable<ResultsFilters["scope"]>,
  mayUseCompany: boolean
): NonNullable<ResultsFilters["scope"]> {
  if (requested === "company" && !mayUseCompany) return "organization";
  return requested;
}

function normalizeFilters(filters: ResultsFilters) {
  return {
    departmentIds: unique(filters.departmentIds || []),
    locations: unique(filters.locations || []),
    divisions: unique(filters.divisions || []),
    teamIds: unique(filters.teamIds || []),
  };
}

function managerEmailsInRoster(roster: Snapshot[]) {
  return new Set(roster.map((employee) => employee.managerEmail).filter(Boolean) as string[]);
}

function rosterForScope(
  roster: Snapshot[],
  effectiveEmail: string,
  scope: NonNullable<ResultsFilters["scope"]>,
  leaderEmails: Set<string>
) {
  if (scope === "company") return roster;
  if (scope === "direct" || scope === "leadership") {
    const direct = roster.filter((employee) => employee.managerEmail === effectiveEmail);
    return scope === "leadership"
      ? direct.filter(
          (employee) => employee.role === "manager" || leaderEmails.has(employee.email)
        )
      : direct;
  }

  return descendantsFor(roster, effectiveEmail);
}

function descendantsFor(roster: Snapshot[], managerEmail: string) {
  const byManager = new Map<string, Snapshot[]>();
  for (const employee of roster) {
    if (!employee.managerEmail) continue;
    const reports = byManager.get(employee.managerEmail) || [];
    reports.push(employee);
    byManager.set(employee.managerEmail, reports);
  }

  const result: Snapshot[] = [];
  const queue = [...(byManager.get(managerEmail) || [])];
  const seen = new Set<string>();
  while (queue.length) {
    const employee = queue.shift();
    if (!employee || seen.has(employee.email)) continue;
    seen.add(employee.email);
    result.push(employee);
    queue.push(...(byManager.get(employee.email) || []));
  }
  return result;
}

function applyRosterFilters(
  roster: Snapshot[],
  filters: ReturnType<typeof normalizeFilters>
) {
  return roster.filter((employee) => {
    if (filters.departmentIds.length && !filters.departmentIds.includes(employee.departmentId)) return false;
    if (filters.locations.length && !filters.locations.includes(employee.location || "")) return false;
    if (filters.divisions.length && !filters.divisions.includes(employee.division || "")) return false;
    if (filters.teamIds.length && !filters.teamIds.includes(employee.teamId || "")) return false;
    return true;
  });
}

function responsesForScope(
  responses: ResponseRow[],
  allRoster: Snapshot[],
  baseRoster: Snapshot[],
  effectiveEmail: string,
  scope: NonNullable<ResultsFilters["scope"]>,
  filters: ReturnType<typeof normalizeFilters>
) {
  if (baseRoster.length === 0) return [];
  const scopedManagerEmails = new Set<string>();
  if (scope !== "company") {
    scopedManagerEmails.add(effectiveEmail);
    if (scope === "organization") {
      for (const employee of baseRoster) scopedManagerEmails.add(employee.email);
    }
  }

  const leadershipKeys =
    scope === "leadership"
      ? new Set(baseRoster.map(snapshotDemographicKey))
      : null;

  return responses.filter((response) => {
    if (
      scope !== "company" &&
      !scopedManagerEmails.has(normalizeEmail(response.managerEmail))
    ) {
      return false;
    }
    if (filters.departmentIds.length && !filters.departmentIds.includes(response.departmentId)) return false;
    if (filters.locations.length && !filters.locations.includes(response.location || "")) return false;
    if (filters.divisions.length && !filters.divisions.includes(response.division || "")) return false;
    if (filters.teamIds.length && !filters.teamIds.includes(response.teamId || "")) return false;
    if (leadershipKeys && !leadershipKeys.has(responseDemographicKey(response))) return false;
    return true;
  });
}

function snapshotDemographicKey(employee: Snapshot) {
  return [
    employee.departmentId,
    employee.location || "",
    employee.division || "",
    employee.teamId || "",
  ].join("::");
}

function responseDemographicKey(response: ResponseRow) {
  return [
    response.departmentId,
    response.location || "",
    response.division || "",
    response.teamId || "",
  ].join("::");
}

function buildMetrics(
  questions: SurveyQuestion[],
  responses: ResponseRow[],
  eligibleEmployees: number,
  completions: number
) {
  const reportable = isReportableGroup(completions);
  const standardQuestions = questions.filter(isStandardRatingQuestion);
  const standardIds = new Set(standardQuestions.map((question) => question.id));
  const standardRatings = responses.flatMap((response) =>
    response.answers
      .filter(
        (answer) => standardIds.has(answer.questionId) && answer.ratingValue !== null
      )
      .map((answer) => answer.ratingValue as number)
  );
  const recommendation = questions.find(isEnpsQuestion);
  const enpsRatings = recommendation
    ? ratingsForQuestion(responses, recommendation.id)
    : [];
  const friendQuestion = questions.find(
    (question) => question.type === "multiple_choice" && /best friend/i.test(question.text)
  );
  const friendChoices = friendQuestion
    ? responses.flatMap((response) =>
        response.answers
          .filter((answer) => answer.questionId === friendQuestion.id)
          .map((answer) => answer.choiceValue?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value))
      )
    : [];
  const textAnswers = responses.flatMap((response) =>
    response.answers.filter((answer) => Boolean(answer.textValue?.trim()))
  );

  return {
    eligibleEmployees,
    completions,
    participationRate: eligibleEmployees
      ? Math.round((completions / eligibleEmployees) * 100)
      : 0,
    responseCount: responses.length,
    suppressed: !reportable,
    averageRating: reportable ? average(standardRatings) : null,
    favorablePercent: reportable ? percentage(standardRatings, (rating) => rating >= 4) : null,
    neutralPercent: reportable ? percentage(standardRatings, (rating) => rating === 3) : null,
    unfavorablePercent: reportable ? percentage(standardRatings, (rating) => rating <= 2) : null,
    friendYesPercent:
      reportable && friendChoices.length
        ? percentage(friendChoices, (choice) => choice === "yes")
        : null,
    commentCount: reportable ? textAnswers.length : null,
    enps: reportable && enpsRatings.length ? calculateEnps(enpsRatings) : null,
    enpsResponses: reportable ? enpsRatings.length : null,
    questions: questions
      .filter((question) => question.type === "rating")
      .map((question) => buildQuestionMetric(question, responses, reportable)),
  };
}

function buildQuestionMetric(
  question: SurveyQuestion,
  responses: ResponseRow[],
  reportable: boolean
) {
  const scale = ratingOptions(question);
  const ratings = ratingsForQuestion(responses, question.id);
  const standard = Math.min(...scale) === 1 && Math.max(...scale) === 5;
  const enps = Math.min(...scale) === 0 && Math.max(...scale) === 10;
  return {
    id: question.id,
    order: question.order + 1,
    section: question.section,
    question: question.text,
    responses: reportable ? ratings.length : null,
    average: reportable ? average(ratings) : null,
    scaleMin: Math.min(...scale),
    scaleMax: Math.max(...scale),
    favorablePercent: reportable && standard
      ? percentage(ratings, (rating) => rating >= 4)
      : null,
    neutralPercent: reportable && standard
      ? percentage(ratings, (rating) => rating === 3)
      : null,
    unfavorablePercent: reportable && standard
      ? percentage(ratings, (rating) => rating <= 2)
      : null,
    isEnps: enps,
  };
}

function protectQuestion(question: ReturnType<typeof buildQuestionMetric>) {
  return {
    ...question,
    responses: null,
    average: null,
    favorablePercent: null,
    neutralPercent: null,
    unfavorablePercent: null,
  };
}

function buildHierarchyRows(input: {
  questions: SurveyQuestion[];
  roster: Snapshot[];
  responses: ResponseRow[];
  completionIds: Set<string>;
}) {
  const groups = new Map<string, Snapshot[]>();
  for (const employee of input.roster) {
    const key = `${employee.departmentId}::${employee.location || ""}`;
    const members = groups.get(key) || [];
    members.push(employee);
    groups.set(key, members);
  }

  const rows: HierarchyRow[] = [...groups.entries()].map(([key, members]) => {
    const first = members[0];
    const groupResponses = input.responses.filter(
      (response) =>
        response.departmentId === first.departmentId &&
        (response.location || "") === (first.location || "")
    );
    const completed = members.filter(
      (member) => member.userId && input.completionIds.has(member.userId)
    ).length;
    return {
      id: `department:${key}`,
      type: "department" as const,
      department: first.departmentName,
      location: first.location || "Location not listed",
      label: `${first.departmentName}, ${shortLocation(first.location)}`,
      ...compactMetrics(buildMetrics(input.questions, groupResponses, members.length, completed)),
    };
  });

  const production = DEPARTMENT_GROUPS.find((group) => group.id === "production");
  if (production) {
    const productionRoster = input.roster.filter((employee) =>
      departmentBelongsToGroup(employee.departmentName, production)
    );
    for (const location of unique(productionRoster.map((employee) => employee.location || ""))) {
      const members = productionRoster.filter(
        (employee) => (employee.location || "") === location
      );
      if (!members.length) continue;
      const departmentIds = new Set(members.map((employee) => employee.departmentId));
      const groupResponses = input.responses.filter(
        (response) =>
          departmentIds.has(response.departmentId) &&
          (response.location || "") === location
      );
      const completed = members.filter(
        (member) => member.userId && input.completionIds.has(member.userId)
      ).length;
      rows.push({
        id: `production:${location}`,
        type: "combined" as const,
        department: "Production Total",
        location: location || "Location not listed",
        label: `Production Total, ${shortLocation(location)}`,
        ...compactMetrics(buildMetrics(input.questions, groupResponses, members.length, completed)),
      });
    }
  }

  return rows.sort((left, right) => {
    if (left.type !== right.type) return left.type === "combined" ? -1 : 1;
    return left.label.localeCompare(right.label);
  });
}

function compactMetrics(metrics: MetricSet) {
  return {
    eligibleEmployees: metrics.eligibleEmployees,
    completions: metrics.completions,
    participationRate: metrics.participationRate,
    averageRating: metrics.averageRating,
    favorablePercent: metrics.favorablePercent,
    suppressed: metrics.suppressed,
    questions: metrics.questions,
  };
}

function buildComparisonData(input: {
  questions: SurveyQuestion[];
  allRoster: Snapshot[];
  allResponses: ResponseRow[];
  selectedMetrics: MetricSet;
  companyMetrics: MetricSet;
  hierarchyRows: HierarchyRow[];
  completionIds: Set<string>;
  effectiveEmail: string;
  scope: NonNullable<ResultsFilters["scope"]>;
  scopeLabel: string;
  filters: ReturnType<typeof normalizeFilters>;
}) {
  const groups = [];
  const selectedIsCompany = input.scope === "company" && !hasFilters(input.filters);

  if (!selectedIsCompany) {
    groups.push({
      id: "selected",
      type: "selected",
      label:
        input.scope === "leadership"
          ? "Direct leadership team"
          : input.scope === "company"
            ? "Filtered company view"
            : "Direct reports",
      detail: input.scopeLabel,
      ...comparisonMetrics(input.selectedMetrics),
    });
  }

  groups.push({
    id: "company",
    type: "company",
    label: "Company-wide",
    detail: "All eligible employees and survey responses",
    ...comparisonMetrics(input.companyMetrics),
  });

  groups.push(
    ...buildReportingGroupComparisons({
      questions: input.questions,
      roster: input.allRoster,
      responses: input.allResponses,
      completionIds: input.completionIds,
      effectiveEmail: input.effectiveEmail,
      filters: input.filters,
    })
  );

  groups.push(
    ...input.hierarchyRows.map((row) => ({
      id: row.id,
      type: row.type,
      label: row.label,
      detail: row.type === "combined" ? "Combined department group" : "Department by site",
      eligibleEmployees: row.eligibleEmployees,
      completions: row.completions,
      participationRate: row.participationRate,
      averageRating: row.averageRating,
      favorablePercent: row.favorablePercent,
      suppressed: row.suppressed,
      questions: row.questions,
    }))
  );

  return {
    questions: input.companyMetrics.questions.map((question) => ({
      id: question.id,
      order: question.order,
      section: question.section,
      question: question.question,
      scaleMax: question.scaleMax,
      isEnps: question.isEnps,
    })),
    groups: uniqueBy(groups, (group) => group.id),
  };
}

function buildReportingGroupComparisons(input: {
  questions: SurveyQuestion[];
  roster: Snapshot[];
  responses: ResponseRow[];
  completionIds: Set<string>;
  effectiveEmail: string;
  filters: ReturnType<typeof normalizeFilters>;
}) {
  const leaderEmails = managerEmailsInRoster(input.roster);
  const directLeaders = input.roster.filter(
    (employee) =>
      employee.managerEmail === input.effectiveEmail && leaderEmails.has(employee.email)
  );
  const provisional = directLeaders.flatMap((leader) => {
    const fullRoster = descendantsFor(input.roster, leader.email);
    const roster = applyRosterFilters(fullRoster, input.filters);
    if (!roster.length) return [];

    const reportingEmails = new Set([
      leader.email,
      ...fullRoster.map((employee) => employee.email),
    ]);
    const responses = input.responses.filter(
      (response) =>
        reportingEmails.has(normalizeEmail(response.managerEmail)) &&
        responseMatchesFilters(response, input.filters)
    );
    const completions = roster.filter(
      (employee) => employee.userId && input.completionIds.has(employee.userId)
    ).length;
    const metrics = buildMetrics(input.questions, responses, roster.length, completions);
    return [
      {
        id: `reporting:${createHash("sha256").update(leader.email).digest("hex").slice(0, 12)}`,
        type: "reporting_group",
        label: reportingGroupLabel(roster),
        detail: "Direct reporting organisation",
        ...comparisonMetrics(metrics),
      },
    ];
  });

  const labelTotals = provisional.reduce((totals, group) => {
    totals.set(group.label, (totals.get(group.label) || 0) + 1);
    return totals;
  }, new Map<string, number>());
  const labelCounts = new Map<string, number>();
  return provisional.map((group) => {
    const count = (labelCounts.get(group.label) || 0) + 1;
    labelCounts.set(group.label, count);
    return labelTotals.get(group.label) === 1
      ? group
      : { ...group, label: `${group.label} · Group ${count}` };
  });
}

function comparisonMetrics(metrics: MetricSet) {
  return {
    eligibleEmployees: metrics.eligibleEmployees,
    completions: metrics.completions,
    participationRate: metrics.participationRate,
    averageRating: metrics.averageRating,
    favorablePercent: metrics.favorablePercent,
    suppressed: metrics.suppressed,
    questions: metrics.questions,
  };
}

function reportingGroupLabel(roster: Snapshot[]) {
  const departments = unique(roster.map((employee) => employee.departmentName));
  const locations = unique(roster.map((employee) => shortLocation(employee.location)));
  const department =
    departments.length === 1 ? departments[0] : `${departments.length} Departments`;
  const location =
    locations.length === 1
      ? locations[0]
      : locations.length > 1
        ? `${locations.length} Locations`
        : "Location Not Listed";
  return `${department}, ${location}`;
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const current = key(value);
    if (seen.has(current)) return false;
    seen.add(current);
    return true;
  });
}

function buildParentBenchmark(input: {
  questions: SurveyQuestion[];
  responses: ResponseRow[];
  roster: Snapshot[];
  completions: CompletionRow[];
  effectiveEmail: string;
  filters: ReturnType<typeof normalizeFilters>;
}) {
  const current = input.roster.find((employee) => employee.email === input.effectiveEmail);
  if (!current?.managerEmail) return null;
  const parentRoster = applyRosterFilters(
    descendantsFor(input.roster, current.managerEmail),
    input.filters
  );
  if (!parentRoster.length) return null;
  const managerEmails = new Set([current.managerEmail, ...parentRoster.map((employee) => employee.email)]);
  const responses = input.responses.filter(
    (response) =>
      managerEmails.has(normalizeEmail(response.managerEmail)) &&
      responseMatchesFilters(response, input.filters)
  );
  const completionIds = new Set(input.completions.map((completion) => completion.userId));
  const completed = parentRoster.filter(
    (employee) => employee.userId && completionIds.has(employee.userId)
  ).length;
  return benchmarkFromMetrics(
    "Department reporting group",
    buildMetrics(input.questions, responses, parentRoster.length, completed)
  );
}

function benchmarkFromMetrics(label: string, metrics: MetricSet) {
  return {
    label,
    eligibleEmployees: metrics.eligibleEmployees,
    completions: metrics.completions,
    participationRate: metrics.participationRate,
    averageRating: metrics.averageRating,
    favorablePercent: metrics.favorablePercent,
  };
}

function responseMatchesFilters(
  response: ResponseRow,
  filters: ReturnType<typeof normalizeFilters>
) {
  if (filters.departmentIds.length && !filters.departmentIds.includes(response.departmentId)) return false;
  if (filters.locations.length && !filters.locations.includes(response.location || "")) return false;
  if (filters.divisions.length && !filters.divisions.includes(response.division || "")) return false;
  if (filters.teamIds.length && !filters.teamIds.includes(response.teamId || "")) return false;
  return true;
}

function buildThemes(
  analyses: Array<{ themes: string; severity: string; sentiment: string }>
) {
  const groups = new Map<
    string,
    { theme: string; mentions: number; critical: number; high: number; negative: number; severityRank: number }
  >();
  for (const analysis of analyses) {
    for (const theme of parseCommentThemes(analysis.themes)) {
      const current = groups.get(theme) || {
        theme,
        mentions: 0,
        critical: 0,
        high: 0,
        negative: 0,
        severityRank: 99,
      };
      current.mentions += 1;
      if (analysis.severity === "critical") current.critical += 1;
      if (analysis.severity === "high") current.high += 1;
      if (analysis.sentiment === "negative") current.negative += 1;
      current.severityRank = Math.min(
        current.severityRank,
        COMMENT_SEVERITY_RANK[analysis.severity as keyof typeof COMMENT_SEVERITY_RANK] ?? 5
      );
      groups.set(theme, current);
    }
  }

  return [...groups.values()]
    .sort(
      (left, right) =>
        left.severityRank - right.severityRank ||
        right.mentions - left.mentions ||
        left.theme.localeCompare(right.theme)
    )
    .map((theme) => ({
      theme: theme.theme,
      mentions: theme.mentions,
      critical: theme.critical,
      high: theme.high,
      negative: theme.negative,
    }));
}

function buildSentiment(analyses: Array<{ sentiment: string }>) {
  const counts = { positive: 0, neutral: 0, negative: 0, mixed: 0, total: analyses.length };
  for (const analysis of analyses) {
    if (analysis.sentiment in counts && analysis.sentiment !== "total") {
      counts[analysis.sentiment as "positive" | "neutral" | "negative" | "mixed"] += 1;
    }
  }
  return counts;
}

function buildInsightCandidates(input: {
  metrics: MetricSet;
  hierarchyRows: HierarchyRow[];
  themes: ReturnType<typeof buildThemes>;
  scopeLabel: string;
}) {
  if (input.metrics.suppressed) return [];
  const standardQuestions = input.metrics.questions.filter(
    (question) => question.scaleMin === 1 && question.scaleMax === 5 && question.average !== null
  );
  const highest = [...standardQuestions].sort((a, b) => (b.average || 0) - (a.average || 0))[0];
  const lowest = [...standardQuestions].sort((a, b) => (a.average || 0) - (b.average || 0))[0];
  const reportableGroups = input.hierarchyRows.filter((row) => !row.suppressed && row.averageRating !== null);
  const strongest = [...reportableGroups].sort(
    (a, b) => (b.averageRating || 0) - (a.averageRating || 0)
  )[0];
  const weakest = [...reportableGroups].sort(
    (a, b) => (a.averageRating || 0) - (b.averageRating || 0)
  )[0];
  const leadingTheme = input.themes[0];
  const insights: Array<{
    insightKey: string;
    kind: string;
    title: string;
    body: string;
    severity: string;
    evidence: string;
    sortOrder: number;
  }> = [];

  if (highest) {
    insights.push({
      insightKey: "highest-question",
      kind: "highlight",
      title: "Highest-rated experience",
      body: `${highest.question} is the highest-rated item for this reporting group at ${highest.average} out of 5 (${highest.favorablePercent}% favourable).`,
      severity: "positive",
      evidence: JSON.stringify({ questionId: highest.id, average: highest.average }),
      sortOrder: 10,
    });
  }
  if (lowest) {
    insights.push({
      insightKey: "lowest-question",
      kind: "watch",
      title: "Primary area to watch",
      body: `${lowest.question} is the lowest-rated item at ${lowest.average} out of 5 (${lowest.favorablePercent}% favourable).`,
      severity: (lowest.average || 0) < 3.5 ? "high" : "medium",
      evidence: JSON.stringify({ questionId: lowest.id, average: lowest.average }),
      sortOrder: 20,
    });
  }
  if (strongest && weakest && strongest.id !== weakest.id) {
    insights.push({
      insightKey: "group-spread",
      kind: "comparison",
      title: "Largest result spread",
      body: `${strongest.label} is highest at ${strongest.averageRating} out of 5, while ${weakest.label} is lowest at ${weakest.averageRating}.`,
      severity: "medium",
      evidence: JSON.stringify({ strongest: strongest.id, weakest: weakest.id }),
      sortOrder: 30,
    });
  }
  if (leadingTheme) {
    const severity = leadingTheme.critical ? "critical" : leadingTheme.high ? "high" : "medium";
    insights.push({
      insightKey: "leading-theme",
      kind: "theme",
      title: `${leadingTheme.theme} is the leading comment theme`,
      body: `${leadingTheme.mentions} comment${leadingTheme.mentions === 1 ? "" : "s"} mention this theme. It ranks first based on severity and frequency.`,
      severity,
      evidence: JSON.stringify(leadingTheme),
      sortOrder: 40,
    });
  }
  return insights;
}

function serializeInsight(insight: {
  id: string;
  insightKey: string;
  kind: string;
  title: string;
  body: string;
  severity: string;
  evidence: string;
  status: string;
  sortOrder: number;
}) {
  return {
    id: insight.id,
    insightKey: insight.insightKey,
    kind: insight.kind,
    title: insight.title,
    body: insight.body,
    severity: insight.severity,
    evidence: safeJson(insight.evidence),
    status: insight.status,
    sortOrder: insight.sortOrder,
  };
}

function buildScopeKey(input: {
  surveyId: string;
  effectiveEmail: string;
  scope: string;
  filters: ReturnType<typeof normalizeFilters>;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24);
}

function buildScopeLabel(
  scope: NonNullable<ResultsFilters["scope"]>,
  roster: Snapshot[],
  filters: ReturnType<typeof normalizeFilters>
) {
  if (scope === "company" && !hasFilters(filters)) return "Company-wide";
  const departments = unique(roster.map((employee) => employee.departmentName));
  const locations = unique(roster.map((employee) => shortLocation(employee.location)));
  const parts = [
    departments.length === 1 ? departments[0] : departments.length > 1 ? `${departments.length} Departments` : null,
    locations.length === 1 ? locations[0] : locations.length > 1 ? `${locations.length} Locations` : null,
  ].filter(Boolean);
  if (parts.length) return `Team Results: ${parts.join(", ")}`;
  if (scope === "leadership") return "Direct leadership team";
  if (scope === "direct") return "Direct reports";
  return "My organisation";
}

function hasFilters(filters: ReturnType<typeof normalizeFilters>) {
  return Boolean(
    filters.departmentIds.length ||
      filters.locations.length ||
      filters.divisions.length ||
      filters.teamIds.length
  );
}

function scopeOptions(
  companyWide: boolean,
  roster: Snapshot[],
  leaderEmails: Set<string>
) {
  const hasLeadership = roster.some(
    (employee) => employee.role === "manager" || leaderEmails.has(employee.email)
  );
  return [
    ...(companyWide ? [{ value: "company", label: "Company-wide" }] : []),
    { value: "organization", label: "My organisation" },
    { value: "direct", label: "Direct reports" },
    ...(hasLeadership
      ? [{ value: "leadership", label: "Direct leadership team" }]
      : []),
  ];
}

function buildFilterOptions(roster: Snapshot[]) {
  const departments = new Map<string, string>();
  const teams = new Map<string, string>();
  for (const employee of roster) {
    departments.set(employee.departmentId, employee.departmentName);
    if (employee.teamId) teams.set(employee.teamId, employee.teamName || "Team not listed");
  }
  return {
    departments: [...departments.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    locations: unique(roster.map((employee) => employee.location).filter(Boolean) as string[]),
    divisions: unique(roster.map((employee) => employee.division).filter(Boolean) as string[]),
    teams: [...teams.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function departmentNameForId(roster: Snapshot[], departmentId: string) {
  return roster.find((employee) => employee.departmentId === departmentId)?.departmentName || "Department not listed";
}

function sanitizeAnonymousComment(text: string, employeeNames: string[]) {
  let sanitized = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone removed]");

  for (const name of employeeNames) {
    const normalized = name.trim();
    if (normalized.length < 5 || !normalized.includes(" ")) continue;
    sanitized = sanitized.replace(new RegExp(escapeRegExp(normalized), "gi"), "[name removed]");
  }
  return sanitized;
}

function compareComments(
  left: { severity: string; submittedAt: string },
  right: { severity: string; submittedAt: string }
) {
  const leftRank = COMMENT_SEVERITY_RANK[left.severity as keyof typeof COMMENT_SEVERITY_RANK] ?? 9;
  const rightRank = COMMENT_SEVERITY_RANK[right.severity as keyof typeof COMMENT_SEVERITY_RANK] ?? 9;
  return leftRank - rightRank || right.submittedAt.localeCompare(left.submittedAt);
}

function ratingsForQuestion(responses: ResponseRow[], questionId: string) {
  return responses.flatMap((response) =>
    response.answers
      .filter((answer) => answer.questionId === questionId && answer.ratingValue !== null)
      .map((answer) => answer.ratingValue as number)
  );
}

function isStandardRatingQuestion(question: SurveyQuestion) {
  if (question.type !== "rating") return false;
  const options = ratingOptions(question);
  return Math.min(...options) === 1 && Math.max(...options) === 5;
}

function isEnpsQuestion(question: SurveyQuestion) {
  if (question.type !== "rating") return false;
  const options = ratingOptions(question);
  return Math.min(...options) === 0 && Math.max(...options) === 10;
}

function ratingOptions(question: Pick<SurveyQuestion, "options">) {
  if (!question.options) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(question.options);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];
    const values = parsed
      .map((option) => Number(typeof option === "object" && option ? option.value : option))
      .filter((option) => Number.isInteger(option));
    return values.length ? values : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function calculateEnps(ratings: number[]) {
  if (!ratings.length) return null;
  const promoters = ratings.filter((rating) => rating >= 9).length;
  const detractors = ratings.filter((rating) => rating <= 6).length;
  return Math.round(((promoters - detractors) / ratings.length) * 100);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function percentage<T>(values: T[], predicate: (value: T) => boolean) {
  if (!values.length) return null;
  return Math.round((values.filter(predicate).length / values.length) * 100);
}

function shortLocation(location: string | null) {
  if (!location) return "Location not listed";
  return location.replace(/^\d+\s+/, "").split(/\s+[\u2013\u2014-]\s+/)[0].trim() || location;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
