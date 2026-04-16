"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { COLORS } from "@/lib/constants";
import { formatDateShort } from "@/lib/utils";

export default function ManagerDashboard() {
  const [participation, setParticipation] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics/participation").then((r) => r.json()),
      fetch("/api/analytics/trends").then((r) => r.json()),
      fetch("/api/actions").then((r) => r.json()),
      fetch("/api/feedback").then((r) => r.json()),
    ]).then(([part, trnds, act, fb]) => {
      setParticipation(part.data || []);
      setTrends(trnds.data || []);
      setActions(act.data || []);
      setFeedback((fb.data || []).slice(0, 5));
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
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

  const openActions = actions.filter((a: any) => a.status === "open").length;
  const inProgressActions = actions.filter((a: any) => a.status === "in_progress").length;
  const completedActions = actions.filter((a: any) => a.status === "completed").length;
  const latestParticipation = participation.length > 0 ? participation[participation.length - 1].rate : 0;
  const latestSentiment = trends.length > 0 ? trends[trends.length - 1] : null;

  const actionPieData = [
    { name: "Open", value: openActions, color: COLORS.neutral },
    { name: "In Progress", value: inProgressActions, color: COLORS.secondary },
    { name: "Completed", value: completedActions, color: COLORS.positive },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Latest Participation</p>
          <p className="text-3xl font-bold text-primary">{latestParticipation}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Sentiment</p>
          <p className="text-3xl font-bold capitalize" style={{ color: latestSentiment?.sentiment === "positive" ? COLORS.positive : latestSentiment?.sentiment === "negative" ? COLORS.negative : COLORS.neutral }}>
            {latestSentiment?.sentiment || "N/A"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Open Actions</p>
          <p className="text-3xl font-bold text-amber-600">{openActions}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">New Feedback</p>
          <p className="text-3xl font-bold text-secondary">{feedback.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Participation Trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Participation Trends</h2>
          {participation.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={participation}>
                  <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(d)} tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip labelFormatter={(d) => formatDateShort(d)} />
                  <Line type="monotone" dataKey="rate" name="Rate %" stroke={COLORS.primary} strokeWidth={2} dot={{ fill: COLORS.primary }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No data yet.</p>
          )}
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Action Items</h2>
            <Link href="/manager/actions" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          {actionPieData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={actionPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                      {actionPieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {actionPieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-sm text-slate-600">{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No action items yet.</p>
          )}
        </div>
      </div>

      {/* Sentiment Trends */}
      {trends.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sentiment Over Time</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <XAxis dataKey="date" tickFormatter={(d) => formatDateShort(d)} tick={{ fontSize: 11 }} />
                <YAxis domain={[-1, 1]} />
                <Tooltip labelFormatter={(d) => formatDateShort(d)} />
                <Line type="monotone" dataKey="score" name="Score" stroke={COLORS.secondary} strokeWidth={2} dot={{ fill: COLORS.secondary }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Feedback */}
      {feedback.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent Feedback</h2>
            <Link href="/feedback" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {feedback.map((fb: any) => (
              <div key={fb.id} className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700">
                {fb.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
