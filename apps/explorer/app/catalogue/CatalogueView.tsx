"use client";

import {
  DashboardRenderer,
  DashboardSpecSchema,
  FRAME_CATEGORIES,
  FramesProvider,
  frameMatchesSearch,
  frameSearchTokens,
  type AnyFrameDefinition,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { allFrames } from "@zframes/frames";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
// The stocks-first section order + its "every family is ranked" typecheck guard
// moved to ./order so the server-rendered FrameIndex can share them — a Server
// Component cannot import this file (it is `ssr: false`) or @zframes/core.
import { ORDERED_CATEGORIES } from "@/app/catalogue/order";
import { PUBLIC_DEMO_ADDRESS, providers, registry } from "@/app/lib/frames";
import { LikeButton } from "@/app/lib/LikeButton";
import { LikeCount } from "@/app/lib/LikeCount";
import { useFrameLikes } from "@/app/lib/use-frame-likes";
import { Input } from "@/app/components/ui/input";
import FramePlayground from "./FramePlayground";
import { MinSize } from "./min-size";

const ROW = 96;
const GAP = 12;

// Mount a frame's live renderer only when it scrolls near the viewport — the
// whole catalogue rendering + fetching at once would jank the page and hammer
// the free APIs. Client-only (this whole view is ssr:false), so
// IntersectionObserver is safe.
function LazyMount({
  minHeight,
  children,
}: {
  minHeight: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ minHeight }}>
      {show ? children : null}
    </div>
  );
}

