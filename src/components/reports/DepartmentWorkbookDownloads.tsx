"use client";

import { useEffect, useState } from "react";

type DepartmentOption = {
  id: string;
  name: string;
  employeeCount: number;
  completions: number;
};

export function DepartmentWorkbookDownloads({ surveyId }: { surveyId: string }) {
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/surveys/${surveyId}/department-workbooks?mode=options`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load departments");
        return response.json();
      })
      .then((payload) => {
        const options = (payload.data?.departments || []) as DepartmentOption[];
        setDepartments(options);
        setDepartmentId((current) => current || options[0]?.id || "");
      })
      .catch((requestError) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError("Department workbook options could not load.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [surveyId]);

  const base = `/api/surveys/${surveyId}/department-workbooks`;

  return (
    <div className="border-b border-slate-200 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-slate-900">Department Workbook Packages</h3>
        <p className="text-sm text-slate-500">
          Generate the styled master workbook or isolated leader files. Department files contain no written comments or other departments.
        </p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,1.35fr)_minmax(0,1fr)] xl:items-end">
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">All departments in one workbook</p>
          <a
            href={`${base}?mode=master`}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            Download Master Workbook
          </a>
        </div>

        <div>
          <label htmlFor={`department-workbook-${surveyId}`} className="mb-2 block text-xs font-medium text-slate-600">
            One department workbook
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id={`department-workbook-${surveyId}`}
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={loading || departments.length === 0}
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100"
            >
              {loading && <option>Loading departments...</option>}
              {!loading && departments.length === 0 && <option>No eligible departments</option>}
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name} ({department.completions}/{department.employeeCount} completed)
                </option>
              ))}
            </select>
            <a
              href={departmentId ? `${base}?mode=department&departmentId=${encodeURIComponent(departmentId)}` : undefined}
              aria-disabled={!departmentId}
              className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition ${
                departmentId
                  ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                  : "pointer-events-none border-slate-200 text-slate-400"
              }`}
            >
              Download Department
            </a>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Every department as a separate file</p>
          <a
            href={`${base}?mode=all-departments`}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Download All Departments (ZIP)
          </a>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
