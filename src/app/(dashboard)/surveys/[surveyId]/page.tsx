"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface Question {
  id: string;
  section: string | null;
  text: string;
  type: string;
  required: boolean;
  options: string | null;
}

interface Survey {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  status: string;
  startDate: string;
  endDate: string;
  questions: Question[];
}

type AnswerValue = string | number | undefined;

export default function TakeSurveyPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = use(params);
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/surveys/${surveyId}`)
      .then((r) => r.json())
      .then((d) => {
        setSurvey(d.data);
        if (d.data?.completed) setSubmitted(true);
      })
      .finally(() => setLoading(false));
  }, [surveyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!survey) return;
    setSubmitting(true);
    setSubmitError(null);

    const answerData = survey.questions.map((q) => {
      const val = answers[q.id];
      return {
        questionId: q.id,
        ratingValue: q.type === "rating" ? Number(val) || null : null,
        choiceValue: q.type === "multiple_choice" ? val || null : null,
        textValue: q.type === "free_text" ? val || null : null,
      };
    });

    const res = await fetch(`/api/surveys/${surveyId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answerData }),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json().catch(() => null);
      setSubmitError(data?.error || "Your response could not be submitted.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-8 animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/2 mb-4" />
          <div className="h-4 bg-slate-100 rounded w-3/4 mb-8" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-3" />
                <div className="h-10 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Thank you!</h2>
          <p className="text-slate-500 mb-6">
            You already submitted this survey. Your anonymous response has been recorded and cannot be submitted again.
          </p>
          <button
            onClick={() => router.push("/surveys")}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition"
          >
            Back to Surveys
          </button>
        </div>
      </div>
    );
  }

  if (!survey) {
    return <div className="text-slate-500">Survey not found.</div>;
  }

  const surveyClosed =
    survey.status !== "active" ||
    new Date(survey.startDate) > new Date() ||
    new Date(survey.endDate) < new Date();
  const groupedQuestions = groupQuestions(survey.questions);

  if (surveyClosed) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Survey closed</h2>
          <p className="text-slate-500 mb-6">
            This survey is no longer accepting responses. Thank you for taking part in future pulse surveys.
          </p>
          <button
            onClick={() => router.push("/surveys")}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition"
          >
            Back to Surveys
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{survey.title}</h1>
          {survey.description && (
            <p className="text-slate-500">{survey.description}</p>
          )}
        </div>

        {/* CONFIDENTIALITY NOTICE */}
        <div className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-emerald-900 mb-1">Your feedback is anonymous</h3>
              <p className="text-sm text-emerald-800">
                Google sign-in confirms you are an active Clutch employee and helps us make sure each person responds once.
                Your answers are stored separately from your login and are never shown with your name, email, Google ID, or employee ID.
                Results are reported only when at least 3 people have responded, so managers and admins see trends, percentages, charts, and anonymous comments without identifying individual employees.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          {groupedQuestions.map((group) => (
            <section key={group.section} className="space-y-6">
              {group.section && (
                <div className="border-b border-slate-200 pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                    {group.section}
                  </h2>
                </div>
              )}

              {group.questions.map(({ question: q, index }) => (
                <div key={q.id} className="space-y-3">
                  <label className="block text-sm font-medium text-slate-800">
                    {index + 1}. {q.text}
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
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition"
                      placeholder="Share your thoughts..."
                    />
                  )}
                </div>
              ))}
            </section>
          ))}

          <div className="pt-4 border-t border-slate-200">
            {submitError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Response"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function groupQuestions(questions: Question[]) {
  const groups: { section: string; questions: { question: Question; index: number }[] }[] = [];

  questions.forEach((question, index) => {
    const section = question.section?.trim() || "";
    const existing = groups.find((group) => group.section === section);
    if (existing) {
      existing.questions.push({ question, index });
    } else {
      groups.push({ section, questions: [{ question, index }] });
    }
  });

  return groups;
}
