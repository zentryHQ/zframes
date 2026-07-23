"use client";

import {
  FRAME_CATEGORIES,
  FRAME_CSS,
  FrameContent,
  FramesProvider,
  type AnyFrameDefinition,
  type FrameInstance,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { allFrames } from "@zframes/frames";
import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { providers, registry } from "@/app/lib/frames";

// Same GridStack tuning the real editor/Tinker uses, so drag + resize feel
// IDENTICAL here: 12 responsive columns, a fixed row height, half-gap margins,
// float (keep explicit placement, don't gravity-pack) and animated moves.
const COLUMNS = 12;
const CELL = 96;
const GAP = 12;
// Keep the board a few rows tall even for a small frame, so there's empty space
// to drag the frame AROUND — otherwise a 3-row frame leaves nowhere to move.
const MIN_ROW = 5;
const MAX_H = 6;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

/** A frame's placement envelope from its (optional) editor `layout` hints,
 *  clamped to the board. Many frames omit maxW/maxH — synthesise headroom above
 *  the default so the "grows bigger" story still lands. */
function boundsOf(def: AnyFrameDefinition) {
  const defW = clamp(def.layout?.w ?? 4, 1, COLUMNS);
  const defH = clamp(def.layout?.h ?? 3, 1, MAX_H);
  const minW = clamp(def.layout?.minW ?? 1, 1, defW);
  const minH = clamp(def.layout?.minH ?? 1, 1, defH);
  const maxW = clamp(
    def.layout?.maxW ?? Math.min(defW + 3, COLUMNS),
    defW,
    COLUMNS,
  );
  const maxH = clamp(
    def.layout?.maxH ?? Math.min(defH + 2, MAX_H),
    defH,
    MAX_H,
  );
  return { defW, defH, minW, minH, maxW, maxH };
}

// Board chrome: neutralise GridStack's default item background/padding so the
// frame's own .zf-frame card is the only surface, and give the board a floor so
// the empty cells read as draggable space.
const BOARD_CSS = `
.zf-playground .grid-stack { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
.zf-playground .grid-stack-item-content { inset: 0; overflow: hidden; border-radius: 12px; background: transparent; }
.zf-playground .zf-fill { width: 100%; height: 100%; }
`;

export default function FramePlayground() {
  // Frame families → an <optgroup>-per-family picker, so switching the featured
  // frame proves *every* frame is dynamic, not just the one we lead with.
  const groups = useMemo(() => {
    const byCat = new Map<string, AnyFrameDefinition[]>();
    for (const def of allFrames) {
      const list = byCat.get(def.category) ?? [];
      list.push(def);
      byCat.set(def.category, list);
    }
    return FRAME_CATEGORIES.map((cat) => ({
      cat,
      frames: (byCat.get(cat.key) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    })).filter((g) => g.frames.length > 0);
  }, []);

  const byName = useMemo(() => {
    const m = new Map<string, AnyFrameDefinition>();
    for (const def of allFrames) m.set(def.name, def);
    return m;
  }, []);

  const [name, setName] = useState(
    () =>
      (byName.has("price-liveline") ? "price-liveline" : allFrames[0]?.name) ??
      "",
  );
  const def = byName.get(name) ?? allFrames[0];
  const bounds = useMemo(() => boundsOf(def), [def]);

  const [rect, setRect] = useState(() => ({
    x: 0,
    y: 0,
    w: bounds.defW,
    h: bounds.defH,
  }));

  const gridEl = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridStack | null>(null);
  const itemRef = useRef<GridItemHTMLElement | null>(null);
  const rootRef = useRef<Root | null>(null);

  // 1) Spin up the real GridStack once. Its 'change'/'resize'/'drag' events feed
  //    the size/position readout; the frame itself lives in the item's content
  //    node and refits via its own ResizeObserver — no spec re-parse.
  useEffect(() => {
    if (!gridEl.current) return;
    const grid = GridStack.init(
      {
        column: COLUMNS,
        cellHeight: CELL,
        margin: GAP / 2,
        float: true,
        animate: true,
        minRow: MIN_ROW,
      },
      gridEl.current,
    );
    gridRef.current = grid;

    const sync = (n?: GridStackNode | null) => {
      if (!n) return;
      setRect({ x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 0, h: n.h ?? 0 });
    };
    grid.on("change", (_e, nodes) => sync((nodes as GridStackNode[])?.[0]));
    grid.on("resize", (_e, el) =>
      sync((el as GridItemHTMLElement)?.gridstackNode),
    );
    grid.on("drag", (_e, el) =>
      sync((el as GridItemHTMLElement)?.gridstackNode),
    );

    return () => {
      grid.destroy(false);
      gridRef.current = null;
    };
  }, []);

  // 2) (Re)build the single frame item whenever the featured frame changes.
  //    Mirrors the editor's buildItemEl + renderInstance: an imperative
  //    grid-stack-item whose content hosts a React root rendering FrameContent.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const b = boundsOf(def);

    // Tear down the previous item + root.
    if (rootRef.current) {
      const r = rootRef.current;
      rootRef.current = null;
      queueMicrotask(() => r.unmount());
    }
    grid.removeAll(true);
    grid.el.querySelectorAll(".grid-stack-item").forEach((n) => n.remove());

    const el = document.createElement("div") as GridItemHTMLElement;
    el.className = "grid-stack-item";
    el.setAttribute("gs-x", "0");
    el.setAttribute("gs-y", "0");
    el.setAttribute("gs-w", String(b.defW));
    el.setAttribute("gs-h", String(b.defH));
    el.setAttribute("gs-min-w", String(b.minW));
    el.setAttribute("gs-min-h", String(b.minH));
    el.setAttribute("gs-max-w", String(b.maxW));
    el.setAttribute("gs-max-h", String(b.maxH));
    const content = document.createElement("div");
    content.className = "grid-stack-item-content";
    el.appendChild(content);
    grid.el.appendChild(el);
    grid.makeWidget(el);
    itemRef.current = el;

    // The content root is detached from this component's React tree, so it needs
    // its OWN FramesProvider — but with the SAME `providers` singleton, so it
    // reuses the shared instances (no duplicate WebSocket).
    const instance: FrameInstance = {
      id: def.name,
      frame: def.name,
      position: { x: 0, y: 0, w: b.defW, h: b.defH },
      config: buildDefaultConfig(def),
    };
    const root = createRoot(content);
    rootRef.current = root;
    root.render(
      <FramesProvider providers={providers}>
        <FrameContent
          instance={instance}
          registry={registry}
          className="zf-fill"
        />
      </FramesProvider>,
    );
    setRect({ x: 0, y: 0, w: b.defW, h: b.defH });
  }, [name, def]);

  const pickFrame = useCallback((next: string) => setName(next), []);

  // Presets resize through GridStack itself (grid.update animates + emits change),
  // so a preset click feels like a drag, not a jump.
  const applySize = useCallback((w: number, h: number) => {
    const grid = gridRef.current;
    const el = itemRef.current;
    if (grid && el) grid.update(el, { w, h });
  }, []);

  const presets: { label: string; w: number; h: number; title: string }[] = [
    { label: "S", w: bounds.minW, h: bounds.minH, title: "Smallest" },
    { label: "M", w: bounds.defW, h: bounds.defH, title: "Default" },
    { label: "L", w: bounds.maxW, h: bounds.maxH, title: "Largest" },
  ];
  const isActive = (w: number, h: number) => rect.w === w && rect.h === h;

  return (
    <section className="zf-playground mb-14">
      <style>{FRAME_CSS}</style>
      <style>{BOARD_CSS}</style>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-400/[0.08] px-3 py-1 text-xs font-medium tracking-wide text-indigo-100">
            Try it
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Drag it. Resize it. It&rsquo;s live.
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/65">
            This is the real editor grid. Drag the frame to move it, drag its
            bottom-right corner to resize — it reflows live, exactly like
            customising your own dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="playground-frame">
            Featured frame
          </label>
          <select
            id="playground-frame"
            value={name}
            onChange={(e) => pickFrame(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 font-mono text-xs text-white outline-none transition-colors hover:border-white/20 focus:border-indigo-300/50"
          >
            {groups.map((g) => (
              <optgroup key={g.cat.key} label={g.cat.label}>
                {g.frames.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="inline-flex overflow-hidden rounded-lg border border-white/10">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                title={`${p.title} · ${p.w}×${p.h}`}
                onClick={() => applySize(p.w, p.h)}
                className={`px-3 py-2 font-mono text-xs transition-colors ${
                  isActive(p.w, p.h)
                    ? "bg-indigo-400/20 text-indigo-100"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hairline rounded-2xl bg-black/25 p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-xs text-white/55">{def.name}</span>
          <span className="font-mono text-xs tabular-nums text-white/70">
            {rect.w}&thinsp;&times;&thinsp;{rect.h}
            <span className="ml-2 text-white/35">
              size {bounds.minW}&times;{bounds.minH}&ndash;{bounds.maxW}&times;
              {bounds.maxH}
            </span>
          </span>
        </div>

        {/* The real GridStack board. */}
        <div ref={gridEl} className="grid-stack" />

        <p className="mt-4 font-mono text-[11px] text-white/45">
          drag the frame to move &middot; drag the corner to resize &middot;
          snaps to the grid, live
        </p>
      </div>
    </section>
  );
}
