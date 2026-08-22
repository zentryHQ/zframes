"use client";

import { frameSearchTokens } from "@zframes/spec/catalogue";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BoardListing } from "@/app/lib/board-summary";
import { BoardGrid } from "@/app/lib/BoardGrid";
import { DashboardCard } from "@/app/lib/DashboardCard";
import { synthLayout } from "@/app/lib/DashboardThumb";
import { EmptyState } from "@/app/lib/EmptyState";
import { SearchField } from "@/app/lib/SearchField";
import { SectionHeading } from "@/app/lib/SectionHeading";

// Both sections now come from /api/dashboards. Curated boards used to be a static
// import (`CURATED`); they are rows since 2026-08-05, so the whole gallery is one
// fetch and the two sections differ only in which array they came from.
type GalleryResponse = { curated: BoardListing[]; community: BoardListing[] };

type SortKey = "newest" | "liked";

/**
 * Sorting happens CLIENT-SIDE and WITHIN a section, never across the two.
 *
 * Client-side because the view already holds every row THE API RETURNED, so ordering
 * is free and needs no round trip per toggle.
 *
 * ⚠️ AND THAT WINDOW IS CAPPED. `listCommunity()` takes `limit = 48` ordered by
 * `createdAt desc` (app/lib/dashboards.ts), so "Most liked" ranks the newest 48
 * community boards, NOT all of them. Below 48 published boards the two are the same
 * list and this is exactly right; past it, an older well-liked board silently cannot
 * appear above a newer zero-like one. The fix at that point is a server-side
 * `ORDER BY likes` for this mode, not a bigger client fetch — tracked in the map's
 * fog rather than pre-built here. Curated is unaffected (`listCurated()` is
 * unlimited).
 *
 * Within a section because curated boards get landing-page exposure community
 * publishes never see. Ranked together they would hold the top of the grid
 * permanently, and the community section — the one that rewards publishing —
 * would be where the showcase isn't.
 *
 * The tie-break is what makes a day-one grid look deliberate: almost everything
 * is at 0 likes, so ordering by likes alone would scramble the layout into
 * arbitrary order and read as broken. Falling back to the section's OWN natural
 * order keeps it stable — and for curated that is `landingOrder`, an editorial
 * sequence the API already returns in order, so a date tie-break would silently
 * discard it.
 */
function sortBoards(rows: BoardListing[], sort: SortKey): BoardListing[] {
  if (sort === "newest") return rows; // the API's own order — do not re-sort
  // Stable sort (guaranteed since ES2019), so equal likes preserve arrival order.
  return [...rows].sort((a, b) => b.likes - a.likes);
}

