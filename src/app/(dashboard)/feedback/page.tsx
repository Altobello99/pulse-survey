"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { FEEDBACK_CATEGORIES } from "@/lib/constants";
import {
  COMMENT_SEVERITY_RANK,
  type CommentSeverity,
  type SerializedCommentAnalysis,
} from "@/lib/comment-analysis-types";

interface FeedbackItem {
  id: string;
  message: string;
  category: string | null;
  status: string;
  createdAt: string;
  department: { name: string } | null;
  source: "survey" | "feedback";
  survey: { id: string; title: string } | null;
  question: { text: string; section: string | null } | null;
  analysis: SerializedCommentAnalysis | null;
}

type ViewMode = "priority" | "all" | "themes";
type SortMode = "severity" | "severity_low" | "newest" | "oldest";
const COMMENT_FILTER_REFERENCE_TIME = Date.now();

export default function FeedbackPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "admin";
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("suggestion");
  const [includeDepartment, setIncludeDepartment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("priority");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("");
  const [themeFilter, setThemeFilter] = useState("");
  const [surveyFilter, setSurveyFilter] = useState("");
  const [questionFilter, setQuestionFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("severity");
  const [visibleLimit, setVisibleLimit] = useState(50);

  function fetchFeedback() {
    fetch("/api/feedback?limit=5000")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load comments");
        return response.json();
      })
      .then((data) => setFeedbackList(data.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchFeedback();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (message.trim().length < 10) return;
    setSubmitting(true);

    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, category, includeDepartment }),
    });

    if (response.ok) {
      setSubmitted(true);
      setMessage("");
      setShowForm(false);
      fetchFeedback();
      setTimeout(() => {
        setSubmitted(false);
        fetchFeedback();
      }, 4_000);
    }
    setSubmitting(false);
  }

  const summary = useMemo(() => ({
    total: feedbackList.length,
    critical: feedbackList.filter((item) => item.analysis?.severity === "critical").length,
    high: feedbackList.filter((item) => item.analysis?.severity === "high").length,
    negative: feedbackList.filter((item) => item.analysis?.sentiment === "negative").length,
    positive: feedbackList.filter((item) => item.analysis?.sentiment === "positive").length,
    needsReview: feedbackList.filter((item) =>
      !item.analysis || item.analysis.severity === "needs_review"
    ).length,
  }), [feedbackList]);

  const filterOptions = useMemo(() => ({
    surveys: unique(feedbackList
      .map((item) => item.survey?.title)
      .filter((value): value is string => Boolean(value))),
    questions: unique(feedbackList
      .map((item) => item.question?.text)
      .filter((value): value is string => Boolean(value))),
    themes: unique(feedbackList.flatMap((item) => item.analysis?.themes || [])),
  }), [feedbackList]);

  const filteredComments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const cutoff = dateFilter === "all"
      ? null
      : COMMENT_FILTER_REFERENCE_TIME - Number(dateFilter) * 24 * 60 * 60 * 1_000;

    return feedbackList.filter((item) => {
      const severity = item.analysis?.severity || "pending";
      if (severityFilter && severity !== severityFilter) return false;
      if (sentimentFilter && item.analysis?.sentiment !== sentimentFilter) return false;
      if (themeFilter && !item.analysis?.themes.includes(themeFilter)) return false;
      if (surveyFilter && item.survey?.title !== surveyFilter) return false;
      if (questionFilter && item.question?.text !== questionFilter) return false;
      if (cutoff && new Date(item.createdAt).getTime() < cutoff) return false;
      if (!normalizedSearch) return true;

      return [
        item.message,
        item.survey?.title,
        item.question?.text,
        item.question?.section,
        item.analysis?.reason,
        ...(item.analysis?.themes || []),
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [
    dateFilter,
    feedbackList,
    questionFilter,
    search,
    sentimentFilter,
    severityFilter,
    surveyFilter,
    themeFilter,
  ]);

  const visibleComments = useMemo(() => {
    const comments = viewMode === "priority"
      ? filteredComments.filter((item) =>
          !item.analysis || ["critical", "high", "needs_review"].includes(item.analysis.severity)
        )
      : filteredComments;

    return [...comments].sort((a, b) => compareComments(a, b, sortMode));
  }, [filteredComments, sortMode, viewMode]);
  const displayedComments = visibleComments.slice(0, visibleLimit);

  const themeSummary = useMemo(() => {
    const themes = new Map<string, {
      total: number;
      criticalHigh: number;
      negative: number;
    }>();
    for (const item of filteredComments) {
      for (const theme of item.analysis?.themes || []) {
        const current = themes.get(theme) || { total: 0, criticalHigh: 0, negative: 0 };
        current.total += 1;
        if (["critical", "high"].includes(item.analysis?.severity || "")) {
          current.criticalHigh += 1;
        }
        if (item.analysis?.sentiment === "negative") current.negative += 1;
        themes.set(theme, current);
      }
    }
    return [...themes.entries()]
      .map(([theme, counts]) => ({ theme, ...counts }))
      .sort((a, b) => b.total - a.total || a.theme.localeCompare(b.theme));
  }, [filteredComments]);

  const hasFilters = Boolean(
    search || severityFilter || sentimentFilter || themeFilter || surveyFilter ||
    questionFilter || dateFilter !== "all"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAdmin ? "AI Comment Triage" : "Anonymous Feedback"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? "Admin-only sentiment, severity, and themes for anonymous written feedback"
              : "Share your thoughts anonymously"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isAdmin && (
            <Link
              href="/admin/reports"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Download Reports
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
          >
            {showForm ? "Cancel" : "+ New Feedback"}
          </button>
        </div>
      </div>

      {submitted && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Feedback submitted anonymously. AI triage will appear shortly.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-sm text-emerald-800">
              <strong className="text-emerald-900">Fully anonymous.</strong> Identity is never stored with this feedback. AI labels are visible only to admins.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 capitalize outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 sm:w-auto"
            >
              {FEEDBACK_CATEGORIES.map((option) => (
                <option key={option} value={option} className="capitalize">{option}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Your Feedback</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="Share your thoughts, suggestions, concerns, or praise... (min 10 characters)"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeDepartment}
              onChange={(event) => setIncludeDepartment(event.target.checked)}
              className="accent-primary"
            />
            Include my department for context (still anonymous)
          </label>
          <button
            type="submit"
            disabled={submitting || message.trim().length < 10}
            className="rounded-lg bg-primary px-6 py-2.5 text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Anonymously"}
          </button>
        </form>
      )}

      {isAdmin && summary.critical > 0 && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <div>
            <p className="font-semibold">
              {summary.critical} Critical {summary.critical === 1 ? "comment requires" : "comments require"} prompt human review
            </p>
            <p className="mt-1 text-sm text-red-800">
              AI severity is a triage signal, not a final HR, safety, or legal finding.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setViewMode("all");
              setSeverityFilter("critical");
            }}
            className="shrink-0 text-sm font-semibold underline"
          >
            Review now
          </button>
        </div>
      )}

      {isAdmin && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Total Comments" value={summary.total} tone="text-slate-900" />
            <Metric label="Critical" value={summary.critical} tone="text-red-600" />
            <Metric label="High Severity" value={summary.high} tone="text-orange-600" />
            <Metric label="Negative" value={summary.negative} tone="text-rose-600" />
            <Metric label="Positive" value={summary.positive} tone="text-emerald-600" />
            <Metric label="Needs Review" value={summary.needsReview} tone="text-violet-600" />
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap gap-1 border-b border-slate-200 p-3" aria-label="Comment views">
              {([
                ["priority", "Priority Queue"],
                ["all", "All Comments"],
                ["themes", "Themes"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setViewMode(value)}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    viewMode === value
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Search comments</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search comment, question, theme..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <FilterSelect label="Severity" value={severityFilter} onChange={setSeverityFilter}>
                <option value="">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="needs_review">Needs Review</option>
                <option value="pending">Pending AI</option>
              </FilterSelect>
              <FilterSelect label="Sentiment" value={sentimentFilter} onChange={setSentimentFilter}>
                <option value="">All sentiments</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
                <option value="mixed">Mixed</option>
              </FilterSelect>
              <FilterSelect label="Theme" value={themeFilter} onChange={setThemeFilter}>
                <option value="">All themes</option>
                {filterOptions.themes.map((theme) => <option key={theme}>{theme}</option>)}
              </FilterSelect>
              <FilterSelect label="Survey" value={surveyFilter} onChange={setSurveyFilter}>
                <option value="">All surveys</option>
                {filterOptions.surveys.map((survey) => <option key={survey}>{survey}</option>)}
              </FilterSelect>
              <FilterSelect label="Question" value={questionFilter} onChange={setQuestionFilter}>
                <option value="">All questions</option>
                {filterOptions.questions.map((question) => <option key={question}>{question}</option>)}
              </FilterSelect>
              <FilterSelect label="Date" value={dateFilter} onChange={setDateFilter}>
                <option value="all">All dates</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </FilterSelect>
              <FilterSelect label="Sort" value={sortMode} onChange={(value) => setSortMode(value as SortMode)}>
                <option value="severity">Severity: high to low</option>
                <option value="severity_low">Severity: low to high</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </FilterSelect>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              <span>
                {viewMode === "themes"
                  ? `${themeSummary.length} themes across ${filteredComments.length} filtered comments`
                  : `${visibleComments.length} of ${feedbackList.length} comments shown`}
              </span>
              {hasFilters && (
                <button type="button" onClick={() => clearFilters({
                  setSearch,
                  setSeverityFilter,
                  setSentimentFilter,
                  setThemeFilter,
                  setSurveyFilter,
                  setQuestionFilter,
                  setDateFilter,
                })} className="font-medium text-primary hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {loading ? (
        <div className="space-y-3" aria-live="polite">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : isAdmin && viewMode === "themes" ? (
        <ThemeTable
          rows={themeSummary}
          onSelect={(theme) => {
            setThemeFilter(theme);
            setViewMode("all");
          }}
        />
      ) : (isAdmin ? visibleComments : feedbackList).length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          {isAdmin && viewMode === "priority"
            ? "No Critical, High, low-confidence, or pending comments match these filters."
            : "No comments match these filters."}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {(isAdmin ? displayedComments : feedbackList).map((item) => (
              <CommentCard key={item.id} item={item} showAnalysis={isAdmin} />
            ))}
          </div>
          {isAdmin && displayedComments.length < visibleComments.length && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((current) => current + 50)}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Show 50 more ({visibleComments.length - displayedComments.length} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {isAdmin && !loading && (
        <p className="text-xs leading-5 text-slate-500">
          AI triage assists review and may be incorrect. It does not identify respondents or make employment, legal, or safety decisions. Original comments remain anonymous and unchanged.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {children}
      </select>
    </label>
  );
}

function CommentCard({ item, showAnalysis }: { item: FeedbackItem; showAnalysis: boolean }) {
  const analysis = showAnalysis ? item.analysis : null;
  return (
    <article className={`rounded-xl border bg-white p-5 ${
      analysis?.severity === "critical"
        ? "border-red-300"
        : analysis?.severity === "high"
          ? "border-orange-200"
          : "border-slate-200"
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        {showAnalysis && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityTone(analysis?.severity)}`}>
            {analysis ? severityLabel(analysis.severity) : "Pending AI"}
          </span>
        )}
        {analysis && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${sentimentTone(analysis.sentiment)}`}>
            {capitalize(analysis.sentiment)}
          </span>
        )}
        {analysis?.themes.map((theme) => (
          <span key={theme} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {theme}
          </span>
        ))}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.message}</p>
      {item.question && (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          <span className="font-medium text-slate-600">Question:</span> {item.question.text}
        </p>
      )}
      {analysis?.reason && (
        <p className="mt-3 border-l-2 border-slate-200 pl-3 text-xs leading-5 text-slate-500">
          <span className="font-semibold text-slate-600">AI triage rationale:</span> {analysis.reason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <span>{item.source === "survey" ? "Survey comment" : "Standalone feedback"}</span>
        {item.survey && <span>{item.survey.title}</span>}
        {item.department && <span>{item.department.name}</span>}
        <span>{formatDate(item.createdAt)}</span>
        {analysis && <span>{Math.round(analysis.confidence * 100)}% analysis confidence</span>}
        {analysis && (
          <span>{analysis.model.startsWith("built-in-") ? "Built-in classifier" : "External AI model"}</span>
        )}
      </div>
    </article>
  );
}

function ThemeTable({
  rows,
  onSelect,
}: {
  rows: Array<{ theme: string; total: number; criticalHigh: number; negative: number }>;
  onSelect: (theme: string) => void;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
        No analyzed themes match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-5 py-3 font-medium">Theme</th>
            <th className="px-5 py-3 font-medium">Comments</th>
            <th className="px-5 py-3 font-medium">Critical / High</th>
            <th className="px-5 py-3 font-medium">Negative</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.theme} className="hover:bg-slate-50">
              <td className="px-5 py-3">
                <button type="button" onClick={() => onSelect(row.theme)} className="font-medium text-primary hover:underline">
                  {row.theme}
                </button>
              </td>
              <td className="px-5 py-3 text-slate-700">{row.total}</td>
              <td className="px-5 py-3 text-slate-700">{row.criticalHigh}</td>
              <td className="px-5 py-3 text-slate-700">{row.negative}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compareComments(a: FeedbackItem, b: FeedbackItem, sortMode: SortMode) {
  if (sortMode === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (sortMode === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

  const aRank = COMMENT_SEVERITY_RANK[a.analysis?.severity || "pending"];
  const bRank = COMMENT_SEVERITY_RANK[b.analysis?.severity || "pending"];
  const rankDifference = sortMode === "severity_low" ? bRank - aRank : aRank - bRank;
  return rankDifference || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function severityLabel(severity: CommentSeverity) {
  return severity === "needs_review" ? "Needs Review" : capitalize(severity);
}

function severityTone(severity: CommentSeverity | undefined) {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-800";
    case "high": return "bg-orange-100 text-orange-800";
    case "medium": return "bg-amber-100 text-amber-800";
    case "low": return "bg-slate-100 text-slate-700";
    case "needs_review": return "bg-violet-100 text-violet-800";
    default: return "bg-blue-50 text-blue-700";
  }
}

function sentimentTone(sentiment: SerializedCommentAnalysis["sentiment"]) {
  switch (sentiment) {
    case "positive": return "bg-emerald-50 text-emerald-700";
    case "negative": return "bg-rose-50 text-rose-700";
    case "mixed": return "bg-amber-50 text-amber-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function clearFilters(setters: {
  setSearch: (value: string) => void;
  setSeverityFilter: (value: string) => void;
  setSentimentFilter: (value: string) => void;
  setThemeFilter: (value: string) => void;
  setSurveyFilter: (value: string) => void;
  setQuestionFilter: (value: string) => void;
  setDateFilter: (value: string) => void;
}) {
  setters.setSearch("");
  setters.setSeverityFilter("");
  setters.setSentimentFilter("");
  setters.setThemeFilter("");
  setters.setSurveyFilter("");
  setters.setQuestionFilter("");
  setters.setDateFilter("all");
}
