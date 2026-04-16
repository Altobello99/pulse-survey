"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="PulseSurvey" className="inline-block w-16 h-16 mb-4" />
          <h1 className="text-3xl font-bold text-slate-900">PulseSurvey</h1>
          <p className="text-slate-500 mt-2">
            Employee Engagement & Pulse Survey Tool
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
              placeholder="you@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
              placeholder="Enter your password"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500 text-center mb-3">
              Demo Credentials
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: "Admin", email: "admin@pulsesurvey.com" },
                { label: "Manager", email: "eng.manager@pulsesurvey.com" },
                { label: "Employee", email: "alice@pulsesurvey.com" },
              ].map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => {
                    setEmail(demo.email);
                    setPassword("password123");
                  }}
                  className="py-2 px-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
