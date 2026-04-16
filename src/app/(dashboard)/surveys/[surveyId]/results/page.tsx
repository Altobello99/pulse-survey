"use client";

import { useEffect, useState, use } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { COLORS } from "@/lib/constants";
import { useSession } from "next-auth/react";
import PublicLinkPanel from "@/components/surveys/PublicLinkPanel";

interface QuestionResult {
  id: string;
  text: string;
  type: string;
  resultType: string;
  average?: number;
  distribution?: { rating?: number; option?: string; count: number }[];
  responses?: string[];
  total: number;
}

interface SentimentData {
  sentiment: string;
  score: number;
  themes: string;
  insights: string;
  summary: string;
}

interface DeptBreakdown {
  id: string;
  name: string;
  employeeCount: number;
  responses: number;
  completions: number;
  participationRate: number;
  avgRating: number;
}

interface ResultData {
  survey: { id: string; title: string; status: string; allowAnonymous: boolean; publicToken: string | null };
  questionResults: QuestionResult[];
  participationRate: number;
  totalResponses: number;
  totalEmployees: number;
  completions: number;
  sentiment: SentimentData | null;
  departmentBreakdown: DeptBreakdown[];
}

const SENTIMENT_COLORS = {
  positive: COLORS.positive,
  neutral: COLORS.neutral,
  negative: COLORS.negative,
  mixed: "#8b5cf6",
};

export default function SurveyResultsPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = use(params);
  const { data: session } = useSession();
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  function fetchResults() {
    fetch(`/api/surveys/${surveyId}/results`)
      .then((r) => r.json())
      .then((d) => setResult(d.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchResults();
  }, [surveyId]);

  async function runAnalysis() {
    setAnalyzing(true);
    await fetch(`/api/surveys/${surveyId}/analyze`, { method: "POST" });
    fetchResults();
    setAnalyzing(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3 animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-6 animate-pulse">
              <div className="h-8 bg-slate-200 rounded w-1/2 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!result) return <div className="text-slate-500">Results not available.</div>;

  const sentiment = result.sentiment;
  const themes: string[] = sentiment ? JSON.parse(sentiment.themes) : [];
  const insights: string[] = sentiment ? JSON.parse(sentiment.insights) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{result.survey.title}</h1>
          <p className="text-sm text-slate-500">Survey Results &amp; Analytics</p>
        </div>
        {session?.user.role === "admin" && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="px-4 py-2 bg-secondary text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Run AI Analysis"}
            </button>
            <a
              href={`/api/surveys/${surveyId}/export`}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
            >
              Export CSV
            </a>
            <button
              onClick={async () => {
                const r = await fetch(`/api/surveys/${surveyId}/reminders`, { method: "POST" });
                const d = await r.json();
                alert(`Reminders: ${d.data?.totalPending || 0} pending, ${d.data?.sent || 0} sent, ${d.data?.skipped || 0} skipped`);
              }}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
            >
              Send Reminders
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Total Responses</p>
          <p className="text-3xl font-bold text-slate-900">{result.totalResponses}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Participation Rate</p>
          <p className="text-3xl font-bold text-primary">{result.participationRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Overall Sentiment</p>
          <p className="text-3xl font-bold capitalize" style={{ color: SENTIMENT_COLORS[(sentiment?.sentiment || "neutral") as keyof typeof SENTIMENT_COLORS] }}>
            {sentiment?.sentiment || "Pending"}
          </p>
        </div>
      </div>

      {/* Sentiment Analysis */}
      {sentiment && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">AI Sentiment Analysis</h2>
          <p className="text-sm text-slate-600 mb-4">{sentiment.summary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">Key Themes</h3>
              <div className="flex flex-wrap gap-2">
                {themes.map((theme) => (
                  <span key={theme} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">Actionable Insights</h3>
              <ul className="space-y-2">
                {insights.map((insight, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-primary shrink-0">&#9679;</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Admin: Public Link */}
      {session?.user.role === "admin" && (
        <PublicLinkPanel
          surveyId={result.survey.id}
          initialEnabled={result.survey.allowAnonymous}
          initialToken={result.survey.publicToken}
        />
      )}

      {/* Admin: Department Breakdown */}
      {session?.user.role === "admin" && result.departmentBreakdown && result.departmentBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Department Breakdown</h2>
          <p className="text-xs text-slate-500 mb-4">
            Aggregated participation and scores per department. Individual responses remain anonymous &mdash; departments with fewer than 3 responses show only participation, not ratings.
          </p>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-2 font-medium text-slate-600">Department</th>
                <th className="text-left py-2 font-medium text-slate-600">Employees</th>
                <th className="text-left py-2 font-medium text-slate-600">Responses</th>
                <th className="text-left py-2 font-medium text-slate-600">Participation</th>
                <th className="text-left py-2 font-medium text-slate-600">Avg Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.departmentBreakdown.map((dept) => (
                <tr key={dept.id}>
                  <td className="py-3 font-medium text-slate-900">{dept.name}</td>
                  <td className="py-3 text-slate-600">{dept.employeeCount}</td>
                  <td className="py-3 text-slate-600">{dept.responses}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${dept.participationRate}%` }} />
                      </div>
                      <span className="text-slate-600">{dept.participationRate}%</span>
                    </div>
                  </td>
                  <td className="py-3">
                    {dept.responses >= 3 ? (
                      <span className={`font-semibold ${dept.avgRating >= 4 ? "text-emerald-600" : dept.avgRating >= 3 ? "text-amber-600" : "text-red-600"}`}>
                        {dept.avgRating || "N/A"}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Too few responses</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Question Results */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Question Breakdown</h2>
        {result.questionResults.map((q) => (
          <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-medium text-slate-800 mb-4">{q.text}</h3>

            {q.resultType === "rating" && q.distribution && (
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-4xl font-bold text-primary">{q.average}</p>
                  <p className="text-xs text-slate-500">avg of {q.total}</p>
                </div>
                <div className="flex-1 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={q.distribution}>
                      <XAxis dataKey="rating" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {q.resultType === "multiple_choice" && q.distribution && (
              <div className="flex items-center gap-8">
                <div className="flex-1 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={q.distribution}
                        dataKey="count"
                        nameKey="option"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={(entry: any) => `${entry.option}: ${entry.count}`}
                      >
                        {q.distribution.map((_, i) => (
                          <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {q.resultType === "free_text" && q.responses && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {q.responses.map((text, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 flex gap-2">
                    <span className="text-slate-400 shrink-0 text-xs mt-0.5">#{i + 1}</span>
                    <span>&ldquo;{text}&rdquo;</span>
                  </div>
                ))}
                {q.responses.length === 0 && (
                  <p className="text-sm text-slate-400">No text responses yet.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
