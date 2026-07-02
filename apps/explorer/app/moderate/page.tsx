"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectionHeading } from "@/app/lib/SectionHeading";

type Row = {
  id: string;
  title: string;
  status: "pending" | "approved" | "removed";
  visibility: "listed" | "unlisted";
  reportCount: number;
};

export default function ModeratePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/moderate");
    if (r.status === 403) {
      setForbidden(true);
      return;
    }
    setForbidden(false);
    setRows(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, status: "approved" | "removed") {
    await fetch("/api/moderate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <SectionHeading
        eyebrow="Admin"
        title="Moderation"
        description="Reported dashboards, most-reported first. Remove takes it down everywhere; restore re-approves."
      />

      {forbidden ? (
        <div className="zf-surface flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-white/70">
            Admins only — sign in with an allowlisted account to review reports.
          </p>
          <Link
            href="/signin?next=/moderate"
            className="zf-press rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
          >
            Sign in
          </Link>
        </div>
      ) : rows === null ? (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="zf-surface h-16 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="zf-surface p-6">
          <p className="text-sm text-white/70">No reports. All clear.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li
              key={d.id}
              className="zf-surface flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/d/${d.id}`}
                  className="font-medium text-white transition-colors hover:text-indigo-300"
                >
                  {d.title}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-white/55">
                  <span className="text-down">{d.reportCount} reports</span>
                  <span>· {d.visibility}</span>
                  <span className={d.status === "removed" ? "text-down" : "text-up"}>
                    · {d.status}
                  </span>
                </div>
              </div>
              {d.status === "removed" ? (
                <button
                  onClick={() => act(d.id, "approved")}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => act(d.id, "removed")}
                  className="rounded-lg border border-down/40 bg-down/10 px-3 py-1.5 text-xs text-down transition-colors hover:bg-down/20"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
