"use client";

import { frameSearchTokens } from "@zframes/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CURATED } from "@/app/lib/curated-dashboards";
import { DashboardCard } from "@/app/lib/DashboardCard";
import { synthLayout } from "@/app/lib/DashboardThumb";
import { SectionHeading } from "@/app/lib/SectionHeading";
import { Input } from "@/app/components/ui/input";

type Row = { id: string; title: string; tags: string[]; frameCount: number };

// The gallery: Curated + Community dashboards behind ONE free-text search box.
// Client-only so the search stays interactive and the community grid can be
// fetched at runtime (no build-time DB dependency). Search is seeded from and
// synced to the URL (?q=…) — shareable, refresh-persistent — and reuses the
// frame tokenizer from @zframes/spec so the whole explorer filters consistently.
export function GalleryView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch("/api/dashboards")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = query.trim();
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [query]);

  const tokens = useMemo(() => frameSearchTokens(query), [query]);
  const searching = tokens.length > 0;
  // A dashboard matches when every query token appears in its title, tags, or
  // (curated only) description.
  const matches = (haystack: string) =>
    tokens.every((token) => haystack.includes(token));

  const curated = useMemo(() => {
    if (!searching) return CURATED;
    return CURATED.filter((d) =>
      matches(`${d.title} ${d.tags.join(" ")} ${d.description}`.toLowerCase()),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, tokens]);

  const community = useMemo(() => {
    if (rows === null) return null;
    if (!searching) return rows;
    return rows.filter((d) =>
      matches(`${d.title} ${d.tags.join(" ")}`.toLowerCase()),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, searching, tokens]);

  const noResults =
    searching && curated.length === 0 && (community?.length ?? 0) === 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10 max-w-3xl">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          The dashboard <span className="text-indigo-200">gallery</span>
        </h1>
        <p className="mt-3 text-base leading-relaxed text-white/75">
          Curated boards and dashboards published by the community. Preview any
          one live with real data, then fork it onto your machine.
        </p>
        <div className="relative mt-6 max-w-md">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dashboards…"
            aria-label="Search dashboards"
            className="border-white/10 py-2.5 pl-10 pr-3 focus:border-indigo-300/50 focus:bg-white/[0.06]"
          />
        </div>
      </header>

      {noResults && (
        <p className="text-sm text-white/55">
          No dashboards match “{query.trim()}”.
        </p>
      )}

      {/* ── Curated ──────────────────────────────────────────────────────── */}
      {curated.length > 0 && (
        <section className="mb-16">
          <SectionHeading
            eyebrow="Curated"
            title="Boards to start from"
            description="Hand-built dashboards spanning crypto majors, on-chain data, and official US macro."
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {curated.map((d) => (
              <DashboardCard
                key={d.id}
                href={`/d/${d.id}`}
                title={d.title}
                description={d.description}
                tags={d.tags}
                frameCount={d.spec.frames.length}
                frames={d.spec.frames}
                thumbSrc={`/api/thumbs/${d.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Community ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          eyebrow="Community"
          title="Published by people"
          description="Dashboards shared by others. Preview any one live, or fork it onto your machine with your AI agent."
          action={
            <Link
              href="/tinker"
              className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
            >
              Build &amp; publish yours →
            </Link>
          }
        />

        {community === null ? (
          <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-hidden
          >
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="zf-surface h-64 animate-pulse" />
            ))}
          </div>
        ) : community.length === 0 ? (
          <div className="zf-surface flex flex-col items-center px-6 py-14 text-center">
            <p className="text-sm text-white/65">
              {searching
                ? "No community dashboards match your search."
                : "Nothing here yet."}
            </p>
            {!searching && (
              <p className="mt-1 text-sm text-white/65">
                Be the first to{" "}
                <Link
                  href="/tinker"
                  className="text-indigo-300 underline-offset-2 hover:underline"
                >
                  build &amp; publish
                </Link>{" "}
                a dashboard.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {community.map((d) => (
              <DashboardCard
                key={d.id}
                href={`/d/${d.id}`}
                title={d.title}
                tags={d.tags}
                frameCount={d.frameCount}
                frames={synthLayout(d.id, d.frameCount)}
                thumbSrc={`/api/thumbs/${d.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
