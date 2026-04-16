"use client";

import { useEffect, useState, use } from "react";

interface Question {
  id: string;
  text: string;
  type: string;
  required: boolean;
  options: string | null;
}

interface Survey {
  id: string;
  title: string;
  description: string | null;
  questions: Question[];
}

function getFingerprint(): string {
  // Create or retrieve a per-device fingerprint stored in localStorage.
  // Note: this is NOT cryptographically-secure identity; it's a simple
  // one-submission-per-device safeguard. Safari-compatible (no crypto.randomUUID).
  const KEY = "pulse-anon-fp";
  let fp = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
  if (!fp) {
    const arr = new Uint8Array(16);
    (typeof crypto !== "undefined" && crypto.getRandomValues)
      ? crypto.getRandomValues(arr)
      : arr.forEach((_, i) => (arr[i] = Math.floor(Math.random() * 256)));
    fp = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    if (typeof window !== "undefined") localStorage.setItem(KEY, fp);
  }
  return fp;
}

export default function PublicSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/surveys/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setSurvey(d.data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!survey) return;
    setSubmitting(true);
    setError(null);

    const answerData = survey.questions.map((q) => ({
      questionId: q.id,
      ratingValue: q.type === "rating" ? Number(answers[q.id]) || null : null,
      choiceValue: q.type === "multiple_choice" ? answers[q.id] || null : null,
      textValue: q.type === "free_text" ? answers[q.id] || null : null,
    }));

    const res = await fetch(`/api/public/surveys/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answerData, fingerprint: getFingerprint() }),
    });
    const json = await res.json();
    if (res.ok) setSubmitted(true);
    else setError(json.error || "Submission failed");
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center">
          <p className="text-slate-700 font-medium mb-2">Unable to load survey</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-12 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Thank you!</h2>
          <p className="text-slate-500">
            Your anonymous response has been recorded. Your feedback helps make our workplace better.
          </p>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <img src="/logo.svg" alt="PulseSurvey" className="inline-block w-12 h-12 mb-2" />
          <p className="text-sm text-slate-500">PulseSurvey</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{survey.title}</h1>
            {survey.description && <p className="text-slate-500">{survey.description}</p>}
          </div>

          <div className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div className="text-sm text-emerald-800">
                <strong className="text-emerald-900">100% anonymous.</strong> No login is required. Your responses are not linked to any account or identity. Timestamps are rounded to the nearest hour.
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {survey.questions.map((q, idx) => (
              <div key={q.id} className="space-y-3">
                <label className="block text-sm font-medium text-slate-800">
                  {idx + 1}. {q.text}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {q.type === "rating" && (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q.id]: v })}
                        className={`w-12 h-12 rounded-lg border-2 text-lg font-semibold transition ${
                          answers[q.id] === v
                            ? "border-primary bg-primary text-white"
                            : "border-slate-200 text-slate-600 hover:border-primary/50"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === "multiple_choice" && q.options && (
                  <div className="space-y-2">
                    {(JSON.parse(q.options) as string[]).map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                          answers[q.id] === opt
                            ? "border-primary bg-primary/5"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                          className="accent-primary"
                        />
                        <span className="text-sm text-slate-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === "free_text" && (
                  <textarea
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                    placeholder="Share your thoughts..."
                  />
                )}
              </div>
            ))}

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Anonymously"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
