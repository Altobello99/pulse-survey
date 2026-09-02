"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type RatingsBreakdown = "overall" | "department" | "location" | "department_location";
type RatingsSort =
  | "alphabetical_asc"
  | "alphabetical_desc"
  | "rating_desc"
  | "rating_asc"
  | "responses_desc"
  | "responses_asc";
type MetricStatus = "available" | "suppressed" | "no_responses" | "not_configured";

type QuestionRatingsData = {
  queryKey: string;
  survey: { id: string; title: string };
  breakdown: RatingsBreakdown;
  questions: Array<{
    id: string;
    text: string;
    section: string;
    order: number;
    scaleMin: number;
    scaleMax: number;
  }>;
  groups: Array<{
    id: string;
    label: string;
    departmentId: string | null;
    departmentName: string | null;
    location: string | null;
    responseCount: number | null;
    status: "no_responses" | "suppressed" | "available";
    ratings: Array<{ questionId: string; average: number | null }>;
  }>;
  metrics: {
    enps: {
      questionText: string | null;
      status: MetricStatus;
      totalResponses: number | null;
      score: number | null;
      promotersCount: number | null;
      passivesCount: number | null;
      detractorsCount: number | null;
      promotersPercent: number | null;
      passivesPercent: number | null;
      detractorsPercent: number | null;
    };
    bestFriend: {
      questionText: string | null;
      status: MetricStatus;
      totalResponses: number | null;
      yesPercent: number | null;
      noPercent: number | null;
      preferNotToSayPercent: number | null;
    };
  };
  filterOptions: {
    departments: Array<{ id: string; name: string }>;
    departmentGroups: Array<{
      id: string;
      name: string;
      departmentCodes: string[];
      departmentIds: string[];
    }>;
    locations: string[];
  };
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
  const [ratingsBreakdown, setRatingsBreakdown] = useState<RatingsBreakdown>("department_location");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [questionFilter, setQuestionFilter] = useState("");
  const [ratingsSort, setRatingsSort] = useState<RatingsSort>("alphabetical_asc");
  const [questionRatings, setQuestionRatings] = useState<QuestionRatingsData | null>(null);
  const [questionRatingsError, setQuestionRatingsError] = useState<{
    queryKey: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const ratingsQueryKey = [
    selectedSurveyId,
    ratingsBreakdown,
    departmentFilter,
    locationFilter,
  ].join("|");

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
      setStats({
        totalEmployees,
        activeSurveys,
        avgParticipation,
      });

      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSurveyId) return;

    let cancelled = false;
    const params = new URLSearchParams({
      surveyId: selectedSurveyId,
      breakdown: ratingsBreakdown,
    });
    if (departmentFilter.startsWith("group:")) {
      params.set("departmentGroup", departmentFilter.slice("group:".length));
    } else if (departmentFilter) {
      params.set("departmentId", departmentFilter);
    }
    if (locationFilter) params.set("location", locationFilter);

    fetch(`/api/analytics/question-ratings?${params.toString()}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load question ratings");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) {
          setQuestionRatings(payload.data ? { ...payload.data, queryKey: ratingsQueryKey } : null);
          setQuestionRatingsError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setQuestionRatings(null);
          setQuestionRatingsError({ queryKey: ratingsQueryKey, message: error.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSurveyId, ratingsBreakdown, departmentFilter, locationFilter, ratingsQueryKey]);

  const selectedSurveyError = questionRatingsError?.queryKey === ratingsQueryKey
    ? questionRatingsError.message
    : "";
  const questionRatingsLoading = Boolean(
    selectedSurveyId &&
    questionRatings?.queryKey !== ratingsQueryKey &&
    !selectedSurveyError
  );

  const sections = useMemo(
    () => [...new Set((questionRatings?.questions || []).map((question) => question.section))],
    [questionRatings]
  );
  const questionOptions = useMemo(
    () => (questionRatings?.questions || []).filter(
      (question) => !sectionFilter || question.section === sectionFilter
    ),
    [questionRatings, sectionFilter]
  );
  const visibleQuestions = useMemo(
    () => questionOptions.filter((question) => !questionFilter || question.id === questionFilter),
    [questionOptions, questionFilter]
  );
  const sortedRatingGroups = useMemo(() => {
    const groups = [...(questionRatings?.groups || [])];
    const visibleQuestionIds = new Set(visibleQuestions.map((question) => question.id));
    const questionById = new Map(
      (questionRatings?.questions || []).map((question) => [question.id, question])
    );
    const groupScore = (group: QuestionRatingsData["groups"][number]) => {
      const scores = group.ratings.flatMap((rating) => {
        if (rating.average === null || !visibleQuestionIds.has(rating.questionId)) return [];
        const question = questionById.get(rating.questionId);
        if (!question || question.scaleMax === question.scaleMin) return [];
        return [(rating.average - question.scaleMin) / (question.scaleMax - question.scaleMin)];
      });
      return scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null;
    };
    const compareNullable = (a: number | null, b: number | null, direction: 1 | -1) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a - b) * direction;
    };

    groups.sort((a, b) => {
      if (ratingsSort === "alphabetical_desc") {
        return b.label.localeCompare(a.label, undefined, { numeric: true, sensitivity: "base" });
      }
      if (ratingsSort === "rating_desc") return compareNullable(groupScore(a), groupScore(b), -1);
      if (ratingsSort === "rating_asc") return compareNullable(groupScore(a), groupScore(b), 1);
      if (ratingsSort === "responses_desc") {
        return compareNullable(a.responseCount, b.responseCount, -1);
      }
      if (ratingsSort === "responses_asc") {
        return compareNullable(a.responseCount, b.responseCount, 1);
      }
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    });

    return groups;
  }, [questionRatings, ratingsSort, visibleQuestions]);
  const groupedDepartmentIds = useMemo(
    () => new Set(
      (questionRatings?.filterOptions.departmentGroups || [])
        .flatMap((group) => group.departmentIds)
    ),
    [questionRatings]
  );
  const ungroupedDepartments = useMemo(
    () => (questionRatings?.filterOptions.departments || []).filter(
      (department) => !groupedDepartmentIds.has(department.id)
    ),
    [groupedDepartmentIds, questionRatings]
  );
  const enpsMetric = questionRatings?.metrics.enps;
  const enpsCardValue = questionRatingsLoading
    ? "..."
    : enpsMetric?.status === "available" && enpsMetric.score !== null
      ? `${enpsMetric.score > 0 ? "+" : ""}${enpsMetric.score}`
      : "N/A";
  const enpsCardColor = enpsMetric?.status === "available" && enpsMetric.score !== null
    ? enpsMetric.score > 0
      ? "text-emerald-600"
      : enpsMetric.score < 0
        ? "text-red-600"
        : "text-slate-900"
    : "text-slate-500";

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
          { label: "eNPS (Selected View)", value: enpsCardValue, color: enpsCardColor },
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
            <h2 className="text-lg font-semibold text-slate-900">
              Question Ratings by Department and Location
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Every filtered group requires at least {questionRatings?.threshold ?? 3} responses before ratings appear.
            </p>
          </div>
          <label className="block min-w-0 sm:w-72">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Survey</span>
            <select
              value={selectedSurveyId}
              onChange={(event) => {
                setSelectedSurveyId(event.target.value);
                setSectionFilter("");
                setQuestionFilter("");
              }}
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

        <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Break down by</span>
            <select
              value={ratingsBreakdown}
              onChange={(event) => setRatingsBreakdown(event.target.value as RatingsBreakdown)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="department_location">Department + location</option>
              <option value="department">Department</option>
              <option value="location">Location</option>
              <option value="overall">Selected results combined</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Department or group</span>
            <select
              value={departmentFilter}
              onChange={(event) => {
                const value = event.target.value;
                setDepartmentFilter(value);
                if (value.startsWith("group:")) setRatingsBreakdown("overall");
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All departments</option>
              {(questionRatings?.filterOptions.departmentGroups || []).map((group) => (
                <optgroup key={group.id} label={group.name}>
                  <option value={`group:${group.id}`}>
                    {group.name} - combined ({group.departmentCodes.join(", ")})
                  </option>
                  {(questionRatings?.filterOptions.departments || [])
                    .filter((department) => group.departmentIds.includes(department.id))
                    .map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                </optgroup>
              ))}
              {ungroupedDepartments.length > 0 && (
                <optgroup label="Other departments">
                  {ungroupedDepartments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Location</span>
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All locations</option>
              {(questionRatings?.filterOptions.locations || []).map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Survey section</span>
            <select
              value={sectionFilter}
              onChange={(event) => {
                setSectionFilter(event.target.value);
                setQuestionFilter("");
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All sections</option>
              {sections.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Rating question</span>
            <select
              value={questionFilter}
              onChange={(event) => setQuestionFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All rating questions</option>
              {questionOptions.map((question) => (
                <option key={question.id} value={question.id}>
                  Question {question.order + 1}: {question.text}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">Sort groups</span>
            <select
              value={ratingsSort}
              onChange={(event) => setRatingsSort(event.target.value as RatingsSort)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="alphabetical_asc">Alphabetical: A to Z</option>
              <option value="alphabetical_desc">Alphabetical: Z to A</option>
              <option value="rating_desc">Rating: high to low</option>
              <option value="rating_asc">Rating: low to high</option>
              <option value="responses_desc">Responses: high to low</option>
              <option value="responses_asc">Responses: low to high</option>
            </select>
          </label>
        </div>

        {!questionRatingsLoading && questionRatings && (
          <>
            <div className="grid border-t border-slate-200 lg:grid-cols-2">
              <div className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">Employee Net Promoter Score (eNPS)</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                      {questionRatings.metrics.enps.questionText || "No eNPS question is configured for this survey."}
                    </p>
                  </div>
                  {questionRatings.metrics.enps.status === "available" &&
                  questionRatings.metrics.enps.score !== null ? (
                    <div className="text-right">
                      <p className={`text-4xl font-bold ${questionRatings.metrics.enps.score >= 0 ? "text-primary" : "text-red-600"}`}>
                        {questionRatings.metrics.enps.score > 0 ? "+" : ""}{questionRatings.metrics.enps.score}
                      </p>
                      <p className="text-xs font-medium uppercase text-slate-500">Calculated eNPS</p>
                    </div>
                  ) : null}
                </div>

                {questionRatings.metrics.enps.status === "available" ? (
                  <>
                    <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center">
                      <div className="px-2">
                        <p className="text-lg font-semibold text-emerald-700">{questionRatings.metrics.enps.promotersPercent}%</p>
                        <p className="text-xs text-slate-500">Promoters 9-10</p>
                      </div>
                      <div className="px-2">
                        <p className="text-lg font-semibold text-amber-700">{questionRatings.metrics.enps.passivesPercent}%</p>
                        <p className="text-xs text-slate-500">Passives 7-8</p>
                      </div>
                      <div className="px-2">
                        <p className="text-lg font-semibold text-rose-700">{questionRatings.metrics.enps.detractorsPercent}%</p>
                        <p className="text-xs text-slate-500">Detractors 0-6</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Based on {questionRatings.metrics.enps.totalResponses} filtered responses.
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      ({questionRatings.metrics.enps.promotersCount} promoters - {questionRatings.metrics.enps.detractorsCount} detractors) / {questionRatings.metrics.enps.totalResponses} responses x 100 = {questionRatings.metrics.enps.score! > 0 ? "+" : ""}{questionRatings.metrics.enps.score} eNPS.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      The score uses exact response counts; category percentages are rounded for display.
                    </p>
                  </>
                ) : (
                  <p className="mt-5 text-sm font-medium text-slate-500">
                    {questionRatings.metrics.enps.status === "suppressed"
                      ? `Protected until at least ${questionRatings.threshold} people in this filtered group respond.`
                      : questionRatings.metrics.enps.status === "no_responses"
                        ? "No responses yet for this filtered group."
                        : "This survey does not include a 0-10 recommendation question."}
                  </p>
                )}
              </div>

              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">Best Friend at Work</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                      {questionRatings.metrics.bestFriend.questionText || "No best-friend-at-work question is configured for this survey."}
                    </p>
                  </div>
                  {questionRatings.metrics.bestFriend.status === "available" &&
                  questionRatings.metrics.bestFriend.yesPercent !== null ? (
                    <div className="text-right">
                      <p className="text-4xl font-bold text-secondary">{questionRatings.metrics.bestFriend.yesPercent}%</p>
                      <p className="text-xs font-medium uppercase text-slate-500">Answered Yes</p>
                    </div>
                  ) : null}
                </div>

                {questionRatings.metrics.bestFriend.status === "available" ? (
                  <>
                    <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center">
                      <div className="px-2">
                        <p className="text-lg font-semibold text-emerald-700">{questionRatings.metrics.bestFriend.yesPercent}%</p>
                        <p className="text-xs text-slate-500">Yes</p>
                      </div>
                      <div className="px-2">
                        <p className="text-lg font-semibold text-slate-700">{questionRatings.metrics.bestFriend.noPercent}%</p>
                        <p className="text-xs text-slate-500">No</p>
                      </div>
                      <div className="px-2">
                        <p className="text-lg font-semibold text-slate-500">{questionRatings.metrics.bestFriend.preferNotToSayPercent}%</p>
                        <p className="text-xs text-slate-500">Prefer not to say</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Based on {questionRatings.metrics.bestFriend.totalResponses} filtered responses.
                    </p>
                  </>
                ) : (
                  <p className="mt-5 text-sm font-medium text-slate-500">
                    {questionRatings.metrics.bestFriend.status === "suppressed"
                      ? `Protected until at least ${questionRatings.threshold} people in this filtered group respond.`
                      : questionRatings.metrics.bestFriend.status === "no_responses"
                        ? "No responses yet for this filtered group."
                        : "This survey does not include the best-friend-at-work question."}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-blue-200 bg-blue-50 px-6 py-5">
              <h3 className="font-semibold text-blue-950">How the scores work</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900">
                <li>Most rating questions use a 1-5 scale. Higher averages indicate a more favourable response.</li>
                <li>The workplace recommendation question uses a 0-10 scale, so averages above 5 are expected and are displayed as a score out of 10.</li>
                <li>eNPS subtracts the percentage of Detractors (0-6) from Promoters (9-10). Passives (7-8) do not change the score. The result ranges from -100 to +100.</li>
                <li>Table colours are normalized to each question&apos;s own scale and are visual guides, not eNPS categories.</li>
              </ul>
              <p className="mt-2 text-xs text-blue-800">
                The metric panels use the selected survey, department, and location filters. Small groups remain protected.
              </p>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>
            Showing {visibleQuestions.length} rating {visibleQuestions.length === 1 ? "question" : "questions"} across {sortedRatingGroups.length} {sortedRatingGroups.length === 1 ? "group" : "groups"}.
          </span>
          {(departmentFilter || locationFilter || sectionFilter || questionFilter) && (
            <button
              type="button"
              onClick={() => {
                setDepartmentFilter("");
                setLocationFilter("");
                setSectionFilter("");
                setQuestionFilter("");
              }}
              className="font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {questionRatingsLoading ? (
          <div className="border-t border-slate-200 p-6" aria-live="polite">
            <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : selectedSurveyError ? (
          <p className="border-t border-slate-200 p-6 text-sm text-red-600">{selectedSurveyError}</p>
        ) : !selectedSurveyId ? (
          <p className="border-t border-slate-200 p-6 text-sm text-slate-500">No surveys are available.</p>
        ) : questionRatings?.questions.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
            This survey has no rating questions.
          </p>
        ) : visibleQuestions.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
            No rating questions match these filters.
          </p>
        ) : sortedRatingGroups.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
            No department and location groups match these filters.
          </p>
        ) : questionRatings ? (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 z-10 min-w-80 max-w-md border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700">
                    Rating question
                  </th>
                  {sortedRatingGroups.map((group) => (
                    <th
                      key={group.id}
                      className="min-w-44 border-b border-r border-slate-200 px-4 py-3 text-center font-semibold text-slate-700 last:border-r-0"
                    >
                      {questionRatings.breakdown === "department_location" ? (
                        <>
                          <span className="block">{group.departmentName}</span>
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {group.location || "Location not recorded"}
                          </span>
                        </>
                      ) : (
                        <span className="block">{group.label}</span>
                      )}
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {group.status === "available"
                          ? `${group.responseCount} responses`
                          : group.status === "suppressed"
                            ? "Protected"
                            : "No responses"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleQuestions.map((question) => (
                  <tr key={question.id} className="even:bg-slate-50/50">
                    <th className="sticky left-0 z-10 max-w-md border-b border-r border-slate-200 bg-white px-4 py-4 text-left align-top font-medium text-slate-800">
                      <span className="mb-1 block text-xs font-semibold text-primary">
                        {question.section} | Question {question.order + 1}
                      </span>
                      {question.text}
                    </th>
                    {sortedRatingGroups.map((group) => {
                      const rating = group.ratings.find((item) => item.questionId === question.id);
                      return (
                        <td
                          key={group.id}
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
                              {group.status === "suppressed" ? "Protected" : "N/A"}
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
        ) : null}
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
