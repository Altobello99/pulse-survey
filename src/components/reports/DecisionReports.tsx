"use client";

import { useEffect, useMemo, useState } from "react";

type ReportMetrics = {
  employeeCount: number;
  completions: number;
  responses: number;
  participationRate: number;
  averageRating: number | null;
  ratingScaleMax: 5;
  suppressed: boolean;
  enpsScore: number | null;
  enpsResponses: number;
  enpsPromoters: number;
  enpsPassives: number;
  enpsDetractors: number;
  enpsPromotersPercent: number | null;
  enpsPassivesPercent: number | null;
  enpsDetractorsPercent: number | null;
  enpsSuppressed: boolean;
};

type DepartmentSiteRow = ReportMetrics & {
  id: string;
  groupType: "production" | "department";
  departmentName: string;
  site: string;
  siteLabel: string;
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
  suppressed: boolean;
  isEnps: boolean;
  enpsScore: number | null;
};

type LeaderRow = ReportMetrics & {
  id: string;
  name: string;
  email: string | null;
  questionAverages: QuestionAverage[];
};

type DepartmentEnpsRow = ReportMetrics & {
  id: string;
  departmentName: string;
  sites: string[];
};

type LeaderEnpsRow = ReportMetrics & {
  id: string;
  name: string;
  email: string;
  departments: string[];
  sites: string[];
};

type ReportData = {
  generatedAt: string;
  anonymityThreshold: number;
  company: ReportMetrics;
  departmentSites: DepartmentSiteRow[];
  leaders: LeaderRow[];
  enpsDepartments: DepartmentEnpsRow[];
  enpsLeaders: LeaderEnpsRow[];
  questionAverages: QuestionAverage[];
};

type ReportTab =
  | "department-site"
  | "leader-breakdown"
  | "enps-breakdown"
  | "company-question-averages";

const tabs: Array<{ id: ReportTab; label: string }> = [
  { id: "department-site", label: "Department by Site" },
  { id: "leader-breakdown", label: "By Leader" },
  { id: "enps-breakdown", label: "eNPS Breakdown" },
  { id: "company-question-averages", label: "Question Averages" },
];

