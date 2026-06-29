import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Public links are disabled for Clutch. Employees must sign in with Google so
// BambooHR eligibility and one-submission-per-employee checks can be enforced.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.survey.update({
    where: { id: surveyId },
    data: { allowAnonymous: false, publicToken: null },
  });

  return Response.json({
    data: {
      allowAnonymous: updated.allowAnonymous,
      publicToken: updated.publicToken,
      message: "Public links are disabled. Employees must sign in with Google.",
    },
  });
}
