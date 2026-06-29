"use client";

import { getProviders, signIn, type ClientSafeProvider } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const authErrorMessages: Record<string, string> = {
  AccessDenied:
    "Use your approved Clutch Google account. If you should have access, ask an admin to add your email to PulseSurvey.",
  OAuthSignin: "Google sign-in could not start. Please try again.",
  OAuthCallback: "Google sign-in could not be completed. Please try again.",
};

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);

  useEffect(() => {
    getProviders().then(setProviders);

    const authError = new URLSearchParams(window.location.search).get("error");
    if (authError) {
      const message = authErrorMessages[authError] || "Unable to sign in. Please try again.";
      window.setTimeout(() => setError(message), 0);
    }
  }, []);

  const googleProvider = providers?.google;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      userId,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid user ID or password");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError("");
    await signIn("google", { callbackUrl: "/dashboard" });
    setGoogleLoading(false);
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="PulseSurvey" className="inline-block w-16 h-16 mb-4" />
          <h1 className="text-3xl font-bold text-slate-900">PulseSurvey</h1>
          <p className="text-slate-500 mt-2">
            Clutch Employee Pulse Survey
          </p>
        </div>

        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <h2 className="text-sm font-semibold text-emerald-900">Anonymous by design</h2>
              <p className="mt-1 text-sm text-emerald-800">
                Google sign-in only confirms Clutch access and prevents duplicate submissions.
                Survey answers are stored separately without your name, email, Google ID, or user ID.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-5"
        >
          {googleProvider ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full py-2.5 px-4 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <span className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center text-sm font-bold text-slate-700">
                G
              </span>
              {googleLoading ? "Connecting to Google..." : "Continue with Google"}
            </button>
          ) : providers ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Google sign-in will appear after `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Admin access
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
              placeholder="admin"
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
              Local Credentials
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: "Admin", userId: "admin", password: "admin123" },
                { label: "Manager", userId: "eng.manager@pulsesurvey.com", password: "manager123" },
                { label: "Employee", userId: "alice@pulsesurvey.com", password: "employee123" },
              ].map((demo) => (
                <button
                  key={demo.userId}
                  type="button"
                  onClick={() => {
                    setUserId(demo.userId);
                    setPassword(demo.password);
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
