"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectionHeading } from "@/app/lib/SectionHeading";

type Row = {
  id: string;
  title: string;
  visibility: "listed" | "unlisted";
  tags: string[];
  views: number;
  frameCount: number;
};

export default function MyDashboardsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  // Two-step destructive action: first click arms this id, second click deletes.
  const [armed, setArmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/dashboards/mine");
    if (r.status === 401) {
      setNeedAuth(true);
      return;
    }
    setNeedAuth(false);
    setRows(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 3500);
    return () => window.clearTimeout(t);
  }, [armed]);

  async function del(id: string) {
    setArmed(null);
    await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <SectionHeading
        eyebrow="Your account"
        title="My dashboards"
        description="Boards you've published. Preview any live, or manage visibility below."
      />

      {needAuth ? (
        <div className="zf-surface flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-white/70">
            Sign in to see the dashboards you've published. Browsing, preview,
            and tinker never need an account — only publishing does.
          </p>
          <Link
            href="/signin?next=/mine"
            className="zf-press rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
          >
            Sign in
          </Link>
        </div>
      ) : rows === null ? (
        <div className="space-y-2.5" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="zf-surface h-[74px] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="zf-surface flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-white/70">
            Nothing published yet — build a board in the tinker editor, then hit
            Publish to get a shareable link.
          </p>
          <Link
            href="/tinker"
            className="zf-press rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
          >
            Open the tinker editor →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((d) => (
            <li
              key={d.id}
              className="zf-surface card-lift flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <div className="min-w-0">
                <Link
                  href={`/d/${d.id}`}
                  className="font-medium text-white transition-colors hover:text-indigo-300"
                >
                  {d.title}
                </Link>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-white/55">
                  <span
                    className={
                      d.visibility === "listed"
                        ? "inline-flex items-center gap-1 text-up"
                        : "text-white/55"
                    }
                  >
                    {d.visibility === "listed" && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-up" />
                    )}
                    {d.visibility}
                  </span>
                  <span>· {d.frameCount} frames</span>
                  <span>· {d.views} views</span>
                  <code className="text-white/55">/d/{d.id}</code>
                </div>
              </div>
              {armed === d.id ? (
                <button
                  type="button"
                  onClick={() => del(d.id)}
                  className="shrink-0 rounded-lg border border-down/50 bg-down/15 px-3 py-1.5 text-xs font-medium text-down transition-colors hover:bg-down/25"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setArmed(d.id)}
                  className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-down/40 hover:text-down"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
