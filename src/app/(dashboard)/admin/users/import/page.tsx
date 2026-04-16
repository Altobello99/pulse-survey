"use client";

import { useState } from "react";
import Link from "next/link";

export default function ImportUsersPage() {
  const [csv, setCsv] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("welcome123");
  const [result, setResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  async function handleImport() {
    if (!csv.trim()) return;
    setImporting(true);
    setResult(null);
    const res = await fetch("/api/users/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, defaultPassword }),
    });
    const json = await res.json();
    setResult(json.data || json);
    setImporting(false);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="text-sm text-slate-500 hover:text-slate-700">
          &larr; Back to Users
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Bulk Import Users</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">CSV Format</h2>
        <p className="text-sm text-slate-600">
          Upload a CSV file with these columns (case-insensitive, spaces/underscores OK):
        </p>
        <div className="bg-slate-50 rounded-lg p-4 text-xs font-mono text-slate-700">
          <div><strong>Required:</strong> email, name, department</div>
          <div className="mt-1"><strong>Optional:</strong> team, role (admin/manager/employee), jobTitle, jobLevel, hireDate (YYYY-MM-DD), managerEmail</div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 text-xs font-mono text-slate-700 overflow-x-auto">
          <pre>{`email,name,department,team,role,jobTitle,jobLevel,hireDate
alice@acme.com,Alice Smith,Engineering,Frontend,employee,Senior Engineer,L5,2022-03-15
bob@acme.com,Bob Johnson,Marketing,Growth,manager,Growth Lead,L6,2020-06-01`}</pre>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">CSV File</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Or paste CSV content</label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm font-mono"
            placeholder="email,name,department,..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Default password for new users
          </label>
          <input
            value={defaultPassword}
            onChange={(e) => setDefaultPassword(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-slate-400 mt-1">
            Users should change this on first login. Existing users keep their current password.
          </p>
        </div>

        <button
          onClick={handleImport}
          disabled={!csv.trim() || importing}
          className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import Users"}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-3">Import Result</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Total rows</p>
              <p className="text-2xl font-bold text-slate-900">{result.total}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <p className="text-xs text-emerald-700">Created</p>
              <p className="text-2xl font-bold text-emerald-700">{result.created}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">Updated</p>
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-700 mb-2">
                Errors ({result.errors.length}):
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((err: any, i: number) => (
                  <div key={i} className="text-xs bg-red-50 text-red-700 rounded p-2">
                    Row {err.row} ({err.email}): {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
