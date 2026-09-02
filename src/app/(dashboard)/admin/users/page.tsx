"use client";

import { useEffect, useMemo, useState } from "react";
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

type SortKey = "user" | "role" | "department" | "team";
type SortDirection = "asc" | "desc";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("user");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.data || []))
      .finally(() => setLoading(false));
  }, []);

  const roleOptions = useMemo(
    () => [...new Set(users.map((user) => user.role))].sort(collator.compare),
    [users]
  );
  const departmentOptions = useMemo(
    () => [...new Set(
      users
        .map((user) => user.department?.name)
        .filter((name): name is string => Boolean(name))
    )].sort(collator.compare),
    [users]
  );
  const teamOptions = useMemo(
    () => [...new Set(
      users
        .map((user) => user.team?.name)
        .filter((name): name is string => Boolean(name))
    )].sort(collator.compare),
    [users]
  );
  const hasUnassignedTeams = users.some((user) => !user.team);
  const hasActiveFilters = Boolean(search || roleFilter || departmentFilter || teamFilter);

  const visibleUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users
      .filter((user) => {
        if (
          normalizedSearch &&
          !user.name.toLowerCase().includes(normalizedSearch) &&
          !user.email.toLowerCase().includes(normalizedSearch)
        ) {
          return false;
        }
        if (roleFilter && user.role !== roleFilter) return false;
        if (departmentFilter && user.department?.name !== departmentFilter) return false;
        if (teamFilter === "__unassigned__" && user.team) return false;
        if (teamFilter && teamFilter !== "__unassigned__" && user.team?.name !== teamFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const comparison = collator.compare(sortValue(a, sortKey), sortValue(b, sortKey));
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [users, search, roleFilter, departmentFilter, teamFilter, sortKey, sortDirection]);

  function changeSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("");
    setDepartmentFilter("");
    setTeamFilter("");
  }

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

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
              Search employee
            </span>
            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </label>

          <FilterSelect label="Role" value={roleFilter} onChange={setRoleFilter}>
            <option value="">All roles</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>{formatRole(role)}</option>
            ))}
          </FilterSelect>

          <FilterSelect label="Department" value={departmentFilter} onChange={setDepartmentFilter}>
            <option value="">All departments</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </FilterSelect>

          <FilterSelect label="Team" value={teamFilter} onChange={setTeamFilter}>
            <option value="">All teams</option>
            {teamOptions.map((team) => (
              <option key={team} value={team}>{team}</option>
            ))}
            {hasUnassignedTeams && <option value="__unassigned__">No team assigned</option>}
          </FilterSelect>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600" aria-live="polite">
            Showing <span className="font-semibold text-slate-900">{visibleUsers.length}</span> of{" "}
            <span className="font-semibold text-slate-900">{users.length}</span> active employees
          </p>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortableHeader label="User" column="user" activeColumn={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Role" column="role" activeColumn={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Department" column="department" activeColumn={sortKey} direction={sortDirection} onSort={changeSort} />
                <SortableHeader label="Team" column="team" activeColumn={sortKey} direction={sortDirection} onSort={changeSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {getInitials(user.name)}
                      </div>
                      <div className="min-w-0">
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
                  <td className="px-6 py-4 text-slate-600">{user.department?.name}</td>
                  <td className="px-6 py-4 text-slate-600">{user.team?.name || "-"}</td>
                </tr>
              ))}
              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No employees match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {children}
      </select>
    </label>
  );
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: string;
  column: SortKey;
  activeColumn: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const active = activeColumn === column;
  const nextDirection = active && direction === "asc" ? "descending" : "ascending";

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className="px-6 py-3 text-left font-medium text-slate-600"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={`Sort ${label.toLowerCase()} ${nextDirection}`}
        className="inline-flex items-center gap-2 rounded px-1 py-1 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <span>{label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 ${active ? "text-primary" : "text-slate-400"}`}
        >
          {active && direction === "asc" ? (
            <path d="m4 10 4-4 4 4" />
          ) : (
            <path d="m4 6 4 4 4-4" />
          )}
        </svg>
      </button>
    </th>
  );
}

function sortValue(user: User, sortKey: SortKey) {
  if (sortKey === "role") return user.role;
  if (sortKey === "department") return user.department?.name || "";
  if (sortKey === "team") return user.team?.name || "";
  return user.name;
}

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
