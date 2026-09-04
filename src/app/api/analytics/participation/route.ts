import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScopedEmployeeWhere, getScopedResponseWhere } from "@/lib/access";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveys = await prisma.survey.findMany({
    where: { status: { in: ["active", "closed"] } },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  });

  const employeeWhere = await getScopedEmployeeWhere(session.user);
  const totalEmployees = await prisma.user.count({ where: employeeWhere });

  const data = await Promise.all(
    surveys.map(async (s) => {
      const [responseCount, completionRows] = await Promise.all([
        prisma.surveyResponse.count({
          where: await getScopedResponseWhere(session.user, s.id),
        }),
        prisma.surveyCompletion.findMany({
          where: { surveyId: s.id, user: employeeWhere },
          select: { completedAt: true },
          orderBy: { completedAt: "asc" },
        }),
      ]);
      const completions = completionRows.length;
      const hidden = session.user.role !== "admin" && responseCount < ANONYMITY_THRESHOLD;

      return {
        id: s.id,
        title: s.title,
        date: s.startDate,
        status: s.status,
        completions,
        total: totalEmployees,
        rate: totalEmployees ? Math.round((completions / totalEmployees) * 100) : 0,
        hidden,
        daily: hidden
          ? []
          : buildDailyParticipation(
              completionRows.map((completion) => completion.completedAt),
              s.startDate,
              s.endDate,
              totalEmployees
            ),
      };
    })
  );

  return Response.json({ data });
}

const REPORTING_TIME_ZONE = process.env.REPORTING_TIME_ZONE || "America/Toronto";
const reportingDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function reportingDateKey(date: Date) {
  const parts = reportingDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function buildDailyParticipation(
  completionDates: Date[],
  surveyStart: Date,
  surveyEnd: Date,
  totalEmployees: number
) {
  const now = new Date();
  const effectiveEnd = surveyEnd < now ? surveyEnd : now;
  const startKey = reportingDateKey(surveyStart);
  const endKey = reportingDateKey(effectiveEnd < surveyStart ? surveyStart : effectiveEnd);
  const completionsByDate = new Map<string, number>();

  for (const completedAt of completionDates) {
    const key = reportingDateKey(completedAt);
    completionsByDate.set(key, (completionsByDate.get(key) || 0) + 1);
  }

  const start = new Date(`${startKey}T12:00:00.000Z`);
  const end = new Date(`${endKey}T12:00:00.000Z`);
  let cumulativeCompletions = completionDates.filter(
    (completedAt) => reportingDateKey(completedAt) < startKey
  ).length;
  const daily = [];

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    const dailyCompletions = completionsByDate.get(key) || 0;
    cumulativeCompletions += dailyCompletions;
    daily.push({
      date: `${key}T12:00:00.000Z`,
      dailyCompletions,
      completions: cumulativeCompletions,
      total: totalEmployees,
      rate: totalEmployees
        ? Math.round((cumulativeCompletions / totalEmployees) * 100)
        : 0,
    });
  }

  return daily;
}
