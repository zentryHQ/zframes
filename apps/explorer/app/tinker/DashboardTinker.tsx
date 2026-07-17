"use client";

import { DashboardEditor } from "@zframes/editor/editor";
import {
  DashboardSpecSchema,
  FRAME_CATEGORIES,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { allFrames } from "@zframes/frames";
import { useCallback, useRef, useState } from "react";
import "gridstack/dist/gridstack.min.css";
import { PublishDialog } from "@/app/lib/PublishDialog";
import { Button } from "@/app/components/ui/button";
import { providers, registry } from "@/app/lib/frames";

// Client-only module (the page dynamic-imports it ssr:false) — DashboardEditor
// (GridStack) + localStorage both run in the browser.
// Bumped from v1 (the old 3-frame starter) so the new all-frames default
// surfaces past any spec a returning browser had saved under the old key.
const STORAGE_KEY = "zframes:tinker-spec-v3";

const COLS = 12;

// The default tinker board is a showcase: every registered frame, grouped by
// category (a full-width heading per section), each seeded at its own natural
// `layout` size (falling back to 4×3). Frames are skyline bin-packed so the
// 12-col width fills cleanly with no ragged trailing holes: tallest-first, each
// frame dropped into the lowest columns it fits. `float:true` in the editor
// keeps these placements exactly as laid out.
function buildStarter() {
  const byCat = new Map<string, typeof allFrames>();
  for (const def of allFrames) {
    const key = def.category ?? "other";
    const bucket = byCat.get(key) ?? [];
    bucket.push(def);
    byCat.set(key, bucket);
  }
  // FRAME_CATEGORIES order first, then any stray categories not in the taxonomy.
  const order: string[] = FRAME_CATEGORIES.map((c) => c.key);
  for (const key of byCat.keys()) if (!order.includes(key)) order.push(key);
  const labelOf = (key: string) =>
    FRAME_CATEGORIES.find((c) => c.key === key)?.label ?? key;

  const frames: DashboardSpec["frames"] = [];
  // Per-column skyline: the current filled height (in rows) of each column.
  const skyline = new Array<number>(COLS).fill(0);
  let uid = 0;

  const dims = (def: (typeof allFrames)[number]) => ({
    w: Math.min(Math.max(def.layout?.w ?? 4, 1), COLS),
    h: Math.max(def.layout?.h ?? 3, 1),
  });
  const topOf = (x: number, w: number) => {
    let top = 0;
    for (let i = x; i < x + w; i++) top = Math.max(top, skyline[i]);
    return top;
  };
  const settle = (x: number, w: number, bottom: number) => {
    for (let i = x; i < x + w; i++) skyline[i] = bottom;
  };
  const maxSkyline = () => skyline.reduce((m, v) => Math.max(m, v), 0);

  // A full-width banner: lands below everything and resets the whole skyline,
  // so each section starts flush with no overlap and no cross-section gap.
  const banner = (id: string, config: Record<string, unknown>) => {
    const y = maxSkyline();
    frames.push({ id, frame: "heading", position: { x: 0, y, w: COLS, h: 1 }, config });
    settle(0, COLS, y + 1);
  };

  banner("tinker-intro", {
    title: "All frames",
    subtitle:
      "Every zframes frame at its natural size — drag, resize, tweak, then Save or Publish.",
  });

  for (const cat of order) {
    const defs = byCat.get(cat);
    if (!defs || defs.length === 0) continue;

    banner(`sec-${cat}`, { title: labelOf(cat) });

    // Tallest-first (then widest) so tall frames anchor the columns and shorter
    // ones tuck into the low gaps beside them — a denser skyline fill.
    const sorted = [...defs].sort((a, b) => {
      const da = dims(a);
      const db = dims(b);
      return db.h - da.h || db.w - da.w;
    });

    for (const def of sorted) {
      const { w, h } = dims(def);
      let bestX = 0;
      let bestTop = Infinity;
      for (let x = 0; x + w <= COLS; x++) {
        const top = topOf(x, w);
        if (top < bestTop) {
          bestTop = top;
          bestX = x;
        }
      }
      frames.push({
        id: `${def.name}-${uid++}`,
        frame: def.name,
        position: { x: bestX, y: bestTop, w, h },
        config: buildDefaultConfig(def),
      });
      settle(bestX, w, bestTop + h);
    }
  }

  return {
    version: "1.0.0",
    title: "Tinker board",
    author: "you",
    background: { type: "none" as const },
    // A touch more gutter between card borders than the 12px default.
    grid: { gap: 16 },
    frames,
  };
}

const STARTER = buildStarter();

function loadSpec(): DashboardSpec {
  const fallback = DashboardSpecSchema.parse(STARTER);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = DashboardSpecSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export default function DashboardTinker() {
  const [spec] = useState<DashboardSpec>(loadSpec);
  // The editor only reads `spec` at mount; onSave hands us the live spec, which
  // we keep in a ref so Publish always sends the latest edited state.
  const latest = useRef<DashboardSpec>(spec);
  const [saved, setSaved] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const onSave = useCallback(async (next: DashboardSpec) => {
    latest.current = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      /* storage unavailable — edits stay on screen */
    }
  }, []);

  return (
    <FramesProvider providers={providers}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Tinker</h1>
          <p className="text-xs text-white/55">
            Customise then Save (this browser), or Publish to a shareable link.
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={() => setShowPublish(true)}>
          Publish →
        </Button>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-4">
        <DashboardEditor spec={spec} registry={registry} onSave={onSave} />
      </main>

      {showPublish && (
        <PublishDialog getSpec={() => latest.current} onClose={() => setShowPublish(false)} />
      )}
      {saved ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div
            role="status"
            className="animate-dialog-in rounded-full border border-up/40 bg-up/15 px-4 py-1.5 text-sm text-up shadow-lg"
          >
            Saved to this browser
          </div>
        </div>
      ) : null}
    </FramesProvider>
  );
}
