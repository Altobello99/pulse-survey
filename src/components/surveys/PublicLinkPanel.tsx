"use client";

import { useState } from "react";

interface Props {
  surveyId: string;
  initialEnabled: boolean;
  initialToken: string | null;
}

export default function PublicLinkPanel({ surveyId, initialEnabled, initialToken }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}`
    : "";

  async function update(nextEnabled: boolean, rotate = false) {
    setBusy(true);
    const res = await fetch(`/api/surveys/${surveyId}/public-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enable: nextEnabled, rotate }),
    });
    const json = await res.json();
    if (res.ok) {
      setEnabled(json.data.allowAnonymous);
      setToken(json.data.publicToken);
    }
    setBusy(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Anonymous Public Link</h2>
          <p className="text-sm text-slate-500 mt-1">
            Share a single link with your whole company. No login required, one response per device.
          </p>
        </div>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => update(e.target.checked)}
            disabled={busy}
            className="sr-only peer"
          />
          <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
        </label>
      </div>

      {enabled && token && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={copy}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => update(true, true)}
            disabled={busy}
            className="text-xs text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            Rotate link (invalidates the old URL)
          </button>
        </div>
      )}
    </div>
  );
}
