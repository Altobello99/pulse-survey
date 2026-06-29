"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startDate: string;
  endDate: string;
  completed?: boolean;
  _count: { responses: number };
}

export default function SurveysPage() {
  const { data: session } = useSession();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((d) => setSurveys(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Surveys</h1>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-1/3 mb-3" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {session?.user.role === "employee" ? "Active Surveys" : "All Surveys"}
        </h1>
      </div>

      {session?.user.role === "employee" && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div className="text-sm text-emerald-800">
            <strong className="text-emerald-900">Your feedback is anonymous.</strong> Google sign-in confirms you are an active Clutch employee and prevents duplicate submissions. Answers are stored separately from login details, and results are reported only when at least 3 people respond.
          </div>
        </div>
      )}

      {surveys.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-slate-500">No surveys available right now.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {surveys.map((survey) => (
            <Link
              key={survey.id}
              href={
                survey.completed
                  ? "#"
                  : isClosed(survey) && session?.user.role === "employee"
                  ? `/surveys/${survey.id}`
                  : session?.user.role === "employee"
                  ? `/surveys/${survey.id}`
                  : `/surveys/${survey.id}/results`
              }
              className={`block bg-white rounded-xl border border-slate-200 p-6 hover:border-primary/30 hover:shadow-sm transition ${
                survey.completed ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {survey.title}
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        survey.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : survey.status === "closed"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {survey.status}
                    </span>
                    {survey.completed && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        Completed
                      </span>
                    )}
                    {!survey.completed && isClosed(survey) && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        Closed
                      </span>
                    )}
                  </div>
                  {survey.description && (
                    <p className="text-sm text-slate-500 mb-2">
                      {survey.description}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {formatDate(survey.startDate)} - {formatDate(survey.endDate)} &middot;{" "}
                    {survey._count.responses} responses
                  </p>
                </div>
                {!survey.completed && !isClosed(survey) && session?.user.role === "employee" && (
                  <span className="shrink-0 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg">
                    Take Survey
                  </span>
                )}
                {!survey.completed && isClosed(survey) && session?.user.role === "employee" && (
                  <span className="shrink-0 px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg">
                    View Status
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
  function isClosed(survey: Survey) {
    return survey.status !== "active" || new Date(survey.endDate) < new Date();
  }
