"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatDate, sentimentColor } from "@/lib/utils";
import { FEEDBACK_CATEGORIES } from "@/lib/constants";

interface FeedbackItem {
  id: string;
  message: string;
  category: string | null;
  sentiment: string | null;
  status: string;
  createdAt: string;
  department: { name: string } | null;
}

export default function FeedbackPage() {
  const { data: session } = useSession();
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("suggestion");
  const [includeDepartment, setIncludeDepartment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function fetchFeedback() {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => setFeedbackList(d.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchFeedback();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 10) return;
    setSubmitting(true);

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, category, includeDepartment }),
    });

    if (res.ok) {
      setSubmitted(true);
      setMessage("");
      setShowForm(false);
      fetchFeedback();
      setTimeout(() => setSubmitted(false), 3000);
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Anonymous Feedback</h1>
          <p className="text-sm text-slate-500">Share your thoughts anonymously</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
        >
          {showForm ? "Cancel" : "+ New Feedback"}
        </button>
      </div>

      {submitted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          Feedback submitted anonymously. Thank you!
        </div>
      )}

      {/* Submit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
            <svg className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div className="text-sm text-emerald-800">
              <strong className="text-emerald-900">Fully anonymous.</strong> Your identity is never stored with this feedback. Only the message and (optionally) your department are saved.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full sm:w-auto px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 capitalize"
            >
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your Feedback</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
              placeholder="Share your thoughts, suggestions, concerns, or praise... (min 10 characters)"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeDepartment}
              onChange={(e) => setIncludeDepartment(e.target.checked)}
              className="accent-primary"
            />
            Include my department info (helps with context, still anonymous)
          </label>

          <button
            type="submit"
            disabled={submitting || message.trim().length < 10}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Anonymously"}
          </button>
        </form>
      )}

      {/* Feedback List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          No feedback yet. Be the first to share!
        </div>
      ) : (
        <div className="space-y-3">
          {feedbackList.map((fb) => (
            <div key={fb.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm text-slate-700 mb-2">{fb.message}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {fb.category && (
                      <span className="px-2 py-0.5 bg-slate-100 rounded-full capitalize">{fb.category}</span>
                    )}
                    {fb.sentiment && (
                      <span className={`px-2 py-0.5 rounded-full capitalize ${sentimentColor(fb.sentiment)}`}>
                        {fb.sentiment}
                      </span>
                    )}
                    {fb.department && <span>{fb.department.name}</span>}
                    <span>{formatDate(fb.createdAt)}</span>
                    <span className={`px-2 py-0.5 rounded-full ${
                      fb.status === "addressed" ? "bg-emerald-50 text-emerald-700" :
                      fb.status === "reviewed" ? "bg-blue-50 text-blue-700" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      {fb.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
