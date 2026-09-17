"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { COLORS } from "@/lib/constants";
import { formatDate, formatDateShort } from "@/lib/utils";

type DailyParticipation = {
  date: string;
  dailyCompletions: number;
  completions: number;
  total: number;
  rate: number;
};

type QuestionAverage = {
  id: string;
  order: number;
  section: string | null;
  question: string;
  responses: number;
  average: number | null;
  scaleMin: number;
  scaleMax: number;
};

type SentimentCounts = {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
  total: number;
};

type DashboardData = {
  survey: {
    id: string;
    title: string;
    status: string;
    startDate: string;
    endDate: string;
  };
  hierarchyEmployees: number;
  eligibleEmployees: number;
  completions: number;
  participationRate: number;
  responseCount: number;
  dailyParticipation: DailyParticipation[];
  suppressed: boolean;
  suppressionMessage: string | null;
  averageRating: number | null;
  recommendationAverage: number | null;
  enps: number | null;
  friendYesPercent: number | null;
  questionAverages: QuestionAverage[];
  writtenComments: number | null;
  analyzedComments: number | null;
  sentiment: SentimentCounts | null;
  themes: Array<{ theme: string; count: number }>;
  actions: { open: number; inProgress: number; completed: number };
  anonymityThreshold: number;
};

type DashboardResponse = {
  data: DashboardData | null;
  error?: string;
};

const sentimentStyles: Record<keyof Omit<SentimentCounts, "total">, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
  negative: "bg-red-500",
  mixed: "bg-amber-500",
};

