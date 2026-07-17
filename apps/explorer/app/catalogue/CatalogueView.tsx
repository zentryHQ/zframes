"use client";

import {
  DashboardRenderer,
  DashboardSpecSchema,
  FRAME_CATEGORIES,
  FramesProvider,
  frameMatchesSearch,
  frameSearchTokens,
  type AnyFrameDefinition,
  type FrameCategory,
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
import { providers, registry } from "@/app/lib/frames";
import { Input } from "@/app/components/ui/input";
import FramePlayground from "./FramePlayground";

const ROW = 96;
const GAP = 12;

// Stocks-first DISPLAY order for the public catalogue: lead with the
// equity-relevant families (live prices, single-company fundamentals & filings,
// macro context), then the crypto families, then everything else. This reorders
// the catalogue's sections only — the global FRAME_CATEGORIES order (which drives
// the editor palette and the AI catalogue) is deliberately left untouched.
const CATALOGUE_CATEGORY_ORDER: FrameCategory[] = [
  "markets", // Prices & Markets — equity perps lead
  "equities", // Equities & Filings
  "macro", // Macro & Rates — market context
  "crypto", // Crypto & On-chain
  "bitcoin", // Bitcoin Network
  "derivatives", // Derivatives & Options
  "sentiment", // Sentiment & News
  "portfolio",
  "journal",
  "tools",
  "layout",
  "games",
];
// Rank by the list above; any category not listed (e.g. a family added to core
// later) sorts to the end rather than silently jumping to the front.
const categoryRank = (key: FrameCategory) => {
  const i = CATALOGUE_CATEGORY_ORDER.indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};
const ORDERED_CATEGORIES = [...FRAME_CATEGORIES].sort(
  (a, b) => categoryRank(a.key) - categoryRank(b.key),
);

// Mount a frame's live renderer only when it scrolls near the viewport — 76
// frames rendering + fetching at once would jank the page and hammer the free
// APIs. Client-only (this whole view is ssr:false), so IntersectionObserver is safe.
function LazyMount({ minHeight, children }: { minHeight: number; children: ReactNode }) {
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

function FrameCard({ def }: { def: AnyFrameDefinition }) {
  const w = Math.min(def.layout?.w ?? 4, 12);
  const h = Math.min(def.layout?.h ?? 3, 4);
  const boxHeight = h * ROW + (h - 1) * GAP;

  const spec = useMemo(() => {
    const config = buildDefaultConfig(def);
    return DashboardSpecSchema.parse({
      title: def.name,
      grid: { mode: "flow-vertical", columns: w, rowHeight: ROW, gap: GAP, rows: h },
      frames: [
        { id: def.name, frame: def.name, position: { x: 0, y: 0, w, h }, config },
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
      <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2">
        <code className="font-mono text-xs text-white/70 transition-colors group-hover:text-indigo-200">
          {def.name}
        </code>
        {def.capabilities?.length ? (
          <span className="font-mono text-[10px] text-white/55">
            {def.capabilities.join(" · ")}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-white/50">static</span>
        )}
      </div>
    </div>
  );
}

export default function CatalogueView() {
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
  // so a search shrinks the heavy live-frame grid instead of mounting all 76.
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
      <main className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-12 max-w-3xl">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            The frame <span className="text-indigo-200">catalogue</span>
          </h1>
          <p className="mt-3 text-base leading-relaxed text-white/75">
            Every built-in frame, live and grouped by family. Each renders with a
            schema-default config — the same set an agent picks from when generating a
            dashboard.
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
                  <h2 className="text-lg font-semibold text-white">{cat.label}</h2>
                  <span className="font-mono text-xs text-white/55">{frames.length}</span>
                </div>
                <p className="mt-1.5 pl-4 text-sm text-white/60">{cat.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {frames.map((def) => (
                  <FrameCard key={def.name} def={def} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </FramesProvider>
  );
}
