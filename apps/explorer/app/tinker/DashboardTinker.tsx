"use client";

import { DashboardEditor } from "@zframes/editor/editor";
import {
  DashboardRenderer,
  DashboardSpecSchema,
  FRAME_CATEGORIES,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import "gridstack/dist/gridstack.min.css";
import { DashboardBackground } from "@/app/lib/DashboardBackground";
import { PublishDialog } from "@/app/lib/PublishDialog";
import { Button } from "@/app/components/ui/button";
import { frameDefs, providers, registry } from "@/app/lib/frames";
import { DESKTOP_EDIT_QUERY, useMediaQuery } from "@/app/lib/use-media-query";

// Client-only module (the page dynamic-imports it ssr:false) — DashboardEditor
// (GridStack) + localStorage both run in the browser.
// Bumped from v1 (the old 3-frame starter) so the new all-frames default
// surfaces past any spec a returning browser had saved under the old key.
const STORAGE_KEY = "zframes:tinker-spec-v3";

// One-shot handoff slot written by /dashboard/[id]'s "Edit this board" button
// (must match TINKER_HANDOFF_KEY there). Read before the saved board, cleared
// after mount — a reload returns to the visitor's own saved board unless they
// saved the fork over it.
const HANDOFF_KEY = "zframes:tinker-handoff";

const COLS = 12;

// The default tinker board is a showcase: every registered frame, grouped by
// category (a full-width heading per section), each seeded at its own natural
// `layout` size (falling back to 4×3). Frames are skyline bin-packed so the
// 12-col width fills cleanly with no ragged trailing holes: tallest-first, each
// frame dropped into the lowest columns it fits. `float:true` in the editor
// keeps these placements exactly as laid out.
function buildStarter() {
  const byCat = new Map<string, typeof frameDefs>();
  for (const def of frameDefs) {
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

  const dims = (def: (typeof frameDefs)[number]) => ({
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
    frames.push({
      id,
      frame: "heading",
      position: { x: 0, y, w: COLS, h: 1 },
      config,
    });
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

function loadSpec(): { spec: DashboardSpec; handoff: boolean } {
  // A board handed off from /dashboard/[id]'s "Edit this board" wins — the
  // visitor explicitly asked to edit THAT board. Read-only here; the key is
  // removed in an effect after mount, NOT in this initializer (StrictMode runs
  // initializers twice in dev, and consume-on-first-read would hand the second
  // run nothing).
  try {
    const raw = window.localStorage.getItem(HANDOFF_KEY);
    if (raw) {
      const parsed = DashboardSpecSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return { spec: parsed.data, handoff: true };
    }
  } catch {
    // Storage unavailable / corrupt JSON — fall through to the saved board.
  }
  // Then the saved spec: buildStarter() packs ~285 default configs, so it is
  // built lazily, only when this browser has nothing usable saved.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = DashboardSpecSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return { spec: parsed.data, handoff: false };
    }
  } catch {
    // Storage unavailable / corrupt JSON — fall through to the starter.
  }
  return { spec: DashboardSpecSchema.parse(buildStarter()), handoff: false };
}

export default function DashboardTinker() {
  const [{ spec, handoff }] = useState(loadSpec);
  // Consume the handoff AFTER mount (see loadSpec for why not in the
  // initializer): from here on, a reload shows the visitor's own saved board.
  useEffect(() => {
    try {
      window.localStorage.removeItem(HANDOFF_KEY);
    } catch {
      /* storage unavailable — nothing to clear */
    }
  }, []);
  // Editing needs desktop width + a fine pointer (same gate as the runtime):
  // the 12-column GridStack is ~27px per column on a phone and its per-card
  // controls are hover-revealed. Everything narrower gets the read-only
  // renderer, which reflows through FRAME_CSS on its own.
  const canEdit = useMediaQuery(DESKTOP_EDIT_QUERY);
  // The editor only reads `spec` at mount; onSave hands us the live spec, which
  // we keep in a ref so Publish always sends the latest edited state.
  const latest = useRef<DashboardSpec>(spec);
  const [showPublish, setShowPublish] = useState(false);

  // Live cosmetics the editor reports while customising (null = not editing →
  // fall back to the saved spec), mirroring the runtime's App.tsx: the
  // full-bleed <DashboardBackground> renders HERE, outside the editor, so a
  // scene swap / opacity drag / gradient toggle in the Cosmetics rail repaints
  // the real backdrop live instead of only after Save + reload. The picked
  // values still land in the spec via the editor's own collectSpec.
  const [liveBackground, setLiveBackground] = useState<
    DashboardSpec["background"] | null
  >(null);
  const [liveHue, setLiveHue] = useState<number | null>(null);
  const [liveSat, setLiveSat] = useState<number | null>(null);

  const onSave = useCallback(async (next: DashboardSpec) => {
    latest.current = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      toast.success("Saved to this browser");
    } catch {
      // Storage unavailable (private mode / quota) — edits stay on screen.
      toast.error("Couldn't save to this browser — your edits stay on screen.");
    }
  }, []);

  return (
    <FramesProvider providers={providers}>
      {/* The board's own background (live edit wins, else the saved spec) —
          same z-[-1] wrapper as /dashboard/[id]: below the header/footer
          chrome, pointer-events-none so a fixed inset-0 layer never swallows
          clicks. AppShell suppresses the site Aurora on /tinker; a board with
          `type:"none"` falls back to the default Aurora inside this component. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
        <DashboardBackground
          background={liveBackground ?? spec.background}
          accentHue={liveHue ?? spec.theme.accentHue}
          accentSat={liveSat ?? spec.theme.accentSat}
        />
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 pt-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Tinker</h1>
          <p className="text-xs text-white/55">
            {!canEdit
              ? "Editing needs a desktop browser — this is a read-only preview."
              : handoff
                ? `Editing a copy of “${spec.title}” — Save keeps it in this browser, or Publish a shareable link.`
                : "Customise then Save (this browser), or Publish to a shareable link."}
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={() => setShowPublish(true)}>
          Publish →
        </Button>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-4">
        {canEdit ? (
          <DashboardEditor
            spec={spec}
            registry={registry}
            onSave={onSave}
            onBackgroundChange={setLiveBackground}
            onAccentHueChange={setLiveHue}
            onAccentSatChange={setLiveSat}
          />
        ) : (
          <DashboardRenderer spec={spec} registry={registry} />
        )}
      </main>

      {showPublish && (
        <PublishDialog
          getSpec={() => latest.current}
          onClose={() => setShowPublish(false)}
        />
      )}
    </FramesProvider>
  );
}
