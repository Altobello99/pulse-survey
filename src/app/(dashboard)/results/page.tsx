"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Pencil,
  Presentation,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";

type Catalog = {
  access: { canManage: boolean; companyWide: boolean; executive: boolean };
  surveys: Array<{
    id: string;
    title: string;
    status: string;
    startDate: string;
    endDate: string;
    release: ReleaseState;
  }>;
  leaders: Array<{ email: string; name: string; detail: string }>;
};

type ReleaseState = {
  resultsReleasedAt: string | null;
  insightsReleasedAt: string | null;
  commentsReleasedAt: string | null;
};

type QuestionResult = {
  id: string;
  order: number;
  section: string | null;
  question: string;
  responses: number | null;
  average: number | null;
  scaleMin: number;
  scaleMax: number;
  favorablePercent: number | null;
  neutralPercent: number | null;
  unfavorablePercent: number | null;
  isEnps: boolean;
};

type HierarchyRow = {
  id: string;
  type: "department" | "combined";
  department: string;
  location: string;
  label: string;
  eligibleEmployees: number;
  completions: number;
  participationRate: number;
  averageRating: number | null;
  favorablePercent: number | null;
  suppressed: boolean;
  questions: QuestionResult[];
};

type ComparisonGroup = {
  id: string;
  type: "selected" | "company" | "reporting_group" | "department" | "combined";
  label: string;
  detail: string;
  eligibleEmployees: number;
  completions: number;
  participationRate: number;
  averageRating: number | null;
  favorablePercent: number | null;
  suppressed: boolean;
  questions: QuestionResult[];
};

type ComparisonQuestion = {
  id: string;
  order: number;
  section: string | null;
  question: string;
  scaleMax: number;
  isEnps: boolean;
};

type Insight = {
  id: string | null;
  insightKey: string;
  kind: string;
  title: string;
  body: string;
  severity: string;
  evidence: unknown;
  status: string;
  sortOrder: number;
};

type ResultsData = {
  locked: false;
  access: {
    canManage: boolean;
    companyWide: boolean;
    executive: boolean;
    viewingAsLeader: boolean;
    releaseMode: "admin" | "global" | "manager_test" | "locked";
    testRelease: boolean;
  };
  survey: { id: string; title: string; status: string; startDate: string; endDate: string };
  release: ReleaseState;
  targetRelease: ReleaseState | null;
  scope: {
    type: string;
    label: string;
    key: string;
    options: Array<{ value: string; label: string }>;
  };
  filters: {
    selected: {
      departmentIds: string[];
      locations: string[];
      divisions: string[];
      teamIds: string[];
    };
    options: {
      departments: Array<{ id: string; name: string }>;
      locations: string[];
      divisions: string[];
      teams: Array<{ id: string; name: string }>;
    };
  };
  metrics: {
    eligibleEmployees: number;
    completions: number;
    participationRate: number;
    responseCount: number;
    suppressed: boolean;
    averageRating: number | null;
    favorablePercent: number | null;
    neutralPercent: number | null;
    unfavorablePercent: number | null;
    friendYesPercent: number | null;
    commentCount: number | null;
    enps: number | null;
    enpsResponses: number | null;
    enpsLabel: string;
  };
  benchmarks: {
    company: Benchmark;
    parent: Benchmark | null;
  };
  questions: QuestionResult[];
  hierarchy: HierarchyRow[];
  comparison: {
    questions: ComparisonQuestion[];
    groups: ComparisonGroup[];
  };
  sentiment: { positive: number; neutral: number; negative: number; mixed: number; total: number } | null;
  themes: Array<{ theme: string; mentions: number; critical: number; high: number; negative: number }>;
  comments: Array<{
    id?: string;
    text: string;
    question: string;
    department: string;
    location: string;
    sentiment: string;
    severity: string;
    themes: string[];
    status?: string;
    submittedAt: string;
  }>;
  commentAccess: { mode: string; released: boolean; totalInScope: number | null; visible: number };
  insights: Insight[];
  insightCandidates?: Omit<Insight, "id" | "status">[];
  insightsAwaitingRelease: boolean;
  anonymityThreshold: number;
  generatedAt: string;
};

type Benchmark = {
  label: string;
  eligibleEmployees: number;
  completions: number;
  participationRate: number;
  averageRating: number | null;
  favorablePercent: number | null;
};

type LockedData = {
  locked: true;
  access: Catalog["access"];
  survey: { id: string; title: string; status: string; startDate: string; endDate: string };
  release: ReleaseState;
  anonymityThreshold: number;
};

type ActiveFilters = {
  scope: string;
  departments: string[];
  locations: string[];
  divisions: string[];
  teams: string[];
  viewAs: string;
};

const EMPTY_FILTERS: ActiveFilters = {
  scope: "",
  departments: [],
  locations: [],
  divisions: [],
  teams: [],
  viewAs: "",
};

