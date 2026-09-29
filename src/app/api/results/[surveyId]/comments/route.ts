import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResultsAccessContext, writeResultsAudit } from "@/lib/results-analytics";

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
    answerIds?: string[];
    status?: "approved" | "withheld" | "pending";
  };
  const answerIds = [...new Set(body.answerIds || [])];
  if (!answerIds.length || !body.status || !["approved", "withheld", "pending"].includes(body.status)) {
    return Response.json({ error: "Select one or more comments and a valid review status." }, { status: 400 });
  }

  const answers = await prisma.answer.findMany({
    where: {
      id: { in: answerIds },
      surveyResponse: { surveyId },
      textValue: { not: null },
    },
    select: { id: true },
  });
  const validIds = answers.map((answer) => answer.id);
  const reviewedAt = body.status === "pending" ? null : new Date();
  const reviewedBy = body.status === "pending" ? null : session.user.email;

  await prisma.$transaction(
    validIds.map((answerId) =>
      prisma.resultCommentReview.upsert({
        where: { answerId },
        create: { surveyId, answerId, status: body.status!, reviewedAt, reviewedBy },
        update: { status: body.status!, reviewedAt, reviewedBy },
      })
    )
  );

  await writeResultsAudit({
    surveyId,
    user: session.user,
    action: `review_comments_${body.status}`,
    metadata: { count: validIds.length },
  });

  return Response.json({ data: { updated: validIds.length } });
}
