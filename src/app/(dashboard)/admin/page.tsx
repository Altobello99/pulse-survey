"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { COLORS } from "@/lib/constants";
import { formatDateShort, sentimentColor } from "@/lib/utils";

type SurveySummary = {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
};

type DepartmentAnalytics = {
  id: string;
  name: string;
  employeeCount: number;
  participationRate: number;
  avgRating: number;
};

type TrendPoint = {
  date: string;
  score: number;
  sentiment: string;
};

type ParticipationPoint = {
  date: string;
  rate: number;
};

type FeedbackItem = {
  id: string;
  message: string;
  sentiment: string | null;
};

type DashboardStats = {
  totalEmployees: number;
  activeSurveys: number;
  avgParticipation: number;
  sentimentScore: number | null;
  sentimentLabel: string;
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type QuestionRatingsData = {
  survey: { id: string; title: string };
  questions: Array<{
    id: string;
    text: string;
    order: number;
    scaleMin: number;
    scaleMax: number;
  }>;
  departments: Array<{
    id: string;
    name: string;
    responseCount: number | null;
    status: "no_responses" | "suppressed" | "available";
    ratings: Array<{ questionId: string; average: number | null }>;
  }>;
  threshold: number;
};

function ratingTone(average: number, minimum: number, maximum: number) {
  const range = maximum - minimum;
  const normalized = range > 0 ? (average - minimum) / range : 0;

  if (normalized >= 0.75) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized >= 0.5) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

async function fetchData<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url);
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok) throw new Error(payload.error || "Unable to load dashboard data");
  return payload;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [departments, setDepartments] = useState<DepartmentAnalytics[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [participation, setParticipation] = useState<ParticipationPoint[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [surveys, setSurveys] = useState<SurveySummary[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState("");
  const [questionRatings, setQuestionRatings] = useState<QuestionRatingsData | null>(null);
  const [questionRatingsError, setQuestionRatingsError] = useState<{
    surveyId: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchData<DepartmentAnalytics[]>("/api/analytics/departments"),
      fetchData<TrendPoint[]>("/api/analytics/trends"),
      fetchData<ParticipationPoint[]>("/api/analytics/participation"),
      fetchData<FeedbackItem[]>("/api/feedback"),
      fetchData<SurveySummary[]>("/api/surveys"),
    ]).then(([depts, trnds, part, fb, surveys]) => {
      const departmentData = depts.data || [];
      const trendData = trnds.data || [];
      const participationData = part.data || [];
      const feedbackData = fb.data || [];

      setDepartments(departmentData);
      setTrends(trendData);
      setParticipation(participationData);
      setFeedback(feedbackData.slice(0, 5));

      const allSurveys: SurveySummary[] = surveys.data || [];
      setSurveys(allSurveys);
      const now = new Date();
      const defaultSurvey = allSurveys.find(
        (survey) =>
          survey.status === "active" &&
          new Date(survey.startDate) <= now &&
          new Date(survey.endDate) >= now
      ) || allSurveys.find((survey) => survey.status === "active") || allSurveys[0];
      setSelectedSurveyId(defaultSurvey?.id || "");
      const totalEmployees = departmentData.reduce(
        (sum, department) => sum + department.employeeCount,
        0
      );
      const activeSurveys = allSurveys.filter((survey) => survey.status === "active").length;
      const avgParticipation =
        participationData.length > 0
          ? Math.round(
              participationData.reduce((sum, point) => sum + point.rate, 0) /
                participationData.length
            )
          : 0;
      const latestSentiment = trendData.length > 0
        ? trendData[trendData.length - 1]
        : null;

      setStats({
        totalEmployees,
        activeSurveys,
        avgParticipation,
        sentimentScore: latestSentiment?.score ?? null,
        sentimentLabel: latestSentiment?.sentiment ?? "N/A",
      });

      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSurveyId) return;

    let cancelled = false;

    fetch(`/api/analytics/question-ratings?surveyId=${encodeURIComponent(selectedSurveyId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load question ratings");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          setQuestionRatings(payload.data || null);
          setQuestionRatingsError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setQuestionRatings(null);
          setQuestionRatingsError({ surveyId: selectedSurveyId, message: error.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSurveyId]);

  const selectedSurveyError = questionRatingsError?.surveyId === selectedSurveyId
    ? questionRatingsError.message
    : "";
  const questionRatingsLoading = Boolean(
    selectedSurveyId &&
    questionRatings?.survey.id !== selectedSurveyId &&
    !selectedSurveyError
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-3" />
              <div className="h-8 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <Link
          href="/admin/surveys/new"
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
        >
          + New Survey
        </Link>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-blue-800">
          <strong className="text-blue-900">What you can see as admin:</strong> aggregated results, department comparisons, sentiment analysis, and anonymized free-text responses.
          <strong className="text-blue-900 block mt-1">What you cannot see:</strong> individual employee answers, who submitted what, or any data linking a user to a response.
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Eligible Employees", value: stats?.totalEmployees ?? 0, color: "text-slate-900" },
          { label: "Active Surveys", value: stats?.activeSurveys ?? 0, color: "text-primary" },
          { label: "Avg Participation", value: `${stats?.avgParticipation ?? 0}%`, color: "text-secondary" },
          {
            label: "Latest Sentiment",
            value: stats?.sentimentLabel ?? "N/A",
            color: stats?.sentimentLabel === "positive"
              ? "text-emerald-600"
              : stats?.sentimentLabel === "negative"
              ? "text-red-600"
              : "text-amber-600",
          },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold capitalize ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Question Ratings by Department</h2>
            <p className="mt-1 text-sm text-slate-500">
              Department ratings appear after at least {questionRatings?.threshold ?? 3} employees respond.
            </p>
          </div>
          <label className="block min-w-0 sm:w-72">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Survey</span>
            <select
              value={selectedSurveyId}
              onChange={(event) => setSelectedSurveyId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.title} ({survey.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        {questionRatingsLoading ? (
          <div className="border-t border-slate-200 p-6" aria-live="polite">
            <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : selectedSurveyError ? (
          <p className="border-t border-slate-200 p-6 text-sm text-red-600">{selectedSurveyError}</p>
        ) : !selectedSurveyId ? (
          <p className="border-t border-slate-200 p-6 text-sm text-slate-500">No surveys are available.</p>
        ) : questionRatings && questionRatings.questions.length > 0 ? (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 z-10 min-w-80 max-w-md border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700">
                    Rating question
                  </th>
                  {questionRatings.departments.map((department) => (
                    <th
                      key={department.id}
                      className="min-w-40 border-b border-r border-slate-200 px-4 py-3 text-center font-semibold text-slate-700 last:border-r-0"
                    >
                      <span className="block">{department.name}</span>
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {department.status === "available"
                          ? `${department.responseCount} responses`
                          : department.status === "suppressed"
                            ? "Protected"
                            : "No responses"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questionRatings.questions.map((question) => (
                  <tr key={question.id} className="even:bg-slate-50/50">
                    <th className="sticky left-0 z-10 max-w-md border-b border-r border-slate-200 bg-white px-4 py-4 text-left align-top font-medium text-slate-800">
                      <span className="mb-1 block text-xs font-semibold text-primary">Question {question.order + 1}</span>
                      {question.text}
                    </th>
                    {questionRatings.departments.map((department) => {
                      const rating = department.ratings.find((item) => item.questionId === question.id);
                      return (
                        <td
                          key={department.id}
                          className="border-b border-r border-slate-200 px-4 py-4 text-center last:border-r-0"
                        >
                          {rating?.average !== null && rating?.average !== undefined ? (
                            <span
                              className={`inline-flex min-w-20 justify-center rounded-md border px-2.5 py-1.5 font-semibold ${ratingTone(
                                rating.average,
                                question.scaleMin,
                                question.scaleMax
                              )}`}
                            >
                              {rating.average.toFixed(1)} / {question.scaleMax}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">
                              {department.status === "suppressed" ? "Protected" : "N/A"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
            This survey has no rating questions.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Comparison */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Department Comparison</h2>
          {departments.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departments}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="participationRate" name="Participation %" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgRating" name="Avg Rating" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No department data yet.</p>
          )}
        </div>

        {/* Participation Trends */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Participation Trends</h2>
          {participation.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={participation}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => formatDateShort(d)}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip
                    labelFormatter={(d) => formatDateShort(d)}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="Participation %"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: COLORS.primary }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No participation data yet.</p>
          )}
        </div>
      </div>

      {/* Sentiment Trend */}
      {trends.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sentiment Over Time</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => formatDateShort(d)}
                  tick={{ fontSize: 12 }}
                />
                <YAxis domain={[-1, 1]} />
                <Tooltip labelFormatter={(d) => formatDateShort(d)} />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Sentiment Score"
                  stroke={COLORS.secondary}
                  strokeWidth={2}
                  dot={{ fill: COLORS.secondary }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Feedback */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Feedback</h2>
          <Link href="/feedback" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {feedback.length > 0 ? (
          <div className="space-y-3">
            {feedback.map((fb) => (
              <div key={fb.id} className="p-3 bg-slate-50 rounded-lg flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${sentimentColor(fb.sentiment || "neutral")}`}>
                  {fb.sentiment || "pending"}
                </span>
                <p className="text-sm text-slate-700 line-clamp-2">{fb.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No feedback yet.</p>
        )}
      </div>
    </div>
  );
}
