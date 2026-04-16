"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface QuestionDraft {
  text: string;
  type: "rating" | "multiple_choice" | "free_text";
  required: boolean;
  options: string[];
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("one-time");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { text: "", type: "rating", required: true, options: [] },
  ]);
  const [saving, setSaving] = useState(false);

  function addQuestion() {
    setQuestions([...questions, { text: "", type: "rating", required: true, options: [] }]);
  }

  function removeQuestion(idx: number) {
    setQuestions(questions.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, updates: Partial<QuestionDraft>) {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  }

  function addOption(qIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: [...q.options, ""] });
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    const q = questions[qIdx];
    const options = q.options.map((o, i) => (i === oIdx ? value : o));
    updateQuestion(qIdx, { options });
  }

  function removeOption(qIdx: number, oIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: q.options.filter((_, i) => i !== oIdx) });
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= questions.length) return;
    const arr = [...questions];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setQuestions(arr);
  }

  async function handleSubmit(status: "draft" | "active") {
    if (!title || !startDate || !endDate) return;
    setSaving(true);

    const res = await fetch("/api/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        frequency,
        startDate,
        endDate,
        status,
        questions: questions
          .filter((q) => q.text.trim())
          .map((q) => ({
            text: q.text,
            type: q.type,
            required: q.required,
            options: q.type === "multiple_choice" ? q.options.filter((o) => o.trim()) : undefined,
          })),
      }),
    });

    if (res.ok) {
      router.push("/admin/surveys");
    }
    setSaving(false);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Create New Survey</h1>

      <div className="space-y-6">
        {/* Survey Details */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Survey Details</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              placeholder="e.g., April Pulse Survey"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
              placeholder="Brief description of this survey..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Questions</h2>
            <button
              onClick={addQuestion}
              className="px-3 py-1.5 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition"
            >
              + Add Question
            </button>
          </div>

          {questions.map((q, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-500 shrink-0">Q{idx + 1}</span>
                <input
                  value={q.text}
                  onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                  placeholder="Enter your question..."
                />
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveQuestion(idx, -1)} className="p-1 hover:bg-slate-100 rounded" title="Move up">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button onClick={() => moveQuestion(idx, 1)} className="p-1 hover:bg-slate-100 rounded" title="Move down">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(idx)} className="p-1 hover:bg-red-50 rounded" title="Remove">
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <select
                  value={q.type}
                  onChange={(e) => updateQuestion(idx, { type: e.target.value as any, options: e.target.value === "multiple_choice" ? ["", ""] : [] })}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="rating">Rating (1-5)</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="free_text">Free Text</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                    className="accent-primary"
                  />
                  Required
                </label>
              </div>

              {q.type === "multiple_choice" && (
                <div className="space-y-2 pl-4">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-5">{oIdx + 1}.</span>
                      <input
                        value={opt}
                        onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder={`Option ${oIdx + 1}`}
                      />
                      {q.options.length > 2 && (
                        <button onClick={() => removeOption(idx, oIdx)} className="text-red-400 hover:text-red-600">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addOption(idx)}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add Option
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handleSubmit("draft")}
            disabled={saving}
            className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSubmit("active")}
            disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Publish Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}
