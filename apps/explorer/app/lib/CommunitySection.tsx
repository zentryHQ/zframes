"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardCard } from "@/app/lib/DashboardCard";
import { synthLayout } from "@/app/lib/DashboardThumb";
import { SectionHeading } from "@/app/lib/SectionHeading";

type Row = { id: string; title: string; tags: string[]; views: number; frameCount: number };

// Client-fetched so the gallery page stays static (no build-time DB dependency).
// Reads /api/dashboards (listed + approved community dashboards). Community rows
// carry a frame count but not the spec, so the card thumbnail is a synthesized
// (deterministic) mini-map keyed to the id — still an honest "this is a board".
export function CommunitySection() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/dashboards")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <div>
      <SectionHeading
        eyebrow="Community"
        title="Published by people"
        description="Dashboards shared by others. Preview any one live, or fork it onto your machine with your AI agent."
        action={
          <Link
            href="/tinker"
            className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
          >
            Build &amp; publish yours →
          </Link>
        }
      />

      {rows === null ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="hairline h-64 animate-pulse rounded-2xl bg-white/[0.02]"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="hairline flex flex-col items-center rounded-2xl bg-white/[0.02] px-6 py-14 text-center">
          <p className="text-sm text-white/55">Nothing here yet.</p>
          <p className="mt-1 text-sm text-white/40">
            Be the first to{" "}
            <Link href="/tinker" className="text-indigo-300 underline-offset-2 hover:underline">
              build &amp; publish
            </Link>{" "}
            a dashboard.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((d) => (
            <DashboardCard
              key={d.id}
              href={`/d/${d.id}`}
              title={d.title}
              tags={d.tags}
              frameCount={d.frameCount}
              frames={synthLayout(d.id, d.frameCount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
