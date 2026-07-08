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
  demographicOptions?: {
    departments: { id: string; name: string; employeeCount: number }[];
    locations: { name: string; employeeCount: number }[];
    currentDepartmentId: string | null;
    currentLocation: string | null;
  };
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
  const [departmentId, setDepartmentId] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    fetch(`/api/surveys/${surveyId}`)
      .then((r) => r.json())
      .then((d) => {
        setSurvey(d.data);
        if (d.data?.completed) setSubmitted(true);
        if (d.data?.demographicOptions) {
          setDepartmentId(d.data.demographicOptions.currentDepartmentId || "");
          setLocation(d.data.demographicOptions.currentLocation || "");
        }
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
      const ratingValue =
        q.type === "rating" && val !== undefined && val !== ""
          ? Number(val)
          : null;
      return {
        questionId: q.id,
        ratingValue,
        choiceValue: q.type === "multiple_choice" ? val || null : null,
        textValue: q.type === "free_text" ? val || null : null,
      };
    });

    const res = await fetch(`/api/surveys/${surveyId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answerData, departmentId, location }),
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-950 text-white p-6">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Employee Pulse Survey" className="w-12 h-12 rounded-xl" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">Clutch</p>
              <h1 className="text-2xl font-bold">{survey.title}</h1>
            </div>
          </div>
          {survey.description && (
            <p className="mt-4 max-w-xl text-sm text-slate-300">{survey.description}</p>
          )}
        </div>

        {/* CONFIDENTIALITY NOTICE */}
        <div className="m-6 mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
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

        <form onSubmit={handleSubmit} className="space-y-10 px-6 pb-6">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                Department and Location
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Only departments and locations with 10 or more active employees are listed.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                >
                  <option value="">My department is not listed</option>
                  {(survey.demographicOptions?.departments || []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Location
                </label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                >
                  <option value="">My location is not listed</option>
                  {(survey.demographicOptions?.locations || []).map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

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
                    <RatingInput
                      question={q}
                      value={answers[q.id]}
                      onChange={(value) => setAnswers({ ...answers, [q.id]: value })}
                    />
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

function ratingOptions(question: Question) {
  if (!question.options) return [1, 2, 3, 4, 5];

  try {
    const parsed = JSON.parse(question.options);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];
    const values = parsed
      .map((option) => Number(option))
      .filter((option) => Number.isInteger(option));
    return values.length > 0 ? values : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function RatingInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (value: number) => void;
}) {
  const options = ratingOptions(question);
  const isAgreementScale =
    options.length === 5 &&
    options[0] === 1 &&
    options[1] === 2 &&
    options[2] === 3 &&
    options[3] === 4 &&
    options[4] === 5;
  const labels = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"];

  if (isAgreementScale) {
    return (
      <div className="inline-grid grid-cols-5 gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`w-12 h-12 rounded-lg border-2 text-lg font-semibold transition ${
              value === option
                ? "border-primary bg-primary text-white"
                : "border-slate-200 text-slate-600 hover:border-primary/50"
            }`}
          >
            {option}
          </button>
        ))}
        {labels.map((label) => (
          <span key={label} className="w-12 text-center text-[10px] leading-tight text-slate-500">
            {label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`h-12 rounded-lg border-2 text-lg font-semibold transition ${
            value === option
              ? "border-primary bg-primary text-white"
              : "border-slate-200 text-slate-600 hover:border-primary/50"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
