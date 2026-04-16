"use client";

import { useEffect, useState } from "react";
import { formatDate, isOverdue, cn } from "@/lib/utils";

interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  team: { name: string } | null;
}

export default function ActionsPage() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: "", description: "", priority: "medium", dueDate: "" });
  const [saving, setSaving] = useState(false);

  function fetchActions() {
    fetch("/api/actions")
      .then((r) => r.json())
      .then((d) => setActions(d.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchActions();
  }, []);

  async function createAction() {
    if (!formData.title) return;
    setSaving(true);
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    setFormData({ title: "", description: "", priority: "medium", dueDate: "" });
    setShowForm(false);
    setSaving(false);
    fetchActions();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/actions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchActions();
  }

  async function deleteAction(id: string) {
    if (!confirm("Delete this action item?")) return;
    await fetch(`/api/actions/${id}`, { method: "DELETE" });
    fetchActions();
  }

  const columns = [
    { key: "open", label: "Open", color: "border-amber-400" },
    { key: "in_progress", label: "In Progress", color: "border-blue-400" },
    { key: "completed", label: "Completed", color: "border-emerald-400" },
  ];

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Action Items</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Action Items</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
        >
          + New Action
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-slate-800">New Action Item</h2>
          <input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            placeholder="Action item title..."
          />
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
            placeholder="Description (optional)"
          />
          <div className="flex gap-4">
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={createAction} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => (
          <div key={col.key} className={`bg-slate-50 rounded-xl p-4 border-t-4 ${col.color}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-700">{col.label}</h3>
              <span className="text-xs bg-white rounded-full px-2 py-0.5 text-slate-500">
                {actions.filter((a) => a.status === col.key).length}
              </span>
            </div>
            <div className="space-y-3">
              {actions
                .filter((a) => a.status === col.key)
                .map((action) => (
                  <div
                    key={action.id}
                    className={cn(
                      "bg-white rounded-lg border border-slate-200 p-4 shadow-sm",
                      isOverdue(action.dueDate) && action.status !== "completed" && "border-red-300"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-slate-800 text-sm">{action.title}</h4>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                          action.priority === "high"
                            ? "bg-red-50 text-red-700"
                            : action.priority === "medium"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {action.priority}
                      </span>
                    </div>
                    {action.description && (
                      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{action.description}</p>
                    )}
                    {action.dueDate && (
                      <p className={`text-xs mb-3 ${
                        isOverdue(action.dueDate) && action.status !== "completed"
                          ? "text-red-600 font-medium"
                          : "text-slate-400"
                      }`}>
                        Due: {formatDate(action.dueDate)}
                      </p>
                    )}
                    <div className="flex items-center gap-1">
                      {col.key !== "open" && (
                        <button
                          onClick={() => updateStatus(action.id, col.key === "in_progress" ? "open" : "in_progress")}
                          className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                        >
                          {col.key === "in_progress" ? "Back" : "Reopen"}
                        </button>
                      )}
                      {col.key !== "completed" && (
                        <button
                          onClick={() =>
                            updateStatus(action.id, col.key === "open" ? "in_progress" : "completed")
                          }
                          className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20"
                        >
                          {col.key === "open" ? "Start" : "Complete"}
                        </button>
                      )}
                      <button
                        onClick={() => deleteAction(action.id)}
                        className="px-2 py-1 text-xs text-red-500 rounded hover:bg-red-50 ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              {actions.filter((a) => a.status === col.key).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No items</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
