"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";

interface Survey {
  id: string;
  title: string;
  status: string;
  frequency: string | null;
  startDate: string;
  endDate: string;
  _count: { responses: number; completions: number };
}

export default function ManageSurveysPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchSurveys() {
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((d) => setSurveys(d.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchSurveys();
  }, []);

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchSurveys();
  }

  async function deleteSurvey(id: string) {
    if (!confirm("Delete this survey?")) return;
    await fetch(`/api/surveys/${id}`, { method: "DELETE" });
    fetchSurveys();
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Manage Surveys</h1>
        <div className="bg-white rounded-xl border p-6 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-full mb-4" />
          <div className="h-4 bg-slate-100 rounded w-full mb-4" />
          <div className="h-4 bg-slate-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Manage Surveys</h1>
        <Link
          href="/admin/surveys/new"
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
        >
          + New Survey
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Survey</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600 hidden md:table-cell">Dates</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600 hidden sm:table-cell">Responses</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {surveys.map((survey) => (
              <tr key={survey.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-slate-900">{survey.title}</p>
                  {survey.frequency && (
                    <p className="text-xs text-slate-400 capitalize">{survey.frequency}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      survey.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : survey.status === "closed"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {survey.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 hidden md:table-cell">
                  {formatDate(survey.startDate)} - {formatDate(survey.endDate)}
                </td>
                <td className="px-6 py-4 text-slate-500 hidden sm:table-cell">
                  {survey._count.responses}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {survey.status === "draft" && (
                      <button
                        onClick={() => updateStatus(survey.id, "active")}
                        className="px-3 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100"
                      >
                        Activate
                      </button>
                    )}
                    {survey.status === "active" && (
                      <button
                        onClick={() => updateStatus(survey.id, "closed")}
                        className="px-3 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/surveys/${survey.id}/results`)}
                      className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                    >
                      Results
                    </button>
                    {survey.status === "draft" && (
                      <button
                        onClick={() => deleteSurvey(survey.id)}
                        className="px-3 py-1 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {surveys.length === 0 && (
          <div className="p-12 text-center text-slate-400">No surveys yet.</div>
        )}
      </div>
    </div>
  );
}
