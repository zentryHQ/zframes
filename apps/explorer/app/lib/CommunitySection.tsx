"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { id: string; title: string; tags: string[]; views: number; frameCount: number };

// Client-fetched so the gallery page stays static (no build-time DB dependency).
// Reads /api/dashboards (listed + approved community dashboards).
export function CommunitySection() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/dashboards")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <section className="mt-12">
      <h2 className="mb-1 text-lg font-semibold text-white">Community</h2>
      <p className="mb-4 text-sm text-white/45">
        Dashboards published by people. Preview live, or fork with your AI agent.
      </p>
      {rows === null ? (
        <p className="text-sm text-white/30">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/40">
          Nothing here yet — be the first to{" "}
          <Link href="/tinker" className="text-indigo-400 hover:underline">
            build &amp; publish
          </Link>{" "}
          one.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((d) => (
            <Link
              key={d.id}
              href={`/d/${d.id}`}
              className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-indigo-400/40 hover:bg-white/[0.04]"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-white group-hover:text-indigo-300">
                  {d.title}
                </h3>
                <span className="text-xs text-white/40">{d.frameCount} frames</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/45"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
