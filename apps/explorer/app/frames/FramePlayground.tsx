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
import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { frameDefs, providers, registry } from "@/app/lib/frames";
import { useMediaQuery } from "@/app/lib/use-media-query";

// Same GridStack tuning the real editor uses, so drag + resize feel
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

// Hoisted: constant JSX, so the two stylesheets never re-render (an inline
// <style> child re-renders as a text diff on every parent render). FRAME_CSS
// carries the shared href/precedence so React 19 dedupes it with the
// renderer's copies elsewhere on the page.
const PLAYGROUND_STYLES = (
  <>
    <style href="zframes-frame-css" precedence="zframes">
      {FRAME_CSS}
    </style>
    <style href="zframes-playground-css" precedence="zframes">
      {BOARD_CSS}
    </style>
  </>
);

type PickerGroup = {
  cat: (typeof FRAME_CATEGORIES)[number];
  frames: AnyFrameDefinition[];
};

// Memo'd: the ~285-option select otherwise re-renders on every rect update
// while dragging/resizing (groups and onChange are stable; only value moves).
const FramePicker = memo(function FramePicker({
  groups,
  value,
  onChange,
}: {
  groups: PickerGroup[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <select
      id="playground-frame"
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
  );
});

export default function FramePlayground() {
  // Frame families → an <optgroup>-per-family picker, so switching the featured
  // frame proves *every* frame is dynamic, not just the one we lead with.
  const groups = useMemo<PickerGroup[]>(() => {
    const byCat = new Map<string, AnyFrameDefinition[]>();
    for (const def of frameDefs) {
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

  const [name, setName] = useState(
    () =>
      (registry.has("price-liveline")
        ? "price-liveline"
        : frameDefs[0]?.name) ?? "",
  );
  const def = registry.get(name) ?? frameDefs[0];
  const bounds = useMemo(() => boundsOf(def), [def]);
  // The 12-column GridStack is ~23px per column inside this card on a phone —
  // unreadable and not a workable touch target. Below tablet width the demo
  // renders the frame statically at its default size instead.
  const canDrag = useMediaQuery("(min-width: 768px)");

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
    if (!canDrag || !gridEl.current) return;
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
    )!;
    gridRef.current = grid;

    // No `drag` subscription: it fires per pointer-move and the readout only
    // changes on cell boundaries — `change` (moves) + `resize` cover it.
    const sync = (n?: GridStackNode | null) => {
      if (!n) return;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const w = n.w ?? 0;
      const h = n.h ?? 0;
      // Same-value bail: keep the previous object so React skips the re-render.
      setRect((prev) =>
        prev.x === x && prev.y === y && prev.w === w && prev.h === h
          ? prev
          : { x, y, w, h },
      );
    };
    grid.on("change", (_e, nodes) => sync((nodes as GridStackNode[])?.[0]));
    grid.on("resize", (_e, el) =>
      sync((el as GridItemHTMLElement)?.gridstackNode),
    );

    return () => {
      grid.destroy(false);
      gridRef.current = null;
    };
  }, [canDrag]);

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
  }, [name, def, canDrag]);

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
      {PLAYGROUND_STYLES}
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
          <FramePicker groups={groups} value={name} onChange={pickFrame} />
          <div
            className={`${
              canDrag ? "inline-flex" : "hidden"
            } overflow-hidden rounded-lg border border-white/10`}
          >
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
            {/* rect only updates while the GridStack board is live. */}
            {canDrag ? rect.w : bounds.defW}&thinsp;&times;&thinsp;
            {canDrag ? rect.h : bounds.defH}
            <span className="ml-2 text-white/35">
              size {bounds.minW}&times;{bounds.minH}&ndash;{bounds.maxW}&times;
              {bounds.maxH}
            </span>
          </span>
        </div>

        {canDrag ? (
          /* The real GridStack board. */
          <div ref={gridEl} className="grid-stack" />
        ) : (
          /* Static stand-in below tablet width: the frame at its default size,
             no drag surface. Its own FramesProvider mirrors the detached
             GridStack root — same `providers` singleton, no duplicate sockets. */
          <div
            className="relative"
            style={{ height: Math.min(bounds.defH, 4) * 88 }}
          >
            <FramesProvider providers={providers}>
              <FrameContent
                instance={{
                  id: def.name,
                  frame: def.name,
                  position: { x: 0, y: 0, w: bounds.defW, h: bounds.defH },
                  config: buildDefaultConfig(def),
                }}
                registry={registry}
                className="zf-fill"
              />
            </FramesProvider>
          </div>
        )}

        <p className="mt-4 font-mono text-[11px] text-white/45">
          {canDrag
            ? "drag the frame to move · drag the corner to resize · snaps to the grid, live"
            : "open on a wider screen to drag and resize the frame live"}
        </p>
      </div>
    </section>
  );
}
