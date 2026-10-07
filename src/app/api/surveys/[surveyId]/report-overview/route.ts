import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDecisionReportData } from "@/lib/decision-report-analytics";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import { ensureSurveyRosterSnapshot } from "@/lib/results-roster";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!survey) return Response.json({ error: "Survey not found" }, { status: 404 });

  await ensureSurveyRosterSnapshot(surveyId);
  const [roster, responses, completions] = await Promise.all([
    prisma.surveyRosterSnapshot.findMany({
      where: { surveyId, eligible: true },
      select: {
        id: true,
        userId: true,
        email: true,
        departmentId: true,
        departmentName: true,
        managerEmail: true,
        location: true,
      },
      orderBy: { email: "asc" },
    }),
    prisma.surveyResponse.findMany({
      where: { surveyId },
      select: {
        id: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        managerEmail: true,
        location: true,
        answers: { select: { questionId: true, ratingValue: true } },
      },
    }),
    prisma.surveyCompletion.findMany({
      where: { surveyId },
      select: { userId: true },
    }),
  ]);
  const employees = roster.map((employee) => ({
    id: employee.userId || employee.id,
    email: employee.email,
    name: employee.email,
    departmentId: employee.departmentId,
    department: {
      id: employee.departmentId,
      name: employee.departmentName,
    },
    managerEmail: employee.managerEmail,
    location: employee.location,
  }));

  const managerEmails = [
    ...new Set(
      [...employees, ...responses]
        .map((record) => record.managerEmail?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email))
    ),
  ];
  const managerDirectory = managerEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: managerEmails } },
        select: { email: true, name: true },
      })
    : [];

  return Response.json({
    data: {
      generatedAt: new Date().toISOString(),
      anonymityThreshold: ANONYMITY_THRESHOLD,
      ...buildDecisionReportData({
        questions: survey.questions,
        employees,
        responses,
        completions,
        managerDirectory,
      }),
    },
  });
}
