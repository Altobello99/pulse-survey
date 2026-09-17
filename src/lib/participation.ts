const REPORTING_TIME_ZONE = process.env.REPORTING_TIME_ZONE || "America/Toronto";
const reportingDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type DailyParticipation = {
  date: string;
  dailyCompletions: number;
  completions: number;
  total: number;
  rate: number;
};

export function buildDailyParticipation(
  completionDates: Date[],
  surveyStart: Date,
  surveyEnd: Date,
  totalEmployees: number,
  referenceDate = new Date()
): DailyParticipation[] {
  const effectiveEnd = surveyEnd < referenceDate ? surveyEnd : referenceDate;
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
  const daily: DailyParticipation[] = [];

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

function reportingDateKey(date: Date) {
  const parts = reportingDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