// The gallery: Curated + Community dashboards behind ONE free-text search box.
// A client component so the search stays interactive, but it renders on the
// server first like any other — and since 2026-08-07 it is HANDED its rows by
// the server page rather than starting empty. Search is seeded from and synced
// to the URL (?q=…) — shareable, refresh-persistent — and reuses the frame
// tokenizer from @zframes/spec so the whole explorer filters consistently.
export function GalleryView({ initial }: { initial?: GalleryResponse }) {
  // Seeded from the server render. Before that this always started `null`, so
  // the server HTML for the gallery was three pulsing skeletons and the board
  // titles, descriptions and links existed only after a client fetch — invisible
  // to any crawler that does not run JavaScript, which is most answer engines.
  const [data, setData] = useState<GalleryResponse | null>(initial ?? null);
  // Fetches on mount ONLY when the server seed is empty (a DB blip at render
  // time — the client fetch is the recovery path). A seeded render skips it:
  // the page is ISR with revalidate=300, so the seed is at most minutes old and
  // refetching the same list on every mount doubled the gallery's query load.
  useEffect(() => {
    if (initial && (initial.curated.length > 0 || initial.community.length > 0))
      return;
    fetch("/api/dashboards")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GalleryResponse | null) => {
        if (!d) return; // a failed refresh keeps the server-rendered rows
        // Defensive: an older cached response was a bare array (community only).
        setData(Array.isArray(d) ? { curated: [], community: d } : d);
      })
      .catch(() => {
        // Likewise: only fall back to empty if we never had anything to show.
        setData((prev) => prev ?? { curated: [], community: [] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Sort follows search's convention exactly: seeded from the URL, synced back to
  // it, so a "most liked" view is shareable and survives a refresh.
  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "newest";
    return new URLSearchParams(window.location.search).get("sort") === "liked"
      ? "liked"
      : "newest";
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (sort === "liked") url.searchParams.set("sort", "liked");
    else url.searchParams.delete("sort");
    window.history.replaceState(null, "", url);
  }, [sort]);

  const tokens = useMemo(() => frameSearchTokens(query), [query]);
  const searching = tokens.length > 0;
  // A dashboard matches when every query token appears in its title, tags, or
  // (curated only) description.
  const matches = (haystack: string) =>
    tokens.every((token) => haystack.includes(token));

  const curated = useMemo(() => {
    if (data === null) return null;
    const rows = searching
      ? data.curated.filter((d) =>
          matches(
            `${d.title} ${d.tags.join(" ")} ${d.description}`.toLowerCase(),
          ),
        )
      : data.curated;
    return sortBoards(rows, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searching, tokens, sort]);

  const community = useMemo(() => {
    if (data === null) return null;
    const rows = searching
      ? data.community.filter((d) =>
          matches(`${d.title} ${d.tags.join(" ")}`.toLowerCase()),
        )
      : data.community;
    return sortBoards(rows, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searching, tokens, sort]);

  const noResults =
    searching && (curated?.length ?? 0) === 0 && (community?.length ?? 0) === 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10 max-w-3xl">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          The dashboard <span className="text-indigo-200">gallery</span>
        </h1>
        <p className="mt-3 text-base leading-relaxed text-white/75">
          Curated boards and dashboards published by the community. Preview any
          one in the browser, then fork it onto your machine to run it live.
        </p>
        <SearchField
          label="Search dashboards"
          value={query}
          onChange={setQuery}
          className="mt-6"
        />

        {/* One control governing BOTH sections — each still sorts within itself.
            Rendered only once there is data: a toggle that looks interactive over
            three skeleton cards invites a click that does nothing. */}
        {data !== null && (
          <div
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
            role="group"
            aria-label="Sort dashboards"
          >
            {(
              [
                ["newest", "Newest"],
                ["liked", "Most liked"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={
                  sort === key
                    ? "zf-press rounded-md bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-100"
                    : "zf-press cursor-pointer rounded-md px-3 py-1 text-xs font-medium text-white/55 transition-colors hover:text-white/85"
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {noResults && (
        <p className="text-sm text-white/55">
          No dashboards match “{query.trim()}”.
        </p>
      )}

      {/* ── Curated ──────────────────────────────────────────────────────── */}
      {/* `curated === null` is the pre-fetch state — it used to be impossible
          (the boards were compiled in), so the section renders a skeleton now
          rather than briefly claiming there are none. */}
      {curated === null ? (
        <section className="mb-16">
          <BoardGrid aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="zf-surface h-64 animate-pulse" />
            ))}
          </BoardGrid>
        </section>
      ) : (
        curated.length > 0 && (
          <section className="mb-16">
            <SectionHeading
              eyebrow="Curated"
              title="Boards to start from"
              description="Hand-built dashboards spanning crypto majors, on-chain data, and official US macro."
            />
            <BoardGrid>
              {curated.map((d) => (
                <DashboardCard
                  key={d.id}
                  href={`/dashboard/${d.id}`}
                  title={d.title}
                  description={d.description}
                  tags={d.tags}
                  frameCount={d.frameCount}
                  // The board's REAL geometry, projected server-side — a curated
                  // thumbnail still mirrors its actual layout rather than falling
                  // back to the synthesised one community boards use.
                  frames={d.layout}
                  thumbSrc={`/api/thumbs/${d.id}`}
                  likes={d.likes}
                />
              ))}
            </BoardGrid>
          </section>
        )
      )}

      {/* ── Community ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading
          eyebrow="Community"
          title="Published by people"
          description="Dashboards shared by others. Preview any one in the browser, or fork it onto your machine with your AI agent."
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
          <BoardGrid aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="zf-surface h-64 animate-pulse" />
            ))}
          </BoardGrid>
        ) : community.length === 0 ? (
          // gap-1 rather than the centred default's gap-4: these are two lines
          // of one sentence, not a headline and a CTA.
          <EmptyState align="center" className="gap-1">
            <p className="text-sm text-white/65">
              {searching
                ? "No community dashboards match your search."
                : "Nothing here yet."}
            </p>
            {!searching && (
              <p className="text-sm text-white/65">
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
          </EmptyState>
        ) : (
          <BoardGrid>
            {community.map((d) => (
              <DashboardCard
                key={d.id}
                href={`/dashboard/${d.id}`}
                title={d.title}
                tags={d.tags}
                frameCount={d.frameCount}
                frames={synthLayout(d.id, d.frameCount)}
                thumbSrc={`/api/thumbs/${d.id}`}
                likes={d.likes}
              />
            ))}
          </BoardGrid>
        )}
      </section>
    </main>
  );
}
