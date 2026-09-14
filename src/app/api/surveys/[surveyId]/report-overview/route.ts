import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { surveyRosterEmployeeWhere } from "@/lib/access";
import { buildDecisionReportData } from "@/lib/decision-report-analytics";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

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

  const employeeWhere = surveyRosterEmployeeWhere(survey.startDate);
  const [employees, responses, completions] = await Promise.all([
    prisma.user.findMany({
      where: employeeWhere,
      select: {
        id: true,
        email: true,
        name: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        managerEmail: true,
        location: true,
      },
      orderBy: { name: "asc" },
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
      where: { surveyId, user: employeeWhere },
      select: { userId: true },
    }),
  ]);

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
