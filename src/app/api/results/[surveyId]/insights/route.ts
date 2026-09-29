import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResultsAccessContext, writeResultsAudit } from "@/lib/results-analytics";

type InsightInput = {
  insightKey: string;
  kind: string;
  title: string;
  body: string;
  severity: string;
  evidence?: unknown;
  sortOrder?: number;
};

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
    scopeKey?: string;
    scopeLabel?: string;
    insights?: InsightInput[];
  };
  if (!body.scopeKey || !body.scopeLabel || !body.insights?.length) {
    return Response.json({ error: "No generated insights were provided." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.resultInsight.deleteMany({ where: { surveyId, scopeKey: body.scopeKey } });
    await tx.resultInsight.createMany({
      data: body.insights!.slice(0, 12).map((insight, index) => ({
        surveyId,
        scopeKey: body.scopeKey!,
        scopeLabel: body.scopeLabel!.slice(0, 200),
        insightKey: insight.insightKey.slice(0, 100),
        kind: insight.kind.slice(0, 40),
        title: insight.title.slice(0, 300),
        body: insight.body.slice(0, 2000),
        severity: insight.severity.slice(0, 40),
        evidence: JSON.stringify(insight.evidence || {}),
        status: "pending",
        sortOrder: insight.sortOrder ?? index * 10,
      })),
    });
  });

  await writeResultsAudit({
    surveyId,
    user: session.user,
    action: "regenerate_insights",
    scopeKey: body.scopeKey,
  });

  return Response.json({ data: { saved: body.insights.length } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getResultsAccessContext(session.user);
  if (!access.canManage) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { surveyId } = await params;
  const body = (await request.json()) as {
    id?: string;
    title?: string;
    body?: string;
    status?: "pending" | "approved" | "hidden";
  };
  if (!body.id) return Response.json({ error: "Insight is required." }, { status: 400 });

  const existing = await prisma.resultInsight.findFirst({
    where: { id: body.id, surveyId },
  });
  if (!existing) return Response.json({ error: "Insight not found." }, { status: 404 });

  const insight = await prisma.resultInsight.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: body.title.slice(0, 300) } : {}),
      ...(body.body !== undefined ? { body: body.body.slice(0, 2000) } : {}),
      ...(body.status ? { status: body.status } : {}),
      reviewedAt: new Date(),
      reviewedBy: session.user.email,
    },
  });

  await writeResultsAudit({
    surveyId,
    user: session.user,
    action: `review_insight_${insight.status}`,
    scopeKey: insight.scopeKey,
  });

  return Response.json({ data: insight });
}
