"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { REPORT_DOWNLOADS } from "@/lib/report-downloads";
import { formatDate } from "@/lib/utils";

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startDate: string;
  endDate: string;
  _count: { responses: number; completions: number };
}

export default function AdminReportsPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/surveys")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load surveys");
        return response.json();
      })
      .then((data) => setSurveys(data.data || []))
      .catch(() => setError("Reports could not load. Please refresh and try again."))
      .finally(() => setLoading(false));
  }, []);

  const openSurveys = useMemo(() => {
    const now = new Date();
    return surveys.filter(
      (survey) =>
        survey.status === "active" &&
        new Date(survey.startDate) <= now &&
        new Date(survey.endDate) >= now
    );
  }, [surveys]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Admin-only report downloads</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-slate-100 rounded w-full mb-3" />
          <div className="h-4 bg-slate-100 rounded w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Admin-only XLSX and CSV downloads for the current open survey.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-blue-800">
          Downloads are restricted to admins. Employee identities are used only for completion tracking and duplicate prevention; survey answers remain anonymous.
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && openSurveys.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No open survey reports</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reports appear here when a survey is active and within its start and end dates.
          </p>
          <Link
            href="/admin/surveys"
            className="mt-4 inline-flex px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition"
          >
            Manage Surveys
          </Link>
        </div>
      )}

      {openSurveys.map((survey) => (
        <section key={survey.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 p-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{survey.title}</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Open
                </span>
              </div>
              {survey.description && (
                <p className="mt-1 text-sm text-slate-500">{survey.description}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {formatDate(survey.startDate)} - {formatDate(survey.endDate)} &middot;{" "}
                {survey._count.responses} responses &middot; {survey._count.completions} completions
              </p>
            </div>
            <Link
              href={`/surveys/${survey.id}/results`}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              View Results
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {REPORT_DOWNLOADS.map((report) => (
              <div key={report.type} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium text-slate-900">{report.label}</h3>
                    <p className="text-sm text-slate-500">{report.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <a
                      href={reportHref(survey.id, report.type, "xlsx")}
                      className="px-3 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition"
                    >
                      XLSX
                    </a>
                    <a
                      href={reportHref(survey.id, report.type, "csv")}
                      className="px-3 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition"
                    >
                      CSV
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function reportHref(surveyId: string, reportType: string, format: "xlsx" | "csv") {
  const params = new URLSearchParams({ format, scope: "company" });
  return `/api/surveys/${surveyId}/reports/${reportType}?${params.toString()}`;
}
