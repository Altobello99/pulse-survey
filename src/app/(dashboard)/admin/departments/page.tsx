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
  participationRate: number;
  avgRating: number;
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
      <h1 className="text-2xl font-bold text-slate-900">Department Comparison</h1>

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
                <Bar dataKey="avgRating" name="Avg Rating" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Department</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Employees</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Participation</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Avg Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((dept) => (
              <tr key={dept.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 font-medium text-slate-900">{dept.name}</td>
                <td className="px-6 py-4 text-slate-600">{dept.employeeCount}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${dept.participationRate}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-600">{dept.participationRate}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`font-semibold ${dept.avgRating >= 4 ? "text-emerald-600" : dept.avgRating >= 3 ? "text-amber-600" : "text-red-600"}`}>
                    {dept.avgRating || "N/A"}
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
