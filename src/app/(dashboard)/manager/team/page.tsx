"use client";

import { useEffect, useState } from "react";
import { getInitials } from "@/lib/utils";

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => setMembers(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">My Team</h1>
        <div className="bg-white rounded-xl border p-6 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-full mb-4" />
          <div className="h-4 bg-slate-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">My Team</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m: any) => (
          <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {getInitials(m.name)}
              </div>
              <div>
                <p className="font-medium text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-400">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                m.role === "manager" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
              }`}>
                {m.role}
              </span>
              {m.team && (
                <span className="text-xs text-slate-400">{m.team.name}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {members.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          No team members found.
        </div>
      )}
    </div>
  );
}
