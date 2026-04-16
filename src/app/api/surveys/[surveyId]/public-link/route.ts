import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Enable anonymous public access and generate/rotate the share token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const body = await request.json();
  const { enable, rotate } = body;

  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  let publicToken = survey.publicToken;

  if (enable && (!publicToken || rotate)) {
    publicToken = crypto.randomBytes(24).toString("base64url");
  } else if (!enable) {
    publicToken = null;
  }

  const updated = await prisma.survey.update({
    where: { id: surveyId },
    data: { allowAnonymous: !!enable, publicToken },
  });

  return Response.json({
    data: {
      allowAnonymous: updated.allowAnonymous,
      publicToken: updated.publicToken,
    },
  });
}
