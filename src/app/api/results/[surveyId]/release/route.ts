import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getResultsAccessContext,
  writeResultsAudit,
} from "@/lib/results-analytics";
import { normalizeEmail } from "@/lib/access";

type ReleaseKind = "results" | "insights" | "comments" | "all";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getResultsAccessContext(session.user);
  if (!access.canManage) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { surveyId } = await params;
  const body = (await request.json()) as {
    kind?: ReleaseKind;
    released?: boolean;
    leaderEmail?: string;
  };
  if (!body.kind || !["results", "insights", "comments", "all"].includes(body.kind)) {
    return Response.json({ error: "Invalid release type" }, { status: 400 });
  }
  const leaderEmail = normalizeEmail(body.leaderEmail);
  if (body.kind === "all" && !leaderEmail) {
    return Response.json({ error: "Select a manager for the test release." }, { status: 400 });
  }
  if (leaderEmail && body.kind !== "all") {
    return Response.json({ error: "Manager-specific access must release all result layers." }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { status: true, endDate: true },
  });
  if (!survey) return Response.json({ error: "Survey not found" }, { status: 404 });
  if (body.released !== false && survey.status !== "closed" && survey.endDate > new Date()) {
    return Response.json({ error: "Results can only be released after the survey closes." }, { status: 400 });
  }
  if (body.kind === "insights" && body.released !== false) {
    const approvedInsights = await prisma.resultInsight.count({
      where: { surveyId, status: "approved" },
    });
    if (approvedInsights === 0) {
      return Response.json(
        { error: "Approve at least one AI-assisted insight before releasing insights." },
        { status: 400 }
      );
    }
  }

  const timestamp = body.released === false ? null : new Date();
  const actor = body.released === false ? null : session.user.email;
  if (leaderEmail) {
    const reportingGroupExists = await prisma.surveyRosterSnapshot.count({
      where: {
        surveyId,
        managerEmail: { equals: leaderEmail, mode: "insensitive" },
      },
    });
    if (reportingGroupExists === 0) {
      return Response.json(
        { error: "The selected manager does not have a reporting group in this survey." },
        { status: 400 }
      );
    }

    const grant = await prisma.surveyResultsGrant.upsert({
      where: { surveyId_leaderEmail: { surveyId, leaderEmail } },
      create: {
        surveyId,
        leaderEmail,
        resultsReleasedAt: timestamp,
        resultsReleasedBy: actor,
        insightsReleasedAt: timestamp,
        insightsReleasedBy: actor,
        commentsReleasedAt: timestamp,
        commentsReleasedBy: actor,
      },
      update: {
        resultsReleasedAt: timestamp,
        resultsReleasedBy: actor,
        insightsReleasedAt: timestamp,
        insightsReleasedBy: actor,
        commentsReleasedAt: timestamp,
        commentsReleasedBy: actor,
      },
    });

    await writeResultsAudit({
      surveyId,
      user: session.user,
      action: body.released === false ? "revoke_manager_test_access" : "release_manager_test_access",
      metadata: { leaderEmail },
    });

    return Response.json({
      data: {
        resultsReleasedAt: grant.resultsReleasedAt?.toISOString() || null,
        insightsReleasedAt: grant.insightsReleasedAt?.toISOString() || null,
        commentsReleasedAt: grant.commentsReleasedAt?.toISOString() || null,
      },
    });
  }

  const release = await prisma.surveyResultsRelease.upsert({
    where: { surveyId },
    create: {
      surveyId,
      ...(body.kind === "results"
        ? { resultsReleasedAt: timestamp, resultsReleasedBy: actor }
        : body.kind === "insights"
          ? { insightsReleasedAt: timestamp, insightsReleasedBy: actor }
          : { commentsReleasedAt: timestamp, commentsReleasedBy: actor }),
    },
    update:
      body.kind === "results"
        ? { resultsReleasedAt: timestamp, resultsReleasedBy: actor }
        : body.kind === "insights"
          ? { insightsReleasedAt: timestamp, insightsReleasedBy: actor }
          : { commentsReleasedAt: timestamp, commentsReleasedBy: actor },
  });

  await writeResultsAudit({
    surveyId,
    user: session.user,
    action: `${body.released === false ? "revoke" : "release"}_${body.kind}`,
  });

  return Response.json({
    data: {
      resultsReleasedAt: release.resultsReleasedAt?.toISOString() || null,
      insightsReleasedAt: release.insightsReleasedAt?.toISOString() || null,
      commentsReleasedAt: release.commentsReleasedAt?.toISOString() || null,
    },
  });
}
