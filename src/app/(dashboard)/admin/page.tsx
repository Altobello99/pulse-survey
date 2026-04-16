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

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [participation, setParticipation] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics/departments").then((r) => r.json()),
      fetch("/api/analytics/trends").then((r) => r.json()),
      fetch("/api/analytics/participation").then((r) => r.json()),
      fetch("/api/feedback").then((r) => r.json()),
      fetch("/api/surveys").then((r) => r.json()),
    ]).then(([depts, trnds, part, fb, surveys]) => {
      setDepartments(depts.data || []);
      setTrends(trnds.data || []);
      setParticipation(part.data || []);
      setFeedback((fb.data || []).slice(0, 5));

      const allSurveys = surveys.data || [];
      const totalEmployees = (depts.data || []).reduce(
        (s: number, d: any) => s + d.employeeCount,
        0
      );
      const activeSurveys = allSurveys.filter((s: any) => s.status === "active").length;
      const avgParticipation =
        (part.data || []).length > 0
          ? Math.round(
              (part.data || []).reduce((s: number, p: any) => s + p.rate, 0) /
                (part.data || []).length
            )
          : 0;
      const latestSentiment = (trnds.data || []).length > 0
        ? trnds.data[trnds.data.length - 1]
        : null;

      setStats({
        totalEmployees,
        activeSurveys,
        avgParticipation,
        sentimentScore: latestSentiment?.score ?? null,
        sentimentLabel: latestSentiment?.sentiment ?? "N/A",
      });

      setLoading(false);
    });
  }, []);

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
          { label: "Total Employees", value: stats?.totalEmployees ?? 0, color: "text-slate-900" },
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
            {feedback.map((fb: any) => (
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
