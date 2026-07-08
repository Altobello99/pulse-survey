import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, surveyReminderHtml } from "@/lib/email";
import { departmentedBambooEmployeeWhere } from "@/lib/access";

// Send reminder emails to employees who haven't completed the survey
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  // Find all employees who haven't completed this survey
  const completedUserIds = await prisma.surveyCompletion.findMany({
    where: { surveyId },
    select: { userId: true },
  });
  const completedSet = new Set(completedUserIds.map((c) => c.userId));

  const pendingUsers = await prisma.user.findMany({
    where: { AND: [departmentedBambooEmployeeWhere, { role: { not: "admin" } }] },
    select: { id: true, email: true },
  });

  const toRemind = pendingUsers.filter((u) => !completedSet.has(u.id));
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const surveyUrl = `${baseUrl}/surveys/${surveyId}`;

  let sent = 0;
  let skipped = 0;
  for (const user of toRemind) {
    const result = await sendEmail(
      user.email,
      `Reminder: ${survey.title}`,
      surveyReminderHtml(survey.title, surveyUrl),
      "survey_reminder"
    );
    if (result.sent) sent++;
    else skipped++;
  }

  return Response.json({
    data: {
      totalPending: toRemind.length,
      sent,
      skipped,
    },
  });
}