function FrameCard({
  def,
  likes,
  onLiked,
}: {
  def: AnyFrameDefinition;
  likes: number;
  onLiked: (name: string, total: number) => void;
}) {
  const w = Math.min(def.layout?.w ?? 4, 12);
  const h = Math.min(def.layout?.h ?? 3, 4);
  const boxHeight = h * ROW + (h - 1) * GAP;

  const spec = useMemo(() => {
    const config = buildDefaultConfig(def);
    // The `account: true` frames default to `source: "binance"`, which the
    // explorer cannot serve (no signed relay) — so a schema-default card is a
    // connect form whose button 404s. Point them at the same public wallet the
    // landing demos, so the family shows live holdings like every other family
    // shows live data. Guarded on the value, not the flag, so it no-ops if the
    // schema default ever changes.
    if (def.account && config.source === "binance") {
      config.source = "wallet";
      config.address = PUBLIC_DEMO_ADDRESS;
    }
    return DashboardSpecSchema.parse({
      title: def.name,
      grid: {
        mode: "flow-vertical",
        columns: w,
        rowHeight: ROW,
        gap: GAP,
        rows: h,
      },
      frames: [
        {
          id: def.name,
          frame: def.name,
          position: { x: 0, y: 0, w, h },
          config,
        },
      ],
    });
  }, [def, w, h]);

  return (
    <div className="card-lift hairline group flex flex-col overflow-hidden rounded-xl bg-black/20">
      <LazyMount minHeight={boxHeight}>
        {/* The outer tile IS the card here (hairline rim + footer). Flatten the
            frame's own chrome into it via the --zf-frame-* override hooks so the
            live preview sits flush instead of nesting a second bordered card. */}
        <div
          className="zf-flush"
          style={
            {
              height: boxHeight,
              "--zf-frame-border": "transparent",
              "--zf-frame-radius": "0px",
              "--zf-frame-shadow": "none",
              "--zf-frame-bg": "transparent",
            } as CSSProperties
          }
        >
          <DashboardRenderer spec={spec} registry={registry} />
        </div>
      </LazyMount>
      {/* The like button lives in the footer, not overlaid on the preview: the
          preview IS a live frame and a floating control would sit on top of real
          data. Capabilities truncate to make room — at four columns the card is
          narrow, and the name plus an affordance matter more than the full
          capability list, which is already only a hint. */}
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <code className="truncate font-mono text-xs text-white/70 transition-colors group-hover:text-indigo-200">
            {def.name}
          </code>
          {/* The size floor sits in the ALWAYS-visible half of the footer, not
              beside the capability list that hides below `sm`. It is planning
              information — you need it while choosing frames for a board, not
              after — and the preview above deliberately shows the frame at its
              DEFAULT span, which says nothing about how far it can shrink. */}
          <MinSize layout={def.layout} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {def.capabilities?.length ? (
            <span className="hidden truncate font-mono text-[10px] text-white/55 sm:inline">
              {def.capabilities.join(" · ")}
            </span>
          ) : (
            <span className="hidden font-mono text-[10px] text-white/50 sm:inline">
              static
            </span>
          )}
          <LikeButton
            kind="frame"
            id={def.name}
            initialTotal={likes}
            compact
            onLiked={onLiked}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The most-liked strip. Charter: it sits BESIDE the category grouping (which stays
 * the default browse order, untouched) and appears **only once at least one frame
 * has a like**.
 *
 * That condition is the point. A `0` badge on a card is a true statement about that
 * frame; a list *labelled* "most liked" showing six frames tied at 0 is not. So the
 * strip stays absent on day one rather than launching as a lie.
 *
 * Compact rows, not live frames — the page already mounts 255 of those, and the
 * strip's job is legible ranking, not another preview. This is a deliberate
 * exception to "show the live thing".
 */
function MostLikedStrip({ likes }: { likes: Record<string, number> }) {
  const top = useMemo(() => {
    return Object.entries(likes)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
  }, [likes]);

  if (top.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="h-4 w-1 rounded-full bg-brand" />
        <h2 className="text-lg font-semibold text-white">Most liked</h2>
        <span className="font-mono text-xs text-white/55">
          what people are actually into
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-4">
        {top.map(([name, n], i) => (
          <a
            key={name}
            href={`?q=${encodeURIComponent(name)}`}
            className="zf-press hairline group inline-flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5 transition-colors hover:bg-indigo-500/10"
          >
            <span className="font-mono text-[10px] text-white/40 tabular-nums">
              {i + 1}
            </span>
            <code className="font-mono text-xs text-white/75 group-hover:text-indigo-100">
              {name}
            </code>
            <LikeCount total={n} />
          </a>
        ))}
      </div>
    </section>
  );
}

export default function CatalogueView() {
  const { likes, bump, loaded } = useFrameLikes();
  const byCategory = useMemo(() => {
    const map = new Map<string, AnyFrameDefinition[]>();
    for (const def of allFrames) {
      const list = map.get(def.category) ?? [];
      list.push(def);
      map.set(def.category, list);
    }
    return map;
  }, []);

  const total = allFrames.length;

  // Free-text search, seeded from and synced to the URL (?q=…) so a filtered
  // view is shareable and survives a refresh. This view is client-only
  // (page.tsx imports it ssr:false), so reading window here is safe and dodges
  // the Next 15 useSearchParams-needs-Suspense prerender constraint. We use the
  // SAME matcher as the editor palette (@zframes/spec), so customise and browse
  // filter identically.
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
  // Filter once (label / description / name / category label) and drop empty
  // families. Filtering BEFORE render also means LazyMount only mounts matches,
  // so a search shrinks the heavy live-frame grid instead of mounting the lot.
  const sections = useMemo(() => {
    return ORDERED_CATEGORIES.map((cat) => {
      const all = byCategory.get(cat.key) ?? [];
      const frames = searching
        ? all.filter((def) => frameMatchesSearch(def, cat.label, tokens))
        : all;
      return { cat, frames };
    }).filter((section) => section.frames.length > 0);
  }, [byCategory, searching, tokens]);
  const shown = useMemo(
    () => sections.reduce((n, section) => n + section.frames.length, 0),
    [sections],
  );

  return (
    <FramesProvider providers={providers}>
      {/* No <main> and no <h1> here. This whole tree is loaded with `ssr: false`
          (it renders live frames against browser-only APIs), so anything inside
          it is invisible to a crawler that does not run JavaScript — which is
          most answer-engine crawlers. The page's heading, intro and the
          full-text frame index therefore live in the SERVER component that
          renders this one (`page.tsx` + `FrameIndex.tsx`), and it owns the
          <main> landmark and the page padding too. */}
      <div>
        <header className="mb-12 max-w-3xl">
          <div className="relative max-w-md">
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
              placeholder="Search frames…"
              aria-label="Search frames"
              className="border-white/10 py-2.5 pl-10 pr-3 focus:border-indigo-300/50 focus:bg-white/[0.06]"
            />
          </div>
          <p className="mt-4 font-mono text-xs text-white/60">
            {searching
              ? `${shown} of ${total} frames`
              : `${total} frames · ${FRAME_CATEGORIES.length} families`}
          </p>
        </header>

        {/* Interactive hero: prove frames reflow + drag before the static browse
            grid. Hidden while searching so results stay the focus. */}
        {!searching && <FramePlayground />}

        {/* Hidden while searching (results stay the focus) and until the counts
            have landed, so it can't flash in empty and then reorder. */}
        {!searching && loaded && <MostLikedStrip likes={likes} />}

        {sections.length === 0 ? (
          <p className="text-sm text-white/55">
            No frames match “{query.trim()}”.
          </p>
        ) : (
          sections.map(({ cat, frames }) => (
            <section key={cat.key} className="mb-14">
              <div className="mb-5 border-b border-white/[0.07] pb-3">
                <div className="flex items-baseline gap-3">
                  <span className="h-4 w-1 rounded-full bg-brand" />
                  <h2 className="text-lg font-semibold text-white">
                    {cat.label}
                  </h2>
                  <span className="font-mono text-xs text-white/55">
                    {frames.length}
                  </span>
                </div>
                <p className="mt-1.5 pl-4 text-sm text-white/60">
                  {cat.description}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {frames.map((def) => (
                  <FrameCard
                    key={def.name}
                    def={def}
                    likes={likes[def.name] ?? 0}
                    onLiked={bump}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </FramesProvider>
  );
}
