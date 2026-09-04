"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { COLORS } from "@/lib/constants";

interface DeptData {
  id: string;
  name: string;
  employeeCount: number;
  completions: number;
  participationRate: number;
  avgRating: number | null;
  ratingScaleMax: number;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<DeptData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/departments")
      .then((r) => r.json())
      .then((d) => setDepartments(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Departments</h1>
        <div className="animate-pulse space-y-4">
          <div className="bg-white rounded-xl border p-6 h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Department Comparison</h1>
        <p className="mt-1 text-sm text-slate-500">
          Average ratings use the current survey&apos;s standard 1-5 questions. The 0-10 recommendation question is reported separately as eNPS.
        </p>
      </div>

      {departments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Overview</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departments}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="participationRate" name="Participation %" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgRating" name="Avg Rating (out of 5)" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Department</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Employees</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Participation</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Avg Rating (out of 5)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((dept) => (
              <tr key={dept.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 font-medium text-slate-900">{dept.name}</td>
                <td className="px-6 py-4 text-slate-600">{dept.employeeCount}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-label={`${dept.name} participation`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={dept.participationRate}
                    >
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${dept.participationRate}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-600">{dept.participationRate}%</span>
                  </div>
                  <p className="mt-1 whitespace-nowrap text-xs font-medium text-slate-500">
                    {dept.completions}/{dept.employeeCount} completed
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span className={`font-semibold ${dept.avgRating === null ? "text-slate-400" : dept.avgRating >= 4 ? "text-emerald-600" : dept.avgRating >= 3 ? "text-amber-600" : "text-red-600"}`}>
                    {dept.avgRating === null ? "N/A" : `${dept.avgRating.toFixed(1)} / ${dept.ratingScaleMax}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {departments.length === 0 && (
          <div className="p-12 text-center text-slate-400">No department data yet.</div>
        )}
      </div>
    </div>
  );
}