export function DecisionReports({ surveyId }: { surveyId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ReportTab>("department-site");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/surveys/${surveyId}/report-overview`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load report views");
        return response.json();
      })
      .then((payload) => setData(payload.data))
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("The report views could not load. Please refresh and try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [surveyId]);

  if (loading) {
    return (
      <div className="p-5" aria-busy="true">
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-5 h-48 w-full animate-pulse rounded-lg bg-slate-50" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-5 text-sm text-red-700">{error || "No report data is available."}</div>;
  }

  return (
    <div>
      <div className="border-b border-slate-200 px-5 pt-5">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">Quick Answer Reports</h3>
          <p className="mt-1 text-sm text-slate-500">
            Business-wide views built from BambooHR demographics and anonymous survey results.
          </p>
        </div>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Quick answer reports">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {activeTab === "department-site" && (
          <DepartmentSiteReport surveyId={surveyId} rows={data.departmentSites} />
        )}
        {activeTab === "leader-breakdown" && (
          <LeaderReport surveyId={surveyId} rows={data.leaders} />
        )}
        {activeTab === "enps-breakdown" && (
          <EnpsBreakdownReport
            surveyId={surveyId}
            company={data.company}
            departments={data.enpsDepartments}
            leaders={data.enpsLeaders}
          />
        )}
        {activeTab === "company-question-averages" && (
          <QuestionAverageReport surveyId={surveyId} rows={data.questionAverages} />
        )}
        <p className="mt-4 text-xs text-slate-500">
          Ratings are hidden for groups with fewer than {data.anonymityThreshold} completed surveys.
          Participation counts remain available for completion tracking.
        </p>
      </div>
    </div>
  );
}

function DepartmentSiteReport({ surveyId, rows }: { surveyId: string; rows: DepartmentSiteRow[] }) {
  const [groupType, setGroupType] = useState<"production" | "department" | "all">("production");
  const [site, setSite] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("site-asc");
  const sites = useMemo(
    () => [...new Set(rows.map((row) => row.site))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => groupType === "all" || row.groupType === groupType)
      .filter((row) => !site || row.site === site)
      .filter(
        (row) =>
          !query ||
          row.departmentName.toLowerCase().includes(query) ||
          row.site.toLowerCase().includes(query) ||
          row.siteLabel.toLowerCase().includes(query)
      )
      .sort((left, right) => sortReportRows(left, right, sort));
  }, [groupType, rows, search, site, sort]);

  return (
    <div>
      <ReportHeading
        title="Department by Site"
        description="Production totals by site use the eligible survey-opening roster. Switch to individual departments for combinations such as Inspection at Wolfedale versus Goldthorne."
        surveyId={surveyId}
        reportType="department-site"
      />
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FilterSelect label="View" value={groupType} onChange={(value) => setGroupType(value as typeof groupType)}>
          <option value="production">Production totals</option>
          <option value="department">Individual departments</option>
          <option value="all">All groupings</option>
        </FilterSelect>
        <FilterSelect label="Site" value={site} onChange={setSite}>
          <option value="">All sites</option>
          {sites.map((option) => <option key={option}>{option}</option>)}
        </FilterSelect>
        <FilterSelect label="Sort" value={sort} onChange={setSort}>
          <option value="site-asc">Site A-Z</option>
          <option value="name-asc">Department A-Z</option>
          <option value="participation-desc">Participation high-low</option>
          <option value="rating-desc">Rating high-low</option>
        </FilterSelect>
        <SearchField value={search} onChange={setSearch} placeholder="Search department or site" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Department / Group</th>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Eligible Employees</th>
              <th className="px-4 py-3 font-medium">Completed</th>
              <th className="px-4 py-3 font-medium">Participation</th>
              <th className="px-4 py-3 font-medium">Avg Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.departmentName}</td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="font-medium text-slate-800">{row.siteLabel}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{row.site}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.employeeCount}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.completions}/{row.employeeCount}
                </td>
                <td className="px-4 py-3 font-medium text-slate-700">{row.participationRate}%</td>
                <td className="px-4 py-3">{formatGroupRating(row)}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && <EmptyTableRow columns={6} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderReport({ surveyId, rows }: { surveyId: string; rows: LeaderRow[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [selectedLeaderId, setSelectedLeaderId] = useState(rows[0]?.id || "");
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          !query ||
          row.name.toLowerCase().includes(query) ||
          row.email?.toLowerCase().includes(query)
      )
      .sort((left, right) => sortReportRows(left, right, sort));
  }, [rows, search, sort]);
  const selectedLeader = rows.find((row) => row.id === selectedLeaderId) || rows[0];

  return (
    <div>
      <ReportHeading
        title="Breakdown by Leader"
        description="Direct-report groups follow the Reports To field in BambooHR and include only the eligible survey-opening roster. Select a leader below to see every scored question for that team."
        surveyId={surveyId}
        reportType="leader-breakdown"
      />
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search leader or email" />
        <FilterSelect label="Sort" value={sort} onChange={setSort}>
          <option value="name-asc">Leader A-Z</option>
          <option value="employees-desc">Team size high-low</option>
          <option value="participation-desc">Participation high-low</option>
          <option value="rating-desc">Rating high-low</option>
        </FilterSelect>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Leader</th>
              <th className="px-4 py-3 font-medium">Eligible Employees</th>
              <th className="px-4 py-3 font-medium">Completed</th>
              <th className="px-4 py-3 font-medium">Participation</th>
              <th className="px-4 py-3 font-medium">Responses</th>
              <th className="px-4 py-3 font-medium">Avg Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedLeaderId(row.id)}
                    className="text-left font-medium text-primary hover:underline"
                  >
                    {row.name}
                  </button>
                  {row.email && row.name !== row.email && (
                    <span className="mt-0.5 block text-xs text-slate-500">{row.email}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.employeeCount}</td>
                <td className="px-4 py-3 text-slate-600">{row.completions}/{row.employeeCount}</td>
                <td className="px-4 py-3 font-medium text-slate-700">{row.participationRate}%</td>
                <td className="px-4 py-3 text-slate-600">{row.responses}</td>
                <td className="px-4 py-3">{formatGroupRating(row)}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && <EmptyTableRow columns={6} />}
          </tbody>
        </table>
      </div>

      {selectedLeader && (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="font-semibold text-slate-900">Question Ratings for {selectedLeader.name}</h4>
              <p className="mt-1 text-sm text-slate-500">Actual average for each scored question in this leader group.</p>
            </div>
            <FilterSelect label="Leader" value={selectedLeader.id} onChange={setSelectedLeaderId} compact>
              {rows.map((leader) => <option key={leader.id} value={leader.id}>{leader.name}</option>)}
            </FilterSelect>
          </div>
          <QuestionAverageTable rows={selectedLeader.questionAverages} />
        </div>
      )}
    </div>
  );
}

type EnpsDisplayRow = ReportMetrics & {
  id: string;
  label: string;
  detail: string;
  email?: string;
};

function EnpsBreakdownReport({
  surveyId,
  company,
  departments,
  leaders,
}: {
  surveyId: string;
  company: ReportMetrics;
  departments: DepartmentEnpsRow[];
  leaders: LeaderEnpsRow[];
}) {
  const [view, setView] = useState<"department" | "leader">("department");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score-desc");
  const rows = useMemo<EnpsDisplayRow[]>(() => {
    const source: EnpsDisplayRow[] = view === "department"
      ? departments.map((row) => ({
          ...row,
          label: row.departmentName,
          detail: row.sites.join(", "),
        }))
      : leaders.map((row) => ({
          ...row,
          label: row.name,
          detail: `${formatGroupCount(row.departments.length, "Department")} · ${formatGroupCount(row.sites.length, "Location")}`,
          email: row.email,
        }));
    const query = search.trim().toLowerCase();
    return source
      .filter(
        (row) =>
          !query ||
          row.label.toLowerCase().includes(query) ||
          row.detail.toLowerCase().includes(query) ||
          row.email?.toLowerCase().includes(query)
      )
      .sort((left, right) => sortEnpsRows(left, right, sort));
  }, [departments, leaders, search, sort, view]);

  return (
    <div>
      <ReportHeading
        title="eNPS Breakdown"
        description="Audit Employee Net Promoter Score by department or by each leader's full reporting organisation. Scores use the frozen survey roster and the same 0-10 recommendation responses as Results."
        surveyId={surveyId}
        reportType="enps-breakdown"
      />

      <div className="mt-4 border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h5 className="font-semibold text-slate-900">Company-Wide eNPS</h5>
            <p className="text-xs text-slate-500">Reference score from all eligible survey responses</p>
          </div>
          <span className={`text-2xl font-bold ${enpsTone(company.enpsScore)}`}>
            {company.enpsSuppressed ? "Protected" : formatSigned(company.enpsScore)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-5">
          <EnpsSummaryMetric label="Responses" value={String(company.enpsResponses)} />
          <EnpsSummaryMetric
            label="Promoters (9-10)"
            value={formatEnpsCategory(company, company.enpsPromoters, company.enpsPromotersPercent)}
          />
          <EnpsSummaryMetric
            label="Passives (7-8)"
            value={formatEnpsCategory(company, company.enpsPassives, company.enpsPassivesPercent)}
          />
          <EnpsSummaryMetric
            label="Detractors (0-6)"
            value={formatEnpsCategory(company, company.enpsDetractors, company.enpsDetractorsPercent)}
          />
          <EnpsSummaryMetric
            label="Participation"
            value={`${company.completions}/${company.employeeCount} (${company.participationRate}%)`}
          />
        </div>
        {!company.enpsSuppressed && (
          <p className="mt-3 text-xs text-slate-600">
            ({company.enpsPromoters} Promoters - {company.enpsDetractors} Detractors) / {company.enpsResponses} Responses x 100 = {formatSigned(company.enpsScore)}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase text-slate-500">Group Results By</span>
          <div className="inline-flex border border-slate-300 bg-white p-1" aria-label="eNPS report view">
            <button
              type="button"
              onClick={() => setView("department")}
              className={`px-3 py-1.5 text-sm font-medium ${view === "department" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Department
            </button>
            <button
              type="button"
              onClick={() => setView("leader")}
              className={`px-3 py-1.5 text-sm font-medium ${view === "leader" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Leader
            </button>
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={view === "department" ? "Search department or site" : "Search leader or reporting group"}
          />
          <FilterSelect label="Sort" value={sort} onChange={setSort}>
            <option value="score-desc">eNPS: High to Low</option>
            <option value="score-asc">eNPS: Low to High</option>
            <option value="responses-desc">Responses: High to Low</option>
            <option value="participation-desc">Participation: High to Low</option>
            <option value="name-asc">Name A-Z</option>
          </FilterSelect>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border border-slate-200">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">{view === "department" ? "Department" : "Leader"}</th>
              <th className="px-4 py-3 font-medium">Eligible</th>
              <th className="px-4 py-3 font-medium">Completed</th>
              <th className="px-4 py-3 font-medium">eNPS Responses</th>
              <th className="px-4 py-3 font-medium">Promoters</th>
              <th className="px-4 py-3 font-medium">Passives</th>
              <th className="px-4 py-3 font-medium">Detractors</th>
              <th className="px-4 py-3 font-medium">eNPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="max-w-[300px] px-4 py-3">
                  <span className="font-medium text-slate-900">{row.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{row.detail || "Not Listed"}</span>
                  {row.email && row.email !== row.label && (
                    <span className="mt-0.5 block text-xs text-slate-400">{row.email}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.employeeCount}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.completions}/{row.employeeCount} ({row.participationRate}%)
                </td>
                <td className="px-4 py-3 text-slate-600">{row.enpsResponses}</td>
                <td className="px-4 py-3 text-slate-700">
                  {formatEnpsCategory(row, row.enpsPromoters, row.enpsPromotersPercent)}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {formatEnpsCategory(row, row.enpsPassives, row.enpsPassivesPercent)}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {formatEnpsCategory(row, row.enpsDetractors, row.enpsDetractorsPercent)}
                </td>
                <td className={`px-4 py-3 font-bold ${enpsTone(row.enpsScore)}`}>
                  {row.enpsSuppressed ? (
                    <span className="font-medium italic text-slate-400">Protected</span>
                  ) : (
                    formatSigned(row.enpsScore)
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyTableRow columns={8} />}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Leader rows include all eligible direct and indirect reports in that leader&apos;s frozen survey reporting organisation. Category counts and scores are protected unless there are at least three completed surveys and three eNPS responses.
      </p>
    </div>
  );
}

function EnpsSummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-white px-3 py-3">
      <span className="block text-xs text-slate-500">{label}</span>
      <span className="mt-1 block font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function QuestionAverageReport({ surveyId, rows }: { surveyId: string; rows: QuestionAverage[] }) {
  const [sort, setSort] = useState("question-asc");
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => sortQuestionRows(left, right, sort)),
    [rows, sort]
  );

  return (
    <div>
      <ReportHeading
        title="Company-Wide Question Averages"
        description="The actual mean score for every rating question. The recommendation question shows both its average out of 10 and the separately calculated eNPS."
        surveyId={surveyId}
        reportType="company-question-averages"
      />
      <div className="mt-4 max-w-xs">
        <FilterSelect label="Sort" value={sort} onChange={setSort}>
          <option value="question-asc">Survey order</option>
          <option value="rating-desc">Rating high-low</option>
          <option value="rating-asc">Rating low-high</option>
          <option value="responses-desc">Responses high-low</option>
        </FilterSelect>
      </div>
      <QuestionAverageTable rows={sortedRows} />
    </div>
  );
}

function QuestionAverageTable({ rows }: { rows: QuestionAverage[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[780px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="w-16 px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Question</th>
            <th className="px-4 py-3 font-medium">Responses</th>
            <th className="px-4 py-3 font-medium">Actual Average</th>
            <th className="px-4 py-3 font-medium">eNPS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium text-slate-500">{row.order + 1}</td>
              <td className="px-4 py-3 text-slate-900">
                <span className="font-medium">{row.question}</span>
                {row.section && <span className="mt-0.5 block text-xs text-slate-500">{row.section}</span>}
              </td>
              <td className="px-4 py-3 text-slate-600">{row.responses}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">
                {row.suppressed || row.average === null
                  ? "Protected: fewer than 3 completions"
                  : `${row.average.toFixed(1)} / ${row.scaleMax}`}
              </td>
              <td className="px-4 py-3">
                {row.isEnps && row.enpsScore !== null ? (
                  <span className="font-semibold text-primary">{formatSigned(row.enpsScore)}</span>
                ) : (
                  <span className="text-slate-400">N/A</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyTableRow columns={5} />}
        </tbody>
      </table>
    </div>
  );
}

function ReportHeading({
  title,
  description,
  surveyId,
  reportType,
}: {
  title: string;
  description: string;
  surveyId: string;
  reportType: ReportTab;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h4 className="text-base font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <a
          href={downloadHref(surveyId, reportType, "xlsx")}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition hover:bg-primary/90"
        >
          Download Excel
        </a>
        <a
          href={downloadHref(surveyId, reportType, "csv")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          CSV
        </a>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className={`block ${compact ? "min-w-64" : "w-full"}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {children}
      </select>
    </label>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block w-full">
      <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function EmptyTableRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-8 text-center text-sm text-slate-500">
        No rows match these filters.
      </td>
    </tr>
  );
}

function formatGroupRating(row: ReportMetrics) {
  if (row.suppressed || row.averageRating === null) {
    return <span className="text-xs italic text-slate-400">Protected: fewer than 3 completions</span>;
  }
  return <span className="font-semibold text-primary">{row.averageRating.toFixed(1)} / 5</span>;
}

function sortReportRows(left: ReportMetrics & { name?: string; departmentName?: string; siteLabel?: string }, right: ReportMetrics & { name?: string; departmentName?: string; siteLabel?: string }, sort: string) {
  if (sort === "employees-desc") return right.employeeCount - left.employeeCount;
  if (sort === "participation-desc") return right.participationRate - left.participationRate;
  if (sort === "rating-desc") return score(right.averageRating) - score(left.averageRating);
  if (sort === "name-asc") {
    return (left.name || left.departmentName || "").localeCompare(right.name || right.departmentName || "");
  }
  return (left.siteLabel || "").localeCompare(right.siteLabel || "") ||
    (left.departmentName || left.name || "").localeCompare(right.departmentName || right.name || "");
}

function sortQuestionRows(left: QuestionAverage, right: QuestionAverage, sort: string) {
  if (sort === "rating-desc") return score(right.average) - score(left.average);
  if (sort === "rating-asc") return score(left.average, Number.MAX_SAFE_INTEGER) - score(right.average, Number.MAX_SAFE_INTEGER);
  if (sort === "responses-desc") return right.responses - left.responses;
  return left.order - right.order;
}

function sortEnpsRows(left: EnpsDisplayRow, right: EnpsDisplayRow, sort: string) {
  if (sort === "score-desc") return score(right.enpsScore) - score(left.enpsScore);
  if (sort === "score-asc") {
    return score(left.enpsScore, Number.MAX_SAFE_INTEGER) - score(right.enpsScore, Number.MAX_SAFE_INTEGER);
  }
  if (sort === "responses-desc") return right.enpsResponses - left.enpsResponses;
  if (sort === "participation-desc") return right.participationRate - left.participationRate;
  return left.label.localeCompare(right.label);
}

function formatEnpsCategory(
  metrics: ReportMetrics,
  count: number,
  percent: number | null
) {
  if (metrics.enpsSuppressed) return "Protected";
  return `${count} (${percent ?? 0}%)`;
}

function formatGroupCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function enpsTone(value: number | null) {
  if (value === null) return "text-slate-400";
  if (value >= 30) return "text-emerald-700";
  if (value >= 0) return "text-amber-700";
  return "text-red-700";
}

function score(value: number | null, fallback = Number.MIN_SAFE_INTEGER) {
  return value ?? fallback;
}

function formatSigned(value: number | null) {
  if (value === null) return "N/A";
  return value > 0 ? `+${value}` : String(value);
}

function downloadHref(surveyId: string, reportType: ReportTab, format: "xlsx" | "csv") {
  const params = new URLSearchParams({ format, scope: "company" });
  return `/api/surveys/${surveyId}/reports/${reportType}?${params.toString()}`;
}
