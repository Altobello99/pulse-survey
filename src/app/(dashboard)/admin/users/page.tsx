"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInitials } from "@/lib/utils";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: { name: string };
  team: { name: string } | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Users</h1>
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
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <Link
          href="/admin/users/import"
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
        >
          Bulk Import CSV
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600 hidden md:table-cell">Department</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600 hidden lg:table-cell">Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {getInitials(user.name)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      user.role === "admin"
                        ? "bg-purple-50 text-purple-700"
                        : user.role === "manager"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600 hidden md:table-cell">{user.department?.name}</td>
                <td className="px-6 py-4 text-slate-600 hidden lg:table-cell">{user.team?.name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
