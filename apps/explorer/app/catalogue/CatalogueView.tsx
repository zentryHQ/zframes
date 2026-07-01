"use client";

import {
  DashboardRenderer,
  DashboardSpecSchema,
  FRAME_CATEGORIES,
  FramesProvider,
  type AnyFrameDefinition,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/core/editor-symbols";
import { allFrames } from "@zframes/frames";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { providers, registry } from "@/app/lib/frames";

const ROW = 96;
const GAP = 12;

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
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <LazyMount minHeight={boxHeight}>
        <div style={{ height: boxHeight }}>
          <DashboardRenderer spec={spec} registry={registry} />
        </div>
      </LazyMount>
      <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
        <code className="text-xs text-white/70">{def.name}</code>
        {def.capabilities?.length ? (
          <span className="text-[10px] text-white/35">
            {def.capabilities.join(" · ")}
          </span>
        ) : (
          <span className="text-[10px] text-white/25">static</span>
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

  return (
    <FramesProvider providers={providers}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Frame catalogue</h1>
          <p className="mt-2 max-w-2xl text-white/60">
            Every built-in frame, live, grouped by family. Each renders with a
            schema-default config — the same set an agent picks from when generating a
            dashboard.
          </p>
        </header>

        {FRAME_CATEGORIES.map((cat) => {
          const frames = byCategory.get(cat.key);
          if (!frames?.length) return null;
          return (
            <section key={cat.key} className="mb-12">
              <h2 className="text-lg font-semibold text-white">{cat.label}</h2>
              <p className="mb-4 text-sm text-white/45">{cat.description}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {frames.map((def) => (
                  <FrameCard key={def.name} def={def} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </FramesProvider>
  );
}
