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

type SortKey = "liked" | "newest";

/**
 * The board gallery: ONE list, every board.
 *
 * It was two sections — "Curated" above "Community" — until 2026-08-28. Likes
 * retired the split: the grid ranks by something people actually did now, and a
 * house board sitting permanently above a community board that out-scored it
 * makes that ranking decorative. Every board is a board; the `curated` flag lives
 * on only as the landing stack's ordering and the seeder's marker.
 *
 * **Sorting is the server's, not this component's.** It used to be a client-side
 * `[...rows].sort()` over whatever the API returned — which meant "most liked"
 * ranked the newest 48 rows rather than the top 48 boards, and past that many
 * publishes an older well-liked board could not reach the grid at all. That was
 * survivable as one of two sections; as the front door's only ranking it is the
 * page being wrong. `/api/dashboards?sort=` orders in SQL, so the limit is a page
 * of the ranking instead of a cage around it.
 *
 * The cost of that is a round trip per ordering, which is what `bySort` absorbs:
 * each ranking is fetched at most once, and toggling back to one already held is
 * instant. Search stays client-side over the rows in hand — it is a filter, not
 * a ranking, so it cannot pull in a board the ordering didn't.
 *
 * Search and sort are both seeded from and synced to the URL (`?q=`, `?sort=`),
 * so a filtered or re-ranked view is shareable and survives a refresh. `?sort=`
 * spells out only the NON-default mode: a bare /boards URL is the liked ranking,
 * which is also the one the server pre-renders.
 */
export function BoardsView({ initial }: { initial?: BoardListing[] }) {
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

  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "liked";
    return new URLSearchParams(window.location.search).get("sort") === "newest"
      ? "newest"
      : "liked";
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (sort === "newest") url.searchParams.set("sort", "newest");
    else url.searchParams.delete("sort");
    window.history.replaceState(null, "", url);
  }, [sort]);

  // One entry per ordering fetched. The server seed is the DEFAULT ordering, so
  // it lands under "liked" — an empty seed (a DB blip at render time) is left
  // unset rather than cached as an empty list, which is what makes the fetch
  // below the recovery path instead of a no-op.
  const [bySort, setBySort] = useState<
    Partial<Record<SortKey, BoardListing[]>>
  >(() => (initial && initial.length > 0 ? { liked: initial } : {}));

  useEffect(() => {
    if (bySort[sort]) return; // already held — no round trip
    let cancelled = false;
    const fill = (rows: BoardListing[]) =>
      setBySort((prev) => ({ ...prev, [sort]: rows }));
    fetch(`/api/dashboards?sort=${sort}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { boards?: BoardListing[] } | null) => {
        // A failed request leaves the key UNSET on purpose: an empty array here
        // would cache "there are no boards" from what was a network error, and
        // the effect would never try again. Unset keeps the other ordering on
        // screen (see `shown`) and lets a sort toggle retry.
        if (!cancelled && Array.isArray(d?.boards)) fill(d.boards);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sort, bySort]);

  const rows = bySort[sort];
  // While the other ordering is in flight — or after it failed — keep the rows
  // we have rather than blanking a grid that was full a moment ago. They are in
  // the wrong order for the selected sort, so the grid says so by dimming.
  const fallback = bySort[sort === "liked" ? "newest" : "liked"];
  const shown = rows ?? fallback ?? null;
  const reordering = rows === undefined && fallback !== undefined;

  const tokens = useMemo(() => frameSearchTokens(query), [query]);
  const searching = tokens.length > 0;

  // A board matches when every query token appears in its title, tags or
  // description. Description is searched for EVERY board now — it used to be
  // curated-only, back when it was structurally impossible for a community board
  // to have one.
  const boards = useMemo(() => {
    if (shown === null) return null;
    if (!searching) return shown;
    return shown.filter((d) => {
      const haystack =
        `${d.title} ${d.tags.join(" ")} ${d.description}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [shown, searching, tokens]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10">
        <div className="max-w-3xl">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            The <span className="text-indigo-200">board</span> gallery
          </h1>
          <p className="mt-3 text-base leading-relaxed text-white/75">
            Boards hand-built by us and published by the community, ranked
            together. Preview any one in the browser, then fork it onto your
            machine as a dashboard you own.
          </p>
          <SearchField
            label="Search boards"
            value={query}
            onChange={setQuery}
            className="mt-6"
          />
        </div>

        {/* Sort on the left, the publish CTA on the right — the two controls the
            list has, on one row. The toggle waits for data: a control that looks
            interactive over three skeleton cards invites a click that does
            nothing. The CTA does not — it leads somewhere real regardless. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {boards !== null ? (
            <div
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
              role="group"
              aria-label="Sort boards"
            >
              {(
                [
                  ["liked", "Most liked"],
                  ["newest", "Newest"],
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
          ) : (
            <span />
          )}
          <Link
            href="/editor"
            className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
          >
            Build &amp; publish yours →
          </Link>
        </div>
      </header>

      {/* `boards === null` is the pre-fetch state — a skeleton rather than an
          empty state, which would briefly claim there are no boards at all. */}
      {boards === null ? (
        <BoardGrid aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="zf-surface h-64 animate-pulse" />
          ))}
        </BoardGrid>
      ) : boards.length === 0 ? (
        // gap-1 rather than the centred default's gap-4: these are two lines of
        // one sentence, not a headline and a CTA.
        <EmptyState align="center" className="gap-1">
          <p className="text-sm text-white/65">
            {searching
              ? `No boards match “${query.trim()}”.`
              : "Nothing here yet."}
          </p>
          {!searching && (
            <p className="text-sm text-white/65">
              Be the first to{" "}
              <Link
                href="/editor"
                className="text-indigo-300 underline-offset-2 hover:underline"
              >
                build &amp; publish
              </Link>{" "}
              a board.
            </p>
          )}
        </EmptyState>
      ) : (
        <BoardGrid
          aria-busy={reordering}
          className={
            reordering ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          {boards.map((d) => (
            <DashboardCard
              key={d.id}
              href={`/dashboard/${d.id}`}
              title={d.title}
              description={d.description}
              tags={d.tags}
              frameCount={d.frameCount}
              // The board's REAL geometry, projected server-side, for every card
              // — community rows carry it too, and did well before the sections
              // merged; this grid was still synthesising theirs. `synthLayout` is
              // the fallback for a board whose frames failed the projection's
              // shape filter, where the alternative is an empty silhouette.
              frames={
                d.layout.length > 0 ? d.layout : synthLayout(d.id, d.frameCount)
              }
              thumbSrc={`/api/thumbs/${d.id}`}
              likes={d.likes}
              author={d.author}
            />
          ))}
        </BoardGrid>
      )}
    </main>
  );
}