export default function ManagerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/manager/dashboard", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as DashboardResponse;
        if (!response.ok) throw new Error(payload.error || "Unable to load dashboard");
        setData(payload.data);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("Your dashboard could not load. Please refresh and try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  if (loading) return <DashboardLoading />;

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
          No survey results are available yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.survey.title} &middot; {formatDate(data.survey.startDate)} - {formatDate(data.survey.endDate)}
          </p>
        </div>
        <Link
          href={`/surveys/${data.survey.id}/results`}
          className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          View detailed results
        </Link>
      </header>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Results include your full BambooHR reporting tree. Ratings and comment patterns appear only when at least {data.anonymityThreshold} people respond; individual answers and comments are never shown here.
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Survey summary">
        <SummaryMetric
          label="Participation"
          value={`${data.participationRate}%`}
          detail={`${data.completions}/${data.eligibleEmployees} eligible employees completed`}
          color="text-primary"
        />
        <SummaryMetric
          label="Average Rating"
          value={formatAverage(data.averageRating, 5)}
          detail={data.suppressed ? "Protected until 3 responses" : "Standard 1-5 questions"}
          color="text-emerald-600"
        />
        <SummaryMetric
          label="eNPS"
          value={formatSigned(data.enps)}
          detail={
            data.recommendationAverage === null
              ? data.suppressed ? "Protected until 3 responses" : "No recommendation ratings yet"
              : `${data.recommendationAverage.toFixed(1)} / 10 average recommendation`
          }
          color="text-blue-600"
        />
        <SummaryMetric
          label="Best Friend at Work"
          value={data.friendYesPercent === null ? "N/A" : `${data.friendYesPercent}%`}
          detail={data.suppressed ? "Protected until 3 responses" : "Answered Yes"}
          color="text-amber-600"
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Participation Trend</h2>
            <p className="mt-1 text-sm text-slate-500">Cumulative completion through each survey day.</p>
          </div>
          <p className="text-sm font-medium text-slate-700">
            {data.completions}/{data.eligibleEmployees} completed
          </p>
        </div>
        {data.dailyParticipation.length > 0 ? (
          <div className="mt-5 h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyParticipation} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatDateShort(value)}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  labelFormatter={(value) => formatDate(value)}
                  formatter={(value, name, item) => {
                    if (name === "Participation") {
                      const point = item.payload as DailyParticipation;
                      return [`${value}% (${point.completions}/${point.total})`, "Participation"];
                    }
                    return [value, name];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="Participation"
                  stroke={COLORS.primary}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: COLORS.primary }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">No participation data is available yet.</p>
        )}
      </section>

      {data.suppressed ? (
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Team results are protected</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            {data.suppressionMessage} Participation remains visible so you can track completion without exposing anyone&apos;s answers.
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Anonymous Comment Patterns</h2>
                  <p className="mt-1 text-sm text-slate-500">Grouped AI analysis only. No individual comments are displayed.</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-700">
                  {data.writtenComments ?? 0} written answers
                </span>
              </div>
              {data.sentiment ? (
                <SentimentSummary sentiment={data.sentiment} />
              ) : (
                <p className="mt-6 text-sm text-slate-500">
                  Comment patterns will appear after at least {data.anonymityThreshold} comments have been analyzed.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">Common Themes</h2>
              <p className="mt-1 text-sm text-slate-500">A theme appears only when it occurs in at least {data.anonymityThreshold} analyzed comments.</p>
              {data.themes.length > 0 ? (
                <div className="mt-5 divide-y divide-slate-100">
                  {data.themes.map((theme) => (
                    <div key={theme.theme} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <span className="text-sm font-medium text-slate-800">{theme.theme}</span>
                      <span className="text-sm text-slate-500">{theme.count} mentions</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-sm text-slate-500">No recurring themes meet the privacy threshold yet.</p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Average Rating by Question</h2>
              <p className="mt-1 text-sm text-slate-500">Actual averages for your full reporting tree. Each question uses the scale shown.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="w-16 px-5 py-3 font-medium">#</th>
                    <th className="px-5 py-3 font-medium">Question</th>
                    <th className="px-5 py-3 font-medium">Responses</th>
                    <th className="px-5 py-3 font-medium">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.questionAverages.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-3 font-medium text-slate-500">{row.order + 1}</td>
                      <td className="px-5 py-3 text-slate-900">
                        <span className="font-medium">{row.question}</span>
                        {row.section && <span className="mt-0.5 block text-xs text-slate-500">{row.section}</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{row.responses}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {row.average === null ? "Too few responses" : `${row.average.toFixed(1)} / ${row.scaleMax}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Action Items</h2>
            <p className="mt-1 text-sm text-slate-500">
              {data.actions.open} open &middot; {data.actions.inProgress} in progress &middot; {data.actions.completed} completed
            </p>
          </div>
          <Link href="/manager/actions" className="w-fit text-sm font-medium text-primary hover:underline">
            View action items
          </Link>
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function SentimentSummary({ sentiment }: { sentiment: SentimentCounts }) {
  const categories: Array<keyof Omit<SentimentCounts, "total">> = [
    "positive",
    "neutral",
    "negative",
    "mixed",
  ];

  return (
    <div className="mt-5">
      <div className="flex h-3 overflow-hidden rounded-sm bg-slate-100" aria-label="Comment sentiment distribution">
        {categories.map((category) => {
          const width = sentiment.total ? (sentiment[category] / sentiment.total) * 100 : 0;
          return width > 0 ? (
            <div
              key={category}
              className={sentimentStyles[category]}
              style={{ width: `${width}%` }}
              title={`${titleCase(category)}: ${sentiment[category]}`}
            />
          ) : null;
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
        {categories.map((category) => {
          const percent = sentiment.total ? Math.round((sentiment[category] / sentiment.total) * 100) : 0;
          return (
            <div key={category}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${sentimentStyles[category]}`} />
                <span className="text-xs font-medium text-slate-600">{titleCase(category)}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-900">{percent}%</p>
              <p className="text-xs text-slate-500">{sentiment[category]} analyzed</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div>
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-4 w-2/3 rounded bg-slate-100" />
            <div className="mt-4 h-8 w-1/2 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white" />
    </div>
  );
}

function formatAverage(value: number | null, scaleMax: number) {
  return value === null ? "N/A" : `${value.toFixed(1)} / ${scaleMax}`;
}

function formatSigned(value: number | null) {
  if (value === null) return "N/A";
  return value > 0 ? `+${value}` : String(value);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