export default function ResultsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [surveyId, setSurveyId] = useState("");
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [data, setData] = useState<ResultsData | LockedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"summary" | "comparison" | "hierarchy" | "questions" | "comments">("summary");

  const loadCatalog = useCallback(async () => {
    const response = await fetch("/api/results", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load Results.");
    const nextCatalog = payload.data as Catalog;
    setCatalog(nextCatalog);
    setSurveyId((current) => current || nextCatalog.surveys[0]?.id || "");
  }, []);

  const queryString = useMemo(() => buildQuery(filters), [filters]);

  const loadResults = useCallback(async () => {
    if (!surveyId) return;
    setUpdating(true);
    setError("");
    try {
      const response = await fetch(`/api/results/${surveyId}?${queryString}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load survey results.");
      const next = payload.data as ResultsData | LockedData;
      setData(next);
      if (!next.locked && !filters.scope) {
        setFilters((current) => ({ ...current, scope: next.scope.type }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load survey results.");
    } finally {
      setUpdating(false);
    }
  }, [filters.scope, queryString, surveyId]);

  useEffect(() => {
    void loadCatalog()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Results."))
      .finally(() => setLoading(false));
  }, [loadCatalog]);

  useEffect(() => {
    if (surveyId) void loadResults();
  }, [loadResults, surveyId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadCatalog(), loadResults()]);
  }, [loadCatalog, loadResults]);

  if (loading) return <ResultsLoading />;
  if (!catalog?.surveys.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No released survey results"
        detail={catalog?.access.canManage ? "Closed surveys will appear here for HR review and release." : "HR has not released any survey results yet."}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-10">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary-dark">
            <BarChart3 className="h-4 w-4" />
            Anonymous hierarchy reporting
          </div>
          <h1 className="text-3xl font-bold text-slate-950">Results</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Explore released pulse survey results by reporting scope, department, and location. Scores are pooled from the underlying responses and protected until at least three employees have completed the survey.
          </p>
        </div>
        {data && !data.locked && !data.access.testRelease && (
          <ExportMenu surveyId={surveyId} queryString={queryString} disabled={updating} />
        )}
        {data && !data.locked && data.access.testRelease && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
            <ShieldCheck className="h-4 w-4" />
            Manager test access: downloads disabled
          </div>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="border-y border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(0,3fr)]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">Survey</span>
            <select
              value={surveyId}
              onChange={(event) => {
                setSurveyId(event.target.value);
                setFilters(EMPTY_FILTERS);
              }}
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              {catalog.surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.title} ({survey.status})
                </option>
              ))}
            </select>
          </label>

          {catalog.access.canManage && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">HR preview</span>
              <select
                value={filters.viewAs}
                onChange={(event) =>
                  setFilters({ ...EMPTY_FILTERS, viewAs: event.target.value })
                }
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Company-wide administrator view</option>
                {catalog.leaders.map((leader) => (
                  <option key={leader.email} value={leader.email}>
                    View as {leader.name} ({leader.detail})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">Names appear only in HR and admin access controls; they never appear in results or exports.</span>
            </label>
          )}
        </div>

        {data && !data.locked && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase text-slate-500">Scope</span>
              {data.scope.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilters((current) => ({ ...current, scope: option.value }))}
                  className={`h-9 rounded-md border px-3 text-sm font-medium transition ${
                    data.scope.type === option.value
                      ? "border-primary bg-primary text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterMenu
                icon={Building2}
                label="Departments"
                options={data.filters.options.departments.map((department) => ({ value: department.id, label: department.name }))}
                selected={filters.departments}
                onChange={(selected) => setFilters((current) => ({ ...current, departments: selected }))}
              />
              <FilterMenu
                icon={MapPin}
                label="Locations"
                options={data.filters.options.locations.map((location) => ({ value: location, label: location }))}
                selected={filters.locations}
                onChange={(selected) => setFilters((current) => ({ ...current, locations: selected }))}
              />
              <FilterMenu
                icon={Filter}
                label="Divisions"
                options={data.filters.options.divisions.map((division) => ({ value: division, label: division }))}
                selected={filters.divisions}
                onChange={(selected) => setFilters((current) => ({ ...current, divisions: selected }))}
              />
              <FilterMenu
                icon={Users}
                label="Shift / line"
                options={data.filters.options.teams.map((team) => ({ value: team.id, label: team.name }))}
                selected={filters.teams}
                onChange={(selected) => setFilters((current) => ({ ...current, teams: selected }))}
              />
              {activeFilterCount(filters) > 0 && (
                <button
                  onClick={() => setFilters((current) => ({ ...EMPTY_FILTERS, scope: current.scope, viewAs: current.viewAs }))}
                  className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <RotateCcw className="h-4 w-4" />
                  Clear filters
                </button>
              )}
              {updating && <span className="ml-auto text-xs font-medium text-primary-dark">Updating view...</span>}
            </div>
          </div>
        )}
      </section>

      {data?.locked ? (
        <LockedResults data={data} />
      ) : data ? (
        <>
          {data.access.canManage && (
            <ReleaseCentre
              surveyId={surveyId}
              release={data.release}
              targetRelease={data.targetRelease}
              targetEmail={filters.viewAs}
              targetName={catalog.leaders.find((leader) => leader.email === filters.viewAs)?.name || ""}
              onChanged={refresh}
            />
          )}

          <section>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">{data.scope.label}</h2>
                <p className="text-sm text-slate-500">
                  {formatDate(data.survey.startDate)} to {formatDate(data.survey.endDate)}
                </p>
              </div>
              <PrivacyBadge suppressed={data.metrics.suppressed} threshold={data.anonymityThreshold} />
            </div>
            <KpiGrid data={data} />
          </section>

          <nav className="flex overflow-x-auto border-b border-slate-300" aria-label="Results views">
            {[
              ["summary", "Executive summary"],
              ["comparison", "Compare"],
              ["hierarchy", "Hierarchy comparison"],
              ["questions", "Question scores"],
              ["comments", "Themes & comments"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value as typeof tab)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  tab === value
                    ? "border-primary text-primary-dark"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "summary" && (
            <SummaryView data={data} onRefresh={loadResults} />
          )}
          {tab === "comparison" && (
            <ComparisonView key={data.scope.key} data={data} />
          )}
          {tab === "hierarchy" && <HierarchyView rows={data.hierarchy} />}
          {tab === "questions" && <QuestionsView questions={data.questions} suppressed={data.metrics.suppressed} />}
          {tab === "comments" && (
            <CommentsView data={data} surveyId={surveyId} onRefresh={loadResults} />
          )}
        </>
      ) : (
        <ResultsLoading />
      )}
    </div>
  );
}

function KpiGrid({ data }: { data: ResultsData }) {
  const cards = [
    {
      label: "Participation",
      value: `${data.metrics.participationRate}%`,
      detail: `${data.metrics.completions} of ${data.metrics.eligibleEmployees} completed`,
      icon: Users,
      tone: "text-primary-dark",
    },
    {
      label: "Average rating",
      value: data.metrics.averageRating === null ? "Protected" : `${data.metrics.averageRating} / 5`,
      detail: "Across all standard rating questions",
      icon: BarChart3,
      tone: scoreText(data.metrics.averageRating),
    },
    {
      label: "Favourable",
      value: displayPercent(data.metrics.favorablePercent),
      detail: "Ratings of 4 or 5",
      icon: CheckCircle2,
      tone: "text-emerald-600",
    },
    {
      label: "Company-wide eNPS",
      value: data.metrics.enps === null ? "N/A" : signed(data.metrics.enps),
      detail: `${data.metrics.enpsResponses ?? 0} company-wide responses`,
      icon: Target,
      tone: enpsTone(data.metrics.enps),
    },
    {
      label: "Best friend at work",
      value: displayPercent(data.metrics.friendYesPercent),
      detail: "Selected reporting scope",
      icon: Users,
      tone: "text-blue-600",
    },
    {
      label: "Written comments",
      value: data.metrics.commentCount === null ? "Protected" : String(data.metrics.commentCount),
      detail: "Anonymous written responses",
      icon: MessageSquareText,
      tone: "text-slate-900",
    },
  ];

  return (
    <div className="mt-4 grid gap-px overflow-hidden border-y border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="min-h-32 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-500">{card.label}</span>
            <card.icon className="h-4 w-4 text-slate-400" />
          </div>
          <div className={`mt-3 text-2xl font-bold ${card.tone}`}>{card.value}</div>
          <div className="mt-1 text-xs text-slate-500">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}

function SummaryView({ data, onRefresh }: { data: ResultsData; onRefresh: () => Promise<void> }) {
  const standard = data.questions.filter((question) => !question.isEnps && question.average !== null);
  const highest = [...standard].sort((left, right) => (right.average || 0) - (left.average || 0)).slice(0, 3);
  const lowest = [...standard].sort((left, right) => (left.average || 0) - (right.average || 0)).slice(0, 3);

  return (
    <div className="space-y-6">
      <BenchmarkStrip data={data} />
      <div className="grid gap-6 xl:grid-cols-2">
        <QuestionSummary title="Highest-scoring questions" questions={highest} tone="positive" />
        <QuestionSummary title="Areas to watch" questions={lowest} tone="watch" />
      </div>
      <EnpsGuide score={data.metrics.enps} />
      <InsightPanel data={data} onRefresh={onRefresh} />
    </div>
  );
}

function BenchmarkStrip({ data }: { data: ResultsData }) {
  const selected = {
    label: data.scope.type === "company" ? "Company-wide view" : "Direct reports",
    participationRate: data.metrics.participationRate,
    averageRating: data.metrics.averageRating,
    favorablePercent: data.metrics.favorablePercent,
  };
  const benchmarks = [selected, data.benchmarks.parent, data.benchmarks.company].filter(Boolean) as Array<{
    label: string;
    participationRate: number;
    averageRating: number | null;
    favorablePercent: number | null;
  }>;
  return (
    <section>
      <SectionHeading title="Benchmarks" detail="Compare direct reports with the department reporting group and company-wide survey results." />
      <div className="mt-3 grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 md:grid-cols-3">
        {benchmarks.map((benchmark) => (
          <div key={benchmark.label} className="bg-white p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">{benchmark.label}</div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <MiniMetric label="Participation" value={`${benchmark.participationRate}%`} />
              <MiniMetric label="Average" value={benchmark.averageRating === null ? "N/A" : `${benchmark.averageRating}/5`} />
              <MiniMetric label="Favourable" value={displayPercent(benchmark.favorablePercent)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionSummary({ title, questions, tone }: { title: string; questions: QuestionResult[]; tone: "positive" | "watch" }) {
  return (
    <section>
      <SectionHeading title={title} />
      <div className="mt-3 space-y-2">
        {questions.length ? questions.map((question) => (
          <div key={question.id} className="grid min-h-24 grid-cols-[64px_1fr] border border-slate-200 bg-white">
            <div className={`flex items-center justify-center text-xl font-bold text-white ${tone === "positive" ? "bg-primary" : "bg-amber-500"}`}>
              {question.average}
            </div>
            <div className="min-w-0 p-3">
              <div className="line-clamp-2 text-sm font-semibold text-slate-900">{question.question}</div>
              <div className="mt-2 text-xs text-slate-500">{question.favorablePercent}% favourable · {question.responses} responses</div>
            </div>
          </div>
        )) : <ProtectedPanel />}
      </div>
    </section>
  );
}

function EnpsGuide({ score }: { score: number | null }) {
  const position = score === null ? 50 : Math.max(2, Math.min(98, (score + 100) / 2));
  const bandWidths = "50fr 15fr 20fr 15fr";
  const bands = [
    ["-100 to 0", "Significant dissatisfaction"],
    ["0 to 30", "Room for improvement"],
    ["30 to 70", "Healthy satisfaction"],
    ["70 to 100", "Exceptional satisfaction"],
  ];
  return (
    <section className="border-y border-slate-200 bg-white py-5">
      <div className="px-4 sm:px-5">
        <SectionHeading title="What the company-wide eNPS means" detail="eNPS is the percentage of promoters minus the percentage of detractors, on a scale from -100 to +100." />
        <div className="relative mt-7">
          {score !== null && (
            <div className="absolute -top-7 -translate-x-1/2 text-center" style={{ left: `${position}%` }}>
              <div className="rounded bg-slate-950 px-2 py-1 text-xs font-bold text-white">{signed(score)}</div>
              <div className="mx-auto h-2 w-px bg-slate-950" />
            </div>
          )}
          <div className="grid h-5 overflow-hidden rounded-sm" style={{ gridTemplateColumns: bandWidths }}>
            <div className="bg-red-500" />
            <div className="bg-amber-400" />
            <div className="bg-sky-500" />
            <div className="bg-emerald-500" />
          </div>
          <div className="mt-2 hidden text-center text-xs sm:grid" style={{ gridTemplateColumns: bandWidths }}>
            {bands.map(([range, label]) => <div key={range} className="min-w-0 px-1"><strong>{range}</strong><span className="block leading-4 text-slate-500">{label}</span></div>)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:hidden">
            {bands.map(([range, label]) => <div key={range} className="border border-slate-200 bg-slate-50 p-2 text-center"><strong>{range}</strong><span className="mt-0.5 block leading-4 text-slate-500">{label}</span></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function InsightPanel({ data, onRefresh }: { data: ResultsData; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const saveCandidates = async () => {
    if (!data.insightCandidates?.length) return;
    setBusy(true);
    await fetch(`/api/results/${data.survey.id}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeKey: data.scope.key, scopeLabel: data.scope.label, insights: data.insightCandidates }),
    });
    await onRefresh();
    setBusy(false);
  };

  return (
    <section>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading title="Highlights and areas to watch" detail="AI-assisted synthesis grounded in question scores and analysed comment themes." />
        {data.access.canManage && (
          <button onClick={saveCandidates} disabled={busy || !data.insightCandidates?.length} className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            {data.insights.some((insight) => insight.id) ? "Regenerate draft" : "Save for HR review"}
          </button>
        )}
      </div>
      {data.insightsAwaitingRelease ? (
        <div className="mt-3 flex items-center gap-3 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Sparkles className="h-5 w-5 shrink-0" />
          AI-assisted insights are awaiting HR review and release.
        </div>
      ) : data.insights.length ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {data.insights.map((insight) => (
            <InsightCard key={insight.id || insight.insightKey} insight={insight} surveyId={data.survey.id} editable={data.access.canManage} onRefresh={onRefresh} />
          ))}
        </div>
      ) : (
        <div className="mt-3 border border-slate-200 bg-white p-5 text-sm text-slate-500">No reportable insights are available for this filtered view.</div>
      )}
    </section>
  );
}

function InsightCard({ insight, surveyId, editable, onRefresh }: { insight: Insight; surveyId: string; editable: boolean; onRefresh: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(insight.title);
  const [body, setBody] = useState(insight.body);
  const [busy, setBusy] = useState(false);

  const update = async (changes: { title?: string; body?: string; status?: string }) => {
    if (!insight.id) return;
    setBusy(true);
    await fetch(`/api/results/${surveyId}/insights`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: insight.id, ...changes }),
    });
    setEditing(false);
    await onRefresh();
    setBusy(false);
  };

  return (
    <article className="border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${insightDot(insight.severity)}`} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-semibold" />
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => update({ title, body })} disabled={busy} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white">Save</button>
                <button onClick={() => setEditing(false)} className="rounded px-3 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-bold text-slate-950">{insight.title}</h3>
                {editable && insight.id && (
                  <div className="flex gap-1">
                    <IconButton title="Edit insight" onClick={() => setEditing(true)} icon={Pencil} />
                    <IconButton title="Hide insight" onClick={() => update({ status: "hidden" })} icon={EyeOff} />
                    <IconButton title="Approve insight" onClick={() => update({ status: "approved" })} icon={Check} active={insight.status === "approved"} />
                  </div>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{insight.body}</p>
              {editable && <span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(insight.status)}`}>{insight.status}</span>}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function ComparisonView({ data }: { data: ResultsData }) {
  const [groupIds, setGroupIds] = useState(() => comparisonDefaultGroups(data.comparison.groups));
  const [metricIds, setMetricIds] = useState<string[]>(["overall"]);
  const groups = groupIds
    .map((id) => data.comparison.groups.find((group) => group.id === id))
    .filter((group): group is ComparisonGroup => Boolean(group));
  const metrics = metricIds
    .map((id) => {
      if (id === "overall") {
        return {
          id,
          order: 0,
          section: "Summary",
          question: "Overall rating across standard questions",
          scaleMax: 5,
          isEnps: false,
        };
      }
      return data.comparison.questions.find((question) => question.id === id) || null;
    })
    .filter((metric): metric is ComparisonQuestion => Boolean(metric));
  const chartMetric = metrics[0] || null;

  const groupOptions = data.comparison.groups.map((group) => ({
    value: group.id,
    label: group.label,
    detail: `${comparisonTypeLabel(group.type)} · ${group.completions}/${group.eligibleEmployees} completed`,
  }));
  const questionOptions = [
    {
      value: "overall",
      label: "Overall rating",
      detail: "Average across all standard 1-5 questions",
    },
    ...data.comparison.questions.map((question) => ({
      value: question.id,
      label: `Question ${question.order}: ${question.question}`,
      detail: `${question.section || "General"} · out of ${question.scaleMax}`,
    })),
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeading
          title="Side-by-side comparison"
          detail="Compare authorised reporting organisations, departments, and sites against company-wide results. No leader names or individual responses are shown."
        />
        <div className="flex flex-wrap gap-2">
          <ComparisonSelector
            icon={Building2}
            label="Groups"
            options={groupOptions}
            selected={groupIds}
            onChange={setGroupIds}
            max={4}
            searchPlaceholder="Search departments or groups"
          />
          <ComparisonSelector
            icon={BarChart3}
            label="Questions"
            options={questionOptions}
            selected={metricIds}
            onChange={setMetricIds}
            searchPlaceholder="Search survey questions"
          />
        </div>
      </div>

      <div className="flex items-start gap-3 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The company-wide comparison uses the complete survey dataset. Every other column is limited to the current viewer&apos;s authorised BambooHR hierarchy and remains protected until at least {data.anonymityThreshold} employees have completed the survey.
        </p>
      </div>

      {groups.length ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {groups.map((group) => (
              <article key={group.id} className="min-w-0 overflow-hidden border border-slate-200 bg-white p-4">
                <div className="flex min-h-12 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase text-primary-dark">{comparisonTypeLabel(group.type)}</div>
                    <h3 className="mt-1 font-bold leading-5 text-slate-950">{group.label}</h3>
                  </div>
                  {group.suppressed && <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-1 border-t border-slate-100 pt-3 text-center sm:gap-2">
                  <MiniMetric label="Participation" value={`${group.participationRate}%`} />
                  <MiniMetric label="Completed" value={`${group.completions}/${group.eligibleEmployees}`} />
                  <MiniMetric label="Average" value={group.averageRating === null ? "Protected" : `${group.averageRating}/5`} />
                </div>
              </article>
            ))}
          </div>

          {chartMetric && (
            <section>
              <SectionHeading
                title={chartMetric.id === "overall" ? "Overall rating comparison" : `Question ${chartMetric.order} comparison`}
                detail={chartMetric.question}
              />
              <div className="mt-3 space-y-3 border border-slate-200 bg-white p-4">
                {groups.map((group) => {
                  const score = comparisonScore(group, chartMetric);
                  return (
                    <div key={group.id} className="grid min-h-10 items-center gap-3 sm:grid-cols-[minmax(180px,280px)_minmax(180px,1fr)_96px]">
                      <div className="min-w-0 text-sm font-semibold text-slate-800">{group.label}</div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: score.average === null ? "0%" : `${Math.max(0, Math.min(100, (score.average / score.scaleMax) * 100))}%` }}
                        />
                      </div>
                      <div className={`text-right text-sm font-bold ${scoreText(score.scaleMax === 5 ? score.average : null)}`}>
                        {score.average === null ? "Protected" : `${score.average}/${score.scaleMax}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <SectionHeading title="Comparison matrix" detail="Add multiple questions to line up the same measure across each selected group." />
            <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-80 bg-slate-50 px-4 py-3 font-semibold">Question or metric</th>
                    {groups.map((group) => (
                      <th key={group.id} className="min-w-52 px-4 py-3 font-semibold">
                        <span className="block text-slate-700">{group.label}</span>
                        <span className="mt-0.5 block text-[10px] font-medium normal-case text-slate-400">{group.completions}/{group.eligibleEmployees} completed</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.map((metric) => (
                    <tr key={metric.id} className="align-top hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-4 py-4">
                        <div className="text-xs font-semibold uppercase text-primary-dark">{metric.section || "General"}{metric.id !== "overall" ? ` · Question ${metric.order}` : ""}</div>
                        <div className="mt-1 max-w-xl font-semibold leading-5 text-slate-900">{metric.question}</div>
                      </td>
                      {groups.map((group) => (
                        <ComparisonScoreCell key={group.id} group={group} metric={metric} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!metrics.length && <div className="p-8 text-center text-sm text-slate-500">Select at least one question or metric to compare.</div>}
            </div>
          </section>
        </>
      ) : (
        <div className="flex min-h-48 items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500">
          Select at least one comparison group to begin comparing results.
        </div>
      )}
    </section>
  );
}

function ComparisonScoreCell({ group, metric }: { group: ComparisonGroup; metric: ComparisonQuestion }) {
  const score = comparisonScore(group, metric);
  return (
    <td className="px-4 py-4">
      {score.average === null ? (
        <ProtectedInline />
      ) : (
        <>
          <div className={`text-lg font-bold ${scoreText(score.scaleMax === 5 ? score.average : null)}`}>
            {score.average} <span className="text-xs font-medium text-slate-400">/ {score.scaleMax}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {score.isEnps ? "Average recommendation rating" : `${score.favorablePercent ?? 0}% favourable`}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{score.responses ?? group.completions} responses</div>
        </>
      )}
    </td>
  );
}

function ComparisonSelector({ icon: Icon, label, options, selected, onChange, max, searchPlaceholder }: {
  icon: typeof Filter;
  label: string;
  options: Array<{ value: string; label: string; detail: string }>;
  selected: string[];
  onChange: (selected: string[]) => void;
  max?: number;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState("");
  const visible = options.filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-400">
        <Icon className="h-4 w-4 text-primary-dark" />
        {label} ({selected.length})
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <label className="relative block border-b border-slate-100 p-2">
          <Search className="pointer-events-none absolute left-5 top-5 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </label>
        <div className="max-h-80 overflow-y-auto p-2">
          {visible.map((option) => {
            const checked = selected.includes(option.value);
            const disabled = !checked && Boolean(max && selected.length >= max);
            return (
              <label key={option.value} className={`flex items-start gap-2 rounded px-2 py-2 ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-slate-50"}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onChange(checked ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
                  className="mt-0.5 h-4 w-4 accent-teal-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-5 text-slate-800">{option.label}</span>
                  <span className="block text-xs leading-4 text-slate-500">{option.detail}</span>
                </span>
              </label>
            );
          })}
          {!visible.length && <div className="px-2 py-6 text-center text-sm text-slate-500">No matching options.</div>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
          <span className="text-slate-500">{max ? `Choose up to ${max}` : "Choose one or more"}</span>
          {selected.length > 0 && <button onClick={() => onChange([])} className="font-semibold text-primary-dark">Clear</button>}
        </div>
      </div>
    </details>
  );
}

function comparisonDefaultGroups(groups: ComparisonGroup[]) {
  const reporting = groups.filter((group) => group.type === "reporting_group").slice(0, 2);
  const company = groups.find((group) => group.type === "company");
  if (reporting.length) return [...reporting, ...(company ? [company] : [])].map((group) => group.id).slice(0, 3);

  const selected = groups.find((group) => group.type === "selected");
  const departments = groups.filter((group) => group.type === "department" || group.type === "combined").slice(0, 2);
  return [...(selected ? [selected] : []), ...(company ? [company] : []), ...departments]
    .map((group) => group.id)
    .filter((id, index, values) => values.indexOf(id) === index)
    .slice(0, 3);
}

function comparisonScore(group: ComparisonGroup, metric: ComparisonQuestion) {
  if (metric.id === "overall") {
    return {
      average: group.averageRating,
      scaleMax: 5,
      favorablePercent: group.favorablePercent,
      responses: group.suppressed ? null : group.completions,
      isEnps: false,
    };
  }
  const question = group.questions.find((item) => item.id === metric.id);
  return {
    average: question?.average ?? null,
    scaleMax: question?.scaleMax ?? metric.scaleMax,
    favorablePercent: question?.favorablePercent ?? null,
    responses: question?.responses ?? null,
    isEnps: metric.isEnps,
  };
}

function comparisonTypeLabel(type: ComparisonGroup["type"]) {
  if (type === "company") return "Company benchmark";
  if (type === "selected") return "Current view";
  if (type === "reporting_group") return "Reporting organisation";
  if (type === "combined") return "Combined department";
  return "Department by site";
}

function HierarchyView({ rows }: { rows: HierarchyRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"alpha" | "participation-high" | "participation-low" | "rating-high" | "rating-low">("alpha");
  const sorted = useMemo(() => {
    const filtered = rows.filter((row) => row.label.toLowerCase().includes(query.toLowerCase()));
    return filtered.sort((left, right) => {
      if (sort === "participation-high") return right.participationRate - left.participationRate;
      if (sort === "participation-low") return left.participationRate - right.participationRate;
      if (sort === "rating-high") return (right.averageRating ?? -1) - (left.averageRating ?? -1);
      if (sort === "rating-low") return (left.averageRating ?? 99) - (right.averageRating ?? 99);
      return left.label.localeCompare(right.label);
    });
  }, [query, rows, sort]);

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading title="Department by site" detail="Combined Production totals appear first, followed by authorised department and location results." />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Search department or site" />
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-auto">
            <option value="alpha">Alphabetical</option>
            <option value="participation-high">Participation: high to low</option>
            <option value="participation-low">Participation: low to high</option>
            <option value="rating-high">Rating: high to low</option>
            <option value="rating-low">Rating: low to high</option>
          </select>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto border-y border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Department / site</th>
              <th className="px-4 py-3 font-semibold">Eligible employees</th>
              <th className="px-4 py-3 font-semibold">Completed surveys</th>
              <th className="px-4 py-3 font-semibold">Participation</th>
              <th className="px-4 py-3 font-semibold">Average (out of 5)</th>
              <th className="px-4 py-3 font-semibold">Favourable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => (
              <tr key={row.id} className={row.type === "combined" ? "bg-teal-50/50" : "hover:bg-slate-50"}>
                <td className="px-4 py-3.5 font-semibold text-slate-900">{row.label}{row.type === "combined" && <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] uppercase text-teal-800">Combined</span>}</td>
                <td className="px-4 py-3.5 text-slate-600">{row.eligibleEmployees}</td>
                <td className="px-4 py-3.5 font-medium text-slate-700">{row.completions}/{row.eligibleEmployees}</td>
                <td className="px-4 py-3.5"><Progress value={row.participationRate} label={`${row.participationRate}%`} /></td>
                <td className={`px-4 py-3.5 font-bold ${scoreText(row.averageRating)}`}>{row.averageRating === null ? <ProtectedInline /> : `${row.averageRating} / 5`}</td>
                <td className="px-4 py-3.5 text-slate-700">{row.favorablePercent === null ? "N/A" : `${row.favorablePercent}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <div className="p-8 text-center text-sm text-slate-500">No department or site matches this search.</div>}
      </div>
    </section>
  );
}

function QuestionsView({ questions, suppressed }: { questions: QuestionResult[]; suppressed: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"order" | "high" | "low">("order");
  const visible = useMemo(() => {
    return questions
      .filter((question) => question.question.toLowerCase().includes(query.toLowerCase()))
      .sort((left, right) => sort === "high" ? (right.average ?? -1) - (left.average ?? -1) : sort === "low" ? (left.average ?? 99) - (right.average ?? 99) : left.order - right.order);
  }, [query, questions, sort]);

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading title="Question-level scores" detail="Every rating question shows its average, response count, and distribution of favourable responses." />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput value={query} onChange={setQuery} placeholder="Search questions" />
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-auto">
            <option value="order">Survey order</option>
            <option value="high">Score: high to low</option>
            <option value="low">Score: low to high</option>
          </select>
        </div>
      </div>
      {suppressed ? <div className="mt-4"><ProtectedPanel /></div> : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {visible.map((question) => (
            <article key={question.id} className="border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase text-primary-dark">{question.section || "General"} · Question {question.order}</div>
                  <h3 className="mt-1 font-semibold leading-6 text-slate-950">{question.question}</h3>
                </div>
                <div className={`shrink-0 text-right text-xl font-bold ${scoreText(question.isEnps ? null : question.average)}`}>
                  {question.average} <span className="text-sm font-medium text-slate-400">/ {question.scaleMax}</span>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                {question.isEnps ? (
                  <div className="h-full bg-blue-500" style={{ width: `${((question.average || 0) / question.scaleMax) * 100}%` }} />
                ) : (
                  <div className="flex h-full">
                    <div className="bg-emerald-500" style={{ width: `${question.favorablePercent || 0}%` }} />
                    <div className="bg-amber-400" style={{ width: `${question.neutralPercent || 0}%` }} />
                    <div className="bg-red-500" style={{ width: `${question.unfavorablePercent || 0}%` }} />
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {question.isEnps ? <span>Average rating, separate from company-wide eNPS</span> : <><span className="text-emerald-700">{question.favorablePercent}% favourable</span><span>{question.neutralPercent}% neutral</span><span className="text-red-700">{question.unfavorablePercent}% unfavourable</span></>}
                <span className="ml-auto">{question.responses} responses</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CommentsView({ data, surveyId, onRefresh }: { data: ResultsData; surveyId: string; onRefresh: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [severity, setSeverity] = useState("");
  const [busyId, setBusyId] = useState("");
  const departments = [...new Set(data.comments.map((comment) => comment.department))].sort();
  const comments = data.comments.filter((comment) => {
    if (department && comment.department !== department) return false;
    if (severity && comment.severity !== severity) return false;
    if (query && !`${comment.text} ${comment.question}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const review = async (id: string, status: string) => {
    setBusyId(id);
    await fetch(`/api/results/${surveyId}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerIds: [id], status }),
    });
    await onRefresh();
    setBusyId("");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.95fr]">
        <section>
          <SectionHeading title="Sentiment" detail="AI analysis of written comments in this reportable scope." />
          <SentimentPanel sentiment={data.sentiment} />
        </section>
        <section>
          <SectionHeading title="Themes ranked for attention" detail="Severity takes priority, followed by how often the theme appears. A theme may appear even when mentioned once." />
          <ThemePanel themes={data.themes} />
        </section>
      </div>

      <section>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeading title="Anonymous comments" detail={commentAccessText(data)} />
          <div className="flex flex-wrap gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search comments" />
            <select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
              <option value="">All departments</option>
              {departments.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
              <option value="">All severity levels</option>
              {['critical', 'high', 'needs_review', 'medium', 'low', 'pending'].map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {comments.map((comment) => (
            <article key={comment.id || `${comment.submittedAt}-${comment.text.slice(0, 20)}`} className="border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-900">{comment.department}</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">{comment.location}</span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${severityBadge(comment.severity)}`}>{labelize(comment.severity)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{labelize(comment.sentiment)}</span>
                {comment.status && <span className={`rounded-full px-2 py-0.5 font-semibold ${statusBadge(comment.status)}`}>{labelize(comment.status)}</span>}
              </div>
              <p className="mt-3 text-[15px] leading-6 text-slate-800">{comment.text}</p>
              <p className="mt-2 text-xs text-slate-500">In response to: {comment.question}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {comment.themes.map((theme) => <span key={theme} className="rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">{theme}</span>)}
                {data.access.canManage && comment.id && (
                  <div className="ml-auto flex gap-2">
                    <button disabled={busyId === comment.id} onClick={() => review(comment.id!, "approved")} className="flex items-center gap-1.5 rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button>
                    <button disabled={busyId === comment.id} onClick={() => review(comment.id!, "withheld")} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><EyeOff className="h-3.5 w-3.5" />Withhold</button>
                  </div>
                )}
              </div>
            </article>
          ))}
          {!comments.length && <div className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No authorised comments match these filters.</div>}
        </div>
      </section>
    </div>
  );
}

function SentimentPanel({ sentiment }: { sentiment: ResultsData["sentiment"] }) {
  const rows = [
    ["Positive", sentiment?.positive || 0, "bg-emerald-500"],
    ["Neutral", sentiment?.neutral || 0, "bg-blue-500"],
    ["Mixed", sentiment?.mixed || 0, "bg-amber-400"],
    ["Negative", sentiment?.negative || 0, "bg-red-500"],
  ];
  return (
    <div className="mt-3 border border-slate-200 bg-white p-4">
      <div className="flex h-4 overflow-hidden rounded-sm bg-slate-100">
        {rows.map(([label, count, colour]) => (
          <div key={String(label)} className={String(colour)} style={{ width: `${sentiment?.total ? (Number(count) / sentiment.total) * 100 : 0}%` }} title={`${label}: ${count}`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {rows.map(([label, count, colour]) => (
          <div key={String(label)} className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${colour}`} />
            <span className="text-slate-600">{label}</span>
            <strong className="ml-auto text-slate-900">{count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemePanel({ themes }: { themes: ResultsData["themes"] }) {
  const max = Math.max(1, ...themes.map((theme) => theme.mentions));
  return (
    <div className="mt-3 border border-slate-200 bg-white p-4">
      <div className="space-y-3">
        {themes.slice(0, 10).map((theme, index) => (
          <div key={theme.theme} className="grid grid-cols-[24px_minmax(0,1fr)_36px] items-center gap-2 text-sm sm:grid-cols-[28px_minmax(130px,1fr)_minmax(120px,2fr)_42px]">
            <span className="font-bold text-slate-400">{index + 1}</span>
            <span className="font-medium text-slate-800">{theme.theme}</span>
            <div className="hidden h-2 overflow-hidden rounded-full bg-slate-100 sm:block"><div className={`h-full ${theme.critical || theme.high ? "bg-red-500" : "bg-primary"}`} style={{ width: `${(theme.mentions / max) * 100}%` }} /></div>
            <span className="text-right font-semibold text-slate-700">{theme.mentions}</span>
          </div>
        ))}
        {!themes.length && <div className="py-5 text-center text-sm text-slate-500">No analysed themes are available for this view.</div>}
      </div>
    </div>
  );
}

function ReleaseCentre({ surveyId, release, targetRelease, targetEmail, targetName, onChanged }: {
  surveyId: string;
  release: ReleaseState;
  targetRelease: ReleaseState | null;
  targetEmail: string;
  targetName: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const change = async (kind: "results" | "insights" | "comments", released: boolean) => {
    setBusy(kind);
    setReleaseError("");
    const response = await fetch(`/api/results/${surveyId}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, released }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setReleaseError(payload.error || "Unable to change the release status.");
      setBusy("");
      return;
    }
    await onChanged();
    setBusy("");
  };
  const changeManagerAccess = async (released: boolean) => {
    setBusy("manager-test");
    setReleaseError("");
    const response = await fetch(`/api/results/${surveyId}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "all", released, leaderEmail: targetEmail }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setReleaseError(payload.error || "Unable to change manager test access.");
      setBusy("");
      return;
    }
    await onChanged();
    setBusy("");
  };
  const rows = [
    ["results", "Numerical results", "Scores, participation, benchmarks, and themes", release.resultsReleasedAt],
    ["insights", "AI-assisted insights", "HR-reviewed highlights and areas to watch", release.insightsReleasedAt],
    ["comments", "Approved comments", "Only comments marked approved by HR", release.commentsReleasedAt],
  ] as const;
  const allGloballyReleased = Boolean(
    release.resultsReleasedAt &&
      release.insightsReleasedAt &&
      release.commentsReleasedAt
  );
  return (
    <details className="group border border-slate-300 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
        <ShieldCheck className="h-5 w-5 text-primary-dark" />
        <div className="min-w-0 flex-1"><div className="font-semibold text-slate-950">HR release centre</div><div className="text-xs text-slate-500">Review and publish each result layer separately.</div></div>
        <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200">
        {releaseError && <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{releaseError}</div>}
        {targetEmail && (
          <div className="border-b border-blue-200 bg-blue-50 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-950">
                  <ShieldCheck className="h-4 w-4" />
                  Manager test release
                </div>
                <p className="mt-1 text-sm text-blue-900">
                  Release numerical results, approved insights, and approved comments to {targetName || "the selected manager"} only. This does not publish results to any other leader.
                </p>
                <p className="mt-1 text-xs text-blue-800">
                  Access is limited to their BambooHR reporting hierarchy. The minimum of three completions remains enforced, downloads are disabled, and revocation blocks all current and legacy result views.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-xs font-semibold ${targetRelease?.resultsReleasedAt ? "text-emerald-700" : "text-amber-700"}`}>
                  {targetRelease?.resultsReleasedAt ? "Test access active" : "Not released"}
                </span>
                <button
                  disabled={busy === "manager-test" || allGloballyReleased}
                  onClick={() => changeManagerAccess(!targetRelease?.resultsReleasedAt)}
                  className={`h-9 rounded-md px-3 text-sm font-semibold ${targetRelease?.resultsReleasedAt ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-blue-700 text-white hover:bg-blue-800"} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {targetRelease?.resultsReleasedAt ? "Revoke test access" : "Release everything to this manager"}
                </button>
              </div>
            </div>
            {allGloballyReleased && <p className="mt-2 text-xs text-blue-800">All result layers are already released globally, so separate test access is not required.</p>}
          </div>
        )}
        {rows.map(([kind, label, detail, timestamp]) => (
          <div key={kind} className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center">
            <div className="flex-1"><div className="text-sm font-semibold text-slate-900">{label}</div><div className="text-xs text-slate-500">{detail}</div></div>
            <div className={`text-xs font-semibold ${timestamp ? "text-emerald-700" : "text-amber-700"}`}>{timestamp ? `Released ${formatDateTime(timestamp)}` : "Not released"}</div>
            <button disabled={busy === kind} onClick={() => change(kind, !timestamp)} className={`h-9 min-w-24 rounded-md px-3 text-sm font-semibold ${timestamp ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-primary text-white hover:bg-primary-dark"} disabled:opacity-50`}>{timestamp ? "Revoke" : "Release"}</button>
          </div>
        ))}
      </div>
    </details>
  );
}

function ExportMenu({ surveyId, queryString, disabled }: { surveyId: string; queryString: string; disabled: boolean }) {
  const download = (format: string) => {
    window.location.href = `/api/results/${surveyId}/export?${queryString}&format=${format}`;
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={disabled} onClick={() => download("xlsx")} title="Download Excel workbook" className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Excel</button>
      <button disabled={disabled} onClick={() => download("pptx")} title="Download PowerPoint" className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Presentation className="h-4 w-4 text-amber-600" />PowerPoint</button>
      <button disabled={disabled} onClick={() => download("pdf")} title="Download PDF" className="flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><FileText className="h-4 w-4" />PDF</button>
    </div>
  );
}

function FilterMenu({ icon: Icon, label, options, selected, onChange }: { icon: typeof Filter; label: string; options: Array<{ value: string; label: string }>; selected: string[]; onChange: (selected: string[]) => void }) {
  return (
    <details className="group relative">
      <summary className={`flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm font-medium ${selected.length ? "border-primary bg-teal-50 text-primary-dark" : "border-slate-300 bg-white text-slate-700"}`}>
        <Icon className="h-4 w-4" />
        {label}{selected.length ? ` (${selected.length})` : ""}
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-72 min-w-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-xl">
        {options.length ? options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((value) => value !== option.value) : [...selected, option.value])} className="h-4 w-4 accent-teal-600" />
              <span className="min-w-0 flex-1 text-slate-700">{option.label}</span>
            </label>
          );
        }) : <div className="px-2 py-4 text-center text-xs text-slate-500">No options in this scope.</div>}
        {selected.length > 0 && <button onClick={() => onChange([])} className="mt-1 w-full border-t border-slate-100 px-2 py-2 text-left text-xs font-semibold text-primary-dark">Clear {label.toLowerCase()}</button>}
      </div>
    </details>
  );
}

function LockedResults({ data }: { data: LockedData }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center border-y border-slate-200 bg-white p-8 text-center">
      <div className="max-w-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500"><LockKeyhole className="h-7 w-7" /></div>
        <h2 className="mt-5 text-xl font-bold text-slate-950">Results are awaiting HR release</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">The survey is closed, but numerical results have not been released to this reporting hierarchy yet. Scores remain anonymous and appear only for groups with {data.anonymityThreshold} or more completions.</p>
      </div>
    </div>
  );
}

function PrivacyBadge({ suppressed, threshold }: { suppressed: boolean; threshold: number }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${suppressed ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
      {suppressed ? <LockKeyhole className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {suppressed ? `Protected: fewer than ${threshold} completions` : `Minimum of ${threshold} completions met`}
    </div>
  );
}

function ProtectedPanel() {
  return <div className="flex min-h-28 items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500"><LockKeyhole className="mr-2 h-4 w-4 shrink-0" />Scores appear after at least three employees have completed the survey in the selected scope.</div>;
}

function ProtectedInline() {
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />Protected</span>;
}

function Progress({ value, label }: { value: number; label: string }) {
  return <div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div><span className="font-medium text-slate-700">{label}</span></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const compact = value.length > 7;
  return <div className="min-w-0"><div title={value} className={`${compact ? "text-base" : "text-lg"} break-words font-bold leading-tight text-slate-950`}>{value}</div><div className="mt-1 break-words text-[11px] leading-4 text-slate-500">{label}</div></div>;
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return <div><h2 className="text-lg font-bold text-slate-950">{title}</h2>{detail && <p className="mt-0.5 text-sm text-slate-500">{detail}</p>}</div>;
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="relative block w-full sm:w-56"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>;
}

function IconButton({ title, onClick, icon: Icon, active }: { title: string; onClick: () => void; icon: typeof Pencil; active?: boolean }) {
  return <button title={title} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-md border ${active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Icon className="h-4 w-4" /></button>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof BarChart3; title: string; detail: string }) {
  return <div className="flex min-h-[520px] items-center justify-center text-center"><div className="max-w-md"><Icon className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-bold text-slate-950">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></div></div>;
}

function ResultsLoading() {
  return <div className="mx-auto max-w-[1600px] animate-pulse space-y-5"><div className="h-9 w-44 rounded bg-slate-200" /><div className="h-24 bg-white" /><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-32 bg-white" />)}</div><div className="h-80 bg-white" /></div>;
}

function buildQuery(filters: ActiveFilters) {
  const params = new URLSearchParams();
  if (filters.scope) params.set("scope", filters.scope);
  filters.departments.forEach((value) => params.append("department", value));
  filters.locations.forEach((value) => params.append("location", value));
  filters.divisions.forEach((value) => params.append("division", value));
  filters.teams.forEach((value) => params.append("team", value));
  if (filters.viewAs) params.set("viewAs", filters.viewAs);
  return params.toString();
}

function activeFilterCount(filters: ActiveFilters) {
  return filters.departments.length + filters.locations.length + filters.divisions.length + filters.teams.length;
}

function displayPercent(value: number | null) {
  return value === null ? "N/A" : `${value}%`;
}

function scoreText(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value >= 4.2) return "text-emerald-600";
  if (value >= 3.5) return "text-amber-600";
  return "text-red-600";
}

function enpsTone(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value >= 70) return "text-emerald-600";
  if (value >= 30) return "text-sky-600";
  if (value >= 0) return "text-amber-600";
  return "text-red-600";
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function insightDot(severity: string) {
  if (severity === "critical" || severity === "high") return "bg-red-500";
  if (severity === "positive") return "bg-emerald-500";
  return "bg-amber-400";
}

function severityBadge(severity: string) {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "high") return "bg-orange-100 text-orange-800";
  if (severity === "needs_review") return "bg-violet-100 text-violet-800";
  if (severity === "medium") return "bg-amber-100 text-amber-800";
  if (severity === "low") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-600";
}

function statusBadge(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "withheld" || status === "hidden") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Toronto" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }).format(new Date(value));
}

function commentAccessText(data: ResultsData) {
  if (data.commentAccess.mode === "review") return `${data.commentAccess.totalInScope ?? 0} comments in scope. Approve or withhold comments before releasing them to managers.`;
  if (data.commentAccess.mode === "all") return "Full anonymous comments are available for C-suite review.";
  return data.commentAccess.released ? "Only comments approved and released by HR are shown." : "HR has not released approved comments yet.";
}
