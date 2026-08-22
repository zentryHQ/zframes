import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { Redo2, SlidersHorizontal, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./editor.css";
import { FrameConfigDialog } from "./editor-config";
import { useCosmetics, type LiveCosmetics } from "./editor-cosmetics";
import {
  CosmeticsRail,
  type CosmeticSectionKey,
} from "./editor-cosmetics-rail";
import { RailSearch } from "./editor-rail";

// The cosmetic half of a spec — what `onLiveChange` reports. Re-exported here
// because a host wiring the callback imports the component from this subpath.
export type { LiveCosmetics } from "./editor-cosmetics";
import {
  colsForHorizontal,
  posFor,
  seedHorizontal,
  type LayoutMode,
} from "./editor-grid";
import { useEditorGridController } from "./editor-grid-controller";
import { collectGroupChildren } from "./editor-groups";
import { useSymbolUniverse } from "./editor-symbols";
import {
  baselineOf,
  canRedo,
  canUndo,
  framesEqual,
  historyLimitFor,
  initHistory,
  isDirty,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from "./editor-history";
import {
  FRAME_CATEGORIES,
  type AnyFrameDefinition,
  type FrameCategory,
  type FrameRegistry,
} from "@zframes/spec/frame";
import { frameMatchesSearch, frameSearchTokens } from "@zframes/spec/catalogue";
import {
  DashboardCurrencyProvider,
  FRAME_CSS,
  useProviders,
} from "@zframes/core";
import {
  type DashboardSpec,
  type FrameInstance,
  type GridPosition,
} from "@zframes/spec/spec";

/** Trailing window used to collapse a continuous slider drag into ONE undo step.
 *  Long enough to span the gaps in a slow drag, short enough that two deliberate
 *  tweaks stay separately undoable. */
const COMMIT_DEBOUNCE_MS = 400;

/** How long the "Frame removed — Undo" toast stays up. */
const UNDO_TOAST_MS = 7000;

/**
 * Interactive, in-browser dashboard editor — a drag/resize/add/delete
 * "customise mode" on a GridStack 12-column grid.
 *
 * Edits round-trip the human-editable dashboard.json: `onSave` receives the
 * full updated spec, and the host writes it back to disk (dev) or downloads
 * it. The artifact the agent generates and the one a human drags around stay
 * the same file.
 *
 * GridStack owns the DOM of each grid item, so every frame renders into its
 * own React root mounted in the item's content node. The roots reuse the
 * host's shared provider instances via FramesProvider (no duplicate WebSocket
 * connections).
 */
export function DashboardEditor({
  spec,
  registry,
  onSave,
  customiseButtonTarget,
  onModeChange,
  onLiveChange,
}: {
  spec: DashboardSpec;
  registry: FrameRegistry;
  /** Persist the edited spec. If omitted, Save downloads a dashboard.json. */
  onSave?: (next: DashboardSpec) => void | Promise<void>;
  /** Optional host slot for the collapsed Customise icon. */
  customiseButtonTarget?: HTMLElement | null;
  /** Notified on every layout-mode change so the host can react to it live —
   *  flow-horizontal goes full-bleed, which means dropping the page's centred
   *  max-width, and that lives on the host's <main>, not the editor. */
  onModeChange?: (mode: DashboardSpec["grid"]["mode"]) => void;
  /**
   * Notified on every cosmetic change — the live drag, a Reset, a preset, an
   * undo, a Cancel-restore — with the whole cosmetic half of the spec.
   *
   * Chrome the editor doesn't own has to follow the sliders live: the page
   * header and the `:root`-scoped chart tokens, the root font size (chart text
   * is rem-based, so nothing but the root font size scales it), the ticker
   * tape's --zf-up/--zf-down, and the full-bleed backdrop. All of that sits
   * ABOVE .zf-editor. This was seven separate callbacks, so every new cosmetic
   * meant remembering to add an eighth — and a host wiring six of them looked
   * exactly like a host wiring all seven.
   *
   * Layout MODE keeps its own callback: it isn't a repaint, it's a grid rebuild.
   */
  onLiveChange?: (cosmetics: LiveCosmetics | null) => void;
}) {
  const providers = useProviders();

  // The editor's own root. Stable across grid re-inits (switchMode tears the
  // GridStack down and builds a new one), so it's what the customise-mode hover
  // delegation listens on — see decorateChain.
  const editorRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Mirrors the `mode` state for the []-deps GridStack callbacks (collectSpec,
  // and the controller's buildItemEl / captureLayout) that must read the
  // *current* mode without being re-created. switchMode sets it before
  // re-initialising the grid.
  const modeRef = useRef<LayoutMode>(spec.grid.mode);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo/redo, Cancel, and the dirty indicator all read from ONE linear history
  // of whole-spec snapshots (see editor-history.ts for why snapshots rather than
  // a command stack). Entry 0 is the state customise mode opened on, so Cancel is
  // "apply the baseline" and dirty is "index !== 0" — no parallel bookkeeping.
  const historyRef = useRef<History<DashboardSpec>>(initHistory(spec));
  // Mirror of the ref for the toolbar's disabled/dirty states. The ref is what
  // the []-deps callbacks read; this is what re-renders the buttons.
  const [historyState, setHistoryState] = useState(() => ({
    undo: false,
    redo: false,
    dirty: false,
  }));
  const publishHistory = useCallback(() => {
    const h = historyRef.current;
    setHistoryState({
      undo: canUndo(h),
      redo: canRedo(h),
      dirty: isDirty(h),
    });
  }, []);
  // Timestamp until which commits are ignored — applySpec sets it so writing an
  // undone snapshot back isn't recorded as a fresh edit.
  const suppressCommitUntilRef = useRef(0);
  // Indirection for the GridStack handlers, which are registered once at grid
  // init and must reach the *current* commitHistory (defined far below, since it
  // depends on collectSpec).
  const commitHistoryRef = useRef<(() => void) | null>(null);

  const [editing, setEditing] = useState(false);
  // Save is in flight (the host is writing dashboard.json). Disables the toolbar
  // so the same spec can't be submitted twice.
  const [saving, setSaving] = useState(false);
  // Why the last save failed, if it did — shown in the toolbar so a rejected
  // write is visible instead of looking exactly like a successful one.
  const [saveError, setSaveError] = useState<string | null>(null);
  // The frame the last delete removed, kept so it can be put back with one click.
  // The history already holds the state to undo to; this only drives the toast.
  const [removed, setRemoved] = useState<{ id: string; label: string } | null>(
    null,
  );
  // Mirror for the []-deps callbacks (rebuildGrid, the keyboard handler) that
  // must read the *current* mode without being re-created on every toggle.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const symbolUniverse = useSymbolUniverse(providers, editing);
  const [count, setCount] = useState(spec.frames.length);
  // Every dashboard-wide cosmetic — accent, surface tint, gain/loss, layout
  // mode, grid geometry, card surface, typography, backdrop, currency — lives in
  // ONE hook (editor-cosmetics.ts), which also owns the `--zf-*` style bag, the
  // spec slices `collectSpec` merges, the preset match, and the live report the
  // host repaints from. It used to be ~30 sibling useStates read by four
  // separate concerns, so adding a knob meant touching all four — and a missed
  // one failed silently: the slider moved, the board looked right, and the value
  // never reached the saved file.
  const cosmetics = useCosmetics({ spec, onLiveChange });
  const cos = cosmetics.values;
  // Referentially stable (useCallback with no deps), so callbacks below may
  // depend on it without being re-created on every cosmetic change.
  const setCosmetic = cosmetics.set;
  const applyCosmetics = cosmetics.apply;
  // True during a mode swap — drives the blur+fade that masks the structural
  // reflow between vertical and horizontal (the two layouts can't morph, so we
  // dissolve through, per the design-eng "blur to mask imperfect transitions").
  const [switching, setSwitching] = useState(false);
  // Which rail panel is showing: dashboard-wide cosmetics (accent/layout/
  // appearance), the add-a-frame palette, or the board's event markers. The
  // rail used to stack both; the tabs split them so theme knobs and frame
  // management each get the full panel.
  const [railTab, setRailTab] = useState<"cosmetics" | "frames">("frames");
  // Which Cosmetics sections are expanded. Presets opens by default — it's the
  // one-click route to a whole look, so it should be the first thing offered;
  // everything else is opened deliberately.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set<CosmeticSectionKey>(["presets"]),
  );
  const [cosmeticQuery, setCosmeticQuery] = useState("");
  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // Which frame's settings dialog is open (null = none). The per-item gear
  // button (added imperatively in decorateItem) flips it; the portaled
  // FrameConfigDialog reads it. The ref mirrors it for the imperative deleteItem
  // closure, so deleting the frame being edited also closes the dialog.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  editingIdRef.current = editingId;

  // Mirror the live layout mode up to the host: flow-horizontal is full-bleed,
  // which means the host's centred max-width has to drop. Reports on the initial
  // mount, on the toggle, and on Cancel-restore. Every OTHER cosmetic reaches
  // the host through `onLiveChange`, which useCosmetics fires — mode keeps its
  // own callback because it is not a repaint but a grid rebuild.
  useEffect(() => {
    modeRef.current = cos.mode;
    onModeChange?.(cos.mode);
  }, [cos.mode, onModeChange]);

  // Stable closure for the GridStack callbacks captured by the controller's
  // mount effect.
  const registryRef = useRef(registry);
  registryRef.current = registry;
  // Mirrors for the []-deps GridStack callbacks, same reason as modeRef.
  const columnsRef = useRef(cos.columns);
  columnsRef.current = cos.columns;
  const rowHeightRef = useRef(cos.rowHeight);
  rowHeightRef.current = cos.rowHeight;

  // All the imperative GridStack machinery — item DOM, per-frame React roots,
  // nested group grids, the drop/drag handlers, and the init/teardown lifecycle
  // — lives in the controller hook (editor-grid-controller.tsx); the editor
  // keeps the declarative half (history, cosmetics state, the rail) and
  // composes the two here.
  const {
    gridInstanceRef,
    instancesRef,
    subGridsRef,
    renderInstance,
    restore,
    addFrame,
    teardownGrid,
    initGrid,
    captureLayout,
  } = useEditorGridController({
    spec,
    providers,
    currencyCode: cos.currencyCode,
    editing,
    gap: cos.gap,
    editorRef,
    gridRef,
    registryRef,
    modeRef,
    editingRef,
    editingIdRef,
    columnsRef,
    rowHeightRef,
    commitHistoryRef,
    setCount,
    setEditingId,
    setRemoved,
  });

  // The palette, grouped by category in FRAME_CATEGORIES order (frames sorted
  // by name within each group). Empty groups are dropped, and any frame whose
  // category isn't a known key folds into a trailing "Other" group so a host's
  // custom frame still shows up.
  const paletteGroups = useMemo(() => {
    const byCategory = new Map<string, AnyFrameDefinition[]>();
    for (const def of registry.values()) {
      const key = def.category ?? "other";
      const list = byCategory.get(key);
      if (list) list.push(def);
      else byCategory.set(key, [def]);
    }
    const known: FrameCategory[] = FRAME_CATEGORIES.map((c) => c.key);
    const groups: {
      key: string;
      label: string;
      description: string;
      frames: AnyFrameDefinition[];
    }[] = FRAME_CATEGORIES.map((c) => ({
      key: c.key as string,
      label: c.label as string,
      description: c.description as string,
      frames: byCategory.get(c.key) ?? [],
    }));
    const leftovers = [...byCategory.entries()]
      .filter(([key]) => !known.includes(key as FrameCategory))
      .flatMap(([, frames]) => frames);
    if (leftovers.length)
      groups.push({
        key: "other",
        label: "Other",
        description: "",
        frames: leftovers,
      });
    return groups
      .filter((g) => g.frames.length > 0)
      .map((g) => ({
        ...g,
        frames: [...g.frames].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [registry]);

  // Free-text palette search. An empty query leaves the accordion untouched; a
  // query filters frames by label / description / name and by their category
  // label (so "crypto" surfaces the whole family), requiring every
  // whitespace-separated token to match somewhere. Matching categories are
  // force-expanded in the render so results are visible without a click.
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteQueryTokens = useMemo(
    () => frameSearchTokens(paletteQuery),
    [paletteQuery],
  );
  const paletteSearching = paletteQueryTokens.length > 0;
  const filteredGroups = useMemo(() => {
    if (paletteQueryTokens.length === 0) return paletteGroups;
    return paletteGroups
      .map((group) => ({
        ...group,
        frames: group.frames.filter((def) =>
          frameMatchesSearch(def, group.label, paletteQueryTokens),
        ),
      }))
      .filter((group) => group.frames.length > 0);
  }, [paletteGroups, paletteQueryTokens]);

  // The palette is a category accordion — one collapsible section per group, so
  // the ~40-frame catalogue reads as a scannable menu instead of an endless
  // scroll. Open the first group by default so a fresh Frames tab still shows
  // some draggable cards; the rest reveal on click. Multiple may be open at once.
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(paletteGroups[0] ? [paletteGroups[0].key] : []),
  );
  const toggleCat = useCallback((key: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Register palette cards as GridStack drag sources while customising. The
  // palette only mounts on the Frames tab, and each category's cards only mount
  // while that section is expanded — so re-run when the tab opens or the set of
  // open categories changes, else freshly-mounted cards wouldn't be draggable.
  useEffect(() => {
    if (!editing || railTab !== "frames" || !gridInstanceRef.current) return;
    GridStack.setupDragIn(".zf-newwidget", {
      appendTo: "body",
      helper: (el: HTMLElement) => {
        const card = (el.closest(".zf-newwidget") as HTMLElement) ?? el;
        const frame = card.dataset.frame ?? "";
        const def = registryRef.current.get(frame);
        const layout = def?.layout;
        const helper = document.createElement("div");
        helper.className = "grid-stack-item";
        helper.setAttribute("data-frame", frame);
        helper.setAttribute("gs-w", String(layout?.w ?? 4));
        helper.setAttribute("gs-h", String(layout?.h ?? 3));
        if (layout?.minW) helper.setAttribute("gs-min-w", String(layout.minW));
        if (layout?.minH) helper.setAttribute("gs-min-h", String(layout.minH));
        if (layout?.maxW) helper.setAttribute("gs-max-w", String(layout.maxW));
        if (layout?.maxH) helper.setAttribute("gs-max-h", String(layout.maxH));
        // The helper is appended to <body>, outside .zf-editor, so it can't
        // inherit the accent/font vars — copy the live ones onto it so the drag
        // ghost reads in-theme. (See .zf-drag-ghost in editor.css.)
        const editorEl = gridRef.current?.closest(".zf-editor");
        if (editorEl) {
          const cs = getComputedStyle(editorEl);
          for (const v of [
            "--zf-accent-hue",
            "--zf-accent-sat",
            "--font-dmsans",
          ]) {
            const value = cs.getPropertyValue(v).trim();
            if (value) helper.style.setProperty(v, value);
          }
        }
        // A visible ghost (frame icon + name) so the user can see what they're
        // dragging — not just the empty footprint of the drop placeholder.
        const label = frame.replace(/-/g, " ");
        const icon = def?.iconUrl
          ? `<img class="zf-drag-ghost-icon" src="${def.iconUrl}" alt="" />`
          : "";
        helper.innerHTML = `<div class="grid-stack-item-content zf-drag-ghost" data-frame="${frame}">${icon}<span class="zf-drag-ghost-name">${label}</span></div>`;
        return helper;
      },
    });
  }, [editing, railTab, paletteGroups, expandedCats, gridInstanceRef]);

  const collectSpec = useCallback((): DashboardSpec => {
    const grid = gridInstanceRef.current;
    const frames: FrameInstance[] = [];
    if (grid) {
      for (const el of grid.getGridItems()) {
        const id = el.getAttribute("gs-id");
        if (!id) continue;
        const inst = instancesRef.current.get(id);
        if (!inst) continue;
        const node = el.gridstackNode;
        // Write the live position into the ACTIVE mode's slot, leaving the other
        // mode's layout untouched so each stays independently editable.
        const prev = posFor(inst, cos.mode) ?? inst.position;
        const pos: GridPosition = {
          x: node?.x ?? prev.x,
          y: node?.y ?? prev.y,
          w: node?.w ?? prev.w,
          h: node?.h ?? prev.h,
        };
        // A container's children come from its live nested grid, so a child
        // dragged/resized inside the group is saved from the same source of truth
        // as a board-level move. `node.subGrid` is set by makeSubGrid; a group
        // whose subgrid somehow never mounted keeps whatever it loaded with
        // rather than silently saving as empty.
        const sub = node?.subGrid ?? subGridsRef.current.get(id);
        const children = sub
          ? collectGroupChildren(sub, instancesRef.current)
          : inst.children;
        // `undefined` rather than `[]` for an empty group: the two mean the same
        // thing to the schema, and JSON.stringify omits the key entirely, so the
        // written file stays the short one a human reads. Set explicitly (not by
        // omission) because `inst` may itself carry a stale `children` — an
        // emptied group would otherwise save the array it loaded with.
        const nextChildren =
          children && children.length > 0 ? children : undefined;
        frames.push(
          cos.mode === "flow-horizontal"
            ? {
                ...inst,
                children: nextChildren,
                layouts: { ...inst.layouts, "flow-horizontal": pos },
              }
            : { ...inst, children: nextChildren, position: pos },
        );
      }
    }
    // Reading order keeps the written file diff-friendly (by the vertical layout).
    frames.sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    // Merging the cosmetics slices — one object off the same hook the rail reads
    // — is what keeps the SAVED file and the LIVE board from drifting. Every key
    // here already exists on `spec`, so re-assigning it leaves the written key
    // order exactly as the schema declared it (JSON.stringify follows insertion
    // order, and this file is meant to stay human-diffable).
    return { ...spec, ...cosmetics.slices, frames };
  }, [
    gridInstanceRef,
    instancesRef,
    subGridsRef,
    spec,
    cosmetics.slices,
    cos.mode,
  ]);

  const download = useCallback((next: DashboardSpec) => {
    const blob = new Blob([`${JSON.stringify(next, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard.json";
    a.click();
    // Defer revoke so the click's download isn't cancelled in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const startCustomise = useCallback(() => {
    // The session baseline. Everything else — undo's floor, Cancel's target, the
    // dirty flag — is derived from this one entry.
    historyRef.current = initHistory(collectSpec());
    publishHistory();
    setSaveError(null);
    setEditing(true);
  }, [collectSpec, publishHistory]);

  // Reclaim empty space in the ACTIVE grid (float:true otherwise preserves gaps).
  // Mode-aware: the vertical column grid reflows top-left to fill any hole
  // ('compact'); the horizontal side-scroller closes gaps while keeping its
  // deliberate left->right order ('list'), so a curated arrangement isn't
  // reshuffled. collectSpec reads positions live off gridstackNode, so the
  // tidied layout round-trips through Save with no extra bookkeeping.
  const tidy = useCallback(() => {
    // Tidy reflows every card at once — the single most disruptive thing in the
    // toolbar — so it must be one ⌘Z away.
    queueMicrotask(() => commitHistoryRef.current?.());
    gridInstanceRef.current?.compact(
      modeRef.current === "flow-horizontal" ? "list" : "compact",
    );
  }, [gridInstanceRef]);

  /**
   * Tear the grid down and rebuild it for `nextMode` from an explicit frame list.
   *
   * The two modes are different GridStack configs (vertical column grid vs the
   * coerced wide side-scroller) with independent per-frame positions, so they
   * can't morph — crossing between them means a re-init. Extracted from
   * `switchMode` because `applySpec` needs exactly the same rebuild when an undo
   * lands on a snapshot from the *other* mode; taking the frames as an argument
   * is what lets applySpec pass the snapshot's list rather than the live one.
   */
  const rebuildGrid = useCallback(
    (nextMode: LayoutMode, frames: FrameInstance[]) => {
      const wasEditing = editingRef.current;
      const horizontal = nextMode === "flow-horizontal";
      const cols = horizontal
        ? colsForHorizontal(frames, spec.grid.rows)
        : columnsRef.current;
      teardownGrid();
      modeRef.current = nextMode;
      setCosmetic("mode", nextMode);
      const grid = initGrid(nextMode, cols);
      gridInstanceRef.current = grid;
      restore(
        horizontal ? seedHorizontal(frames, cols, spec.grid.rows) : frames,
      );
      if (wasEditing) {
        grid.enableMove(true);
        grid.enableResize(true);
        // No decoration pass — the hover delegation lives on the editor root,
        // which this re-init doesn't touch, so the next pointerover re-arms the
        // affordances on whatever card the pointer lands on.
      }
    },
    [
      teardownGrid,
      initGrid,
      restore,
      setCosmetic,
      spec.grid.rows,
      gridInstanceRef,
    ],
  );

  // Swap the layout mode behind a brief blur+fade, so the structural reflow is
  // invisible. Reduced-motion users get the instant swap.
  const switchMode = useCallback(
    (next: LayoutMode) => {
      if (next === modeRef.current) return;
      const swap = () => {
        captureLayout();
        rebuildGrid(next, [...instancesRef.current.values()]);
      };
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        swap();
        return;
      }
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      setSwitching(true); // blur/fade out
      switchTimerRef.current = setTimeout(() => {
        swap(); // re-init + restore while invisible
        requestAnimationFrame(() => setSwitching(false)); // dissolve back in
      }, 150);
    },
    [captureLayout, rebuildGrid, instancesRef],
  );

  useEffect(
    () => () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    },
    [],
  );

  /**
   * Write a whole snapshot back over the live editor — the inverse of
   * `collectSpec()`, and the single mechanism behind undo, redo and Cancel.
   *
   * Every cosmetic setter runs unconditionally (they're cheap React state), but
   * the grid is only rebuilt when it has to be: `restore()` unmounts and
   * recreates EVERY frame's React root, re-subscribing its WS/poll hooks and
   * replaying first render, which is a visible hitch on a large board. So a
   * pure-cosmetic undo touches no roots at all.
   */
  const applySpec = useCallback(
    (next: DashboardSpec) => {
      // Suppress the debounced cosmetics watcher for longer than its own window,
      // so writing this snapshot back can't be mistaken for a fresh edit. Without
      // it, any tiny non-round-trip between collectSpec and applySpec (a frame
      // re-sort, an omitted-vs-undefined key) would push a new entry and silently
      // truncate the redo tail.
      suppressCommitUntilRef.current = Date.now() + COMMIT_DEBOUNCE_MS + 200;

      // Every cosmetic in one write — the snapshot IS the cosmetic state. This
      // was 30 setters in a row, and a knob missing from the list meant Cancel
      // silently left that one setting where the abandoned edit had put it.
      applyCosmetics(next);

      // A snapshot from the other layout mode can't be morphed into — the two are
      // separate GridStack configs — so crossing modes always means a rebuild.
      if (next.grid.mode !== modeRef.current) {
        rebuildGrid(next.grid.mode, next.frames);
      } else if (!framesEqual(collectSpec().frames, next.frames)) {
        restore(next.frames);
      }

      // The open dialog may belong to a frame this snapshot doesn't have (undoing
      // an add, redoing a delete) — close it rather than leaving it configuring a
      // frame that no longer exists.
      const openId = editingIdRef.current;
      if (openId && !next.frames.some((f) => f.id === openId)) {
        setEditingId(null);
      }
    },
    [applyCosmetics, collectSpec, rebuildGrid, restore],
  );

  const undo = useCallback(() => {
    const step = undoHistory(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    applySpec(step.snapshot);
    publishHistory();
  }, [applySpec, publishHistory]);

  const redo = useCallback(() => {
    const step = redoHistory(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    applySpec(step.snapshot);
    publishHistory();
  }, [applySpec, publishHistory]);

  const cancel = useCallback(() => {
    applySpec(baselineOf(historyRef.current));
    historyRef.current = initHistory(baselineOf(historyRef.current));
    publishHistory();
    setSaveError(null);
    setEditingId(null);
    setEditing(false);
  }, [applySpec, publishHistory]);

  /**
   * Persist the edited spec.
   *
   * Leaving customise mode is deferred until `onSave` actually resolves: the host
   * writes `dashboard.json` over HTTP, and reporting success before that lands
   * meant a failed write was indistinguishable from a successful one — the user
   * walked away believing the board was saved. A rejection now keeps you in
   * customise mode with your work intact and the reason on screen.
   */
  const save = useCallback(async () => {
    const next = collectSpec();
    if (!onSave) {
      download(next);
      historyRef.current = initHistory(next);
      publishHistory();
      setEditing(false);
      setEditingId(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(next);
      // The saved state is the new clean baseline, so re-opening customise mode
      // doesn't offer to revert to a state that's already on disk.
      historyRef.current = initHistory(next);
      publishHistory();
      setEditing(false);
      setEditingId(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save the dashboard.",
      );
    } finally {
      setSaving(false);
    }
  }, [collectSpec, onSave, download, publishHistory]);

  /**
   * Record the current state as a history entry.
   *
   * Deliberately coarse: callers signal "a gesture just ended" (a card was
   * dropped, a dialog closed, a drag stopped) without knowing whether anything
   * actually changed. `pushHistory` drops no-op pushes structurally, so an
   * over-eager call site costs nothing and ⌘Z always produces one visible change.
   */
  const commitHistory = useCallback(() => {
    if (!editingRef.current) return;
    if (Date.now() < suppressCommitUntilRef.current) return;
    const snapshot = collectSpec();
    // Fewer retained entries on very large boards, so undo depth × board size
    // stays bounded (see MAX_RETAINED_FRAMES).
    historyRef.current = pushHistory(
      historyRef.current,
      snapshot,
      historyLimitFor(snapshot.frames.length),
    );
    publishHistory();
  }, [collectSpec, publishHistory]);
  commitHistoryRef.current = commitHistory;

  /**
   * Record cosmetic changes on a trailing debounce.
   *
   * `collectSpec`'s identity changes exactly when any cosmetic state does (they
   * are all its dependencies), so depending on it here is a precise "some
   * cosmetic moved" signal without wiring a commit into all ~35 rail controls.
   * The trailing window is what collapses a continuous slider drag into a single
   * undo step instead of one per pixel.
   */
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(
      () => commitHistoryRef.current?.(),
      COMMIT_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [collectSpec, editing]);

  /** The undo toast is a time-limited offer, and it's scoped to customise mode —
   *  a stale "Undo" after leaving would rewind an edit the user has moved on
   *  from. Keyed on the removed id so each delete restarts the countdown. */
  useEffect(() => {
    if (!removed) return;
    if (!editing) {
      setRemoved(null);
      return;
    }
    const t = setTimeout(() => setRemoved(null), UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [removed, editing]);

  /**
   * Push grid geometry into the live GridStack.
   *
   * `column()` and `cellHeight()` both reflow in place, so changing the board's
   * shape costs no teardown — the alternative (re-initialising the grid) would
   * unmount and remount every frame's React root, re-subscribing all their
   * WS/poll hooks, on each step of a slider.
   *
   * flow-horizontal is excluded on purpose: there the column count is derived
   * from the frames and the cell height from the viewport, so both are computed,
   * not chosen.
   */
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid || modeRef.current === "flow-horizontal") return;
    if (grid.getColumn() !== cos.columns) grid.column(cos.columns);
    grid.cellHeight(cos.rowHeight);
  }, [cos.columns, cos.rowHeight, gridInstanceRef]);

  /**
   * Customise-mode keyboard shortcuts: ⌘Z / ⌘⇧Z to undo/redo, ⌘S to save
   * (Ctrl on Windows/Linux).
   *
   * ⌘Z is skipped while focus is in a text field so it keeps its native
   * text-editing meaning; ⌘S is not, because the browser's own ⌘S (save this
   * page) is never what someone editing a dashboard wants.
   */
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
        if (!saving) void save();
        return;
      }
      if (key !== "z") return;

      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, undo, redo, save, saving]);

  const renderCustomiseButton = () => (
    <button
      type="button"
      className="zf-btn zf-btn--customise"
      onClick={startCustomise}
      aria-label="Customize"
      title="Customize"
    >
      {/* The icon sits in its own accent chip rather than loose beside the
          label: at 18px a sliders glyph reads as noise next to bold text, and
          the chip gives the accent somewhere to live that survives any
          background the board happens to have behind it. */}
      <span className="zf-customise-chip" aria-hidden="true">
        <SlidersHorizontal size={15} />
      </span>
      <span className="zf-customise-label">Customize</span>
    </button>
  );

  // The frame whose settings dialog is open, if any. Read from the live ref —
  // the dialog keys off its id and owns its own draft, so a stale object here is
  // harmless.
  const editingInstance =
    editing && editingId ? instancesRef.current.get(editingId) : undefined;

  // flow-horizontal is a live GridStack (drag-editable), so it needs no
  // read-only preview — the same grid renders and edits both modes; data-mode
  // below drives the horizontal scroll wrapper in editor.css.
  return (
    // Same display-currency wrapper the renderer applies, so a board looks
    // identical in customise mode and when served.
    <DashboardCurrencyProvider code={cos.currencyCode}>
      {/* Same href/precedence as DashboardRenderer's copy, so React 19 hoists
          the two into one document-level tag when both are on a page. */}
      <style href="zframes-frame-css" precedence="zframes">
        {FRAME_CSS}
      </style>
      {customiseButtonTarget && !editing
        ? createPortal(renderCustomiseButton(), customiseButtonTarget)
        : null}
      <div
        ref={editorRef}
        className={editing ? "zf-editor zf-customise" : "zf-editor"}
        data-mode={cos.mode}
        // Surface mode ("dark"|"light") — drives the light page fill on the grid
        // area (editor.css) alongside the four --zf-*-l vars below.
        data-surface={cos.surface}
        // Past ~12 frames the per-item jiggle promotes that many compositing
        // layers and repaints them continuously through customise mode; drop the
        // animation (a pure affordance) on big boards. The dashed outline + grab
        // cursor still signal editability.
        data-wiggle={editing && count > 12 ? "off" : undefined}
        style={cosmetics.styleVars}
      >
        {(editing || !customiseButtonTarget) && (
          <div className="zf-editor-bar">
            <div className="zf-editor-bar-spacer" />
            {!editing ? (
              renderCustomiseButton()
            ) : (
              <>
                {/* A rejected save must not read like a successful one. */}
                {saveError && (
                  <p className="zf-editor-error" role="alert">
                    {saveError}
                  </p>
                )}
                <button
                  type="button"
                  className="zf-btn zf-btn--icon"
                  onClick={undo}
                  disabled={!historyState.undo || saving}
                  aria-label="Undo"
                  title="Undo (⌘Z)"
                >
                  <Undo2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--icon"
                  onClick={redo}
                  disabled={!historyState.redo || saving}
                  aria-label="Redo"
                  title="Redo (⌘⇧Z)"
                >
                  <Redo2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--ghost"
                  onClick={tidy}
                  disabled={saving}
                  title="Reclaim empty grid space"
                >
                  Tidy
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--ghost"
                  onClick={cancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--primary"
                  // `save` settles its own rejection into `saveError`, so nothing
                  // is left floating — discard the promise explicitly.
                  onClick={() => void save()}
                  disabled={saving}
                  // With no host to persist to, this button downloads a file.
                  // Saying so is the difference between a deliberate export and
                  // a save the user thinks went somewhere.
                  title={
                    onSave
                      ? "Save the dashboard"
                      : "Download dashboard.json (no host to save to)"
                  }
                >
                  {/* The standalone "No changes / Unsaved changes" tag is gone;
                      the dirty state rides the Save button instead, where the
                      action it applies to already is. aria-live keeps it
                      announced now that there's no separate live region. */}
                  {!saving && historyState.dirty && (
                    <span className="zf-dirty-dot" aria-hidden="true" />
                  )}
                  <span aria-live="polite">
                    {saving ? "Saving…" : onSave ? "Save" : "Download"}
                  </span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Deleting a card takes its config, tickers, events and style overrides
            with it — none of which a re-add restores. The toast makes that
            recoverable in one click, for the case where ⌘Z isn't reached for. */}
        {editing && removed && (
          <div className="zf-toast" role="status">
            {/* Verb first, name quoted. "{label} removed" reads as a quantifier
                when the card is titled something like "All frames" — the board
                this was first tried on produced "All frames removed". */}
            <span className="zf-toast-text">
              Removed &ldquo;{removed.label}&rdquo;
            </span>
            <button
              type="button"
              className="zf-toast-action"
              // Distinct from the toolbar's Undo, which is on screen at the same
              // time — two controls both announcing "Undo" is ambiguous by voice
              // even though the visible label is unmistakable in context.
              aria-label={`Undo removing ${removed.label}`}
              onClick={() => {
                setRemoved(null);
                undo();
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="zf-toast-close"
              onClick={() => setRemoved(null)}
              aria-label="Dismiss"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="zf-editor-main">
          <div className="zf-editor-grid" data-switching={switching}>
            <div ref={gridRef} className="grid-stack" />
            {/* A board with no frames rendered as a blank page with no
                explanation and no way forward — the one state where the user
                most needs telling what to do next. */}
            {count === 0 && (
              <div className="zf-board-empty">
                <p className="zf-board-empty-title">This board is empty</p>
                {editing ? (
                  <p className="zf-board-empty-note">
                    Pick a frame from the{" "}
                    <button
                      type="button"
                      className="zf-board-empty-link"
                      onClick={() => setRailTab("frames")}
                    >
                      Frames
                    </button>{" "}
                    panel — click to drop it in, or drag it onto the grid.
                  </p>
                ) : (
                  <p className="zf-board-empty-note">
                    Open Customise to add your first frame.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The rail stays mounted so its width reveal animates *both* ways —
              the grid (flex:1) reflows to follow it. `inert` keeps the collapsed
              rail unfocusable and unclickable while it's clipped to zero width. */}
          <aside className="zf-rail" aria-hidden={!editing} inert={!editing}>
            <div className="zf-rail-inner">
              <div
                className="zf-rail-tabs"
                role="tablist"
                aria-label="Customise"
              >
                {/* Complete tab semantics: each tab owns its panel via
                    aria-controls, only the selected tab is in the tab order
                    (tabIndex -1 on the other), and Left/Right move between them
                    — the pattern role="tab" already promised. */}
                {(["frames", "cosmetics"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`zf-rail-tab-${tab}`}
                    aria-selected={railTab === tab}
                    aria-controls={`zf-rail-panel-${tab}`}
                    tabIndex={railTab === tab ? 0 : -1}
                    className={
                      railTab === tab ? "zf-rail-tab is-active" : "zf-rail-tab"
                    }
                    onClick={() => setRailTab(tab)}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
                        return;
                      e.preventDefault();
                      const next = tab === "frames" ? "cosmetics" : "frames";
                      setRailTab(next);
                      document.getElementById(`zf-rail-tab-${next}`)?.focus();
                    }}
                  >
                    {tab === "frames" ? "Frames" : "Cosmetics"}
                  </button>
                ))}
              </div>

              {railTab === "cosmetics" && (
                <div
                  role="tabpanel"
                  id="zf-rail-panel-cosmetics"
                  aria-labelledby="zf-rail-tab-cosmetics"
                >
                  <CosmeticsRail
                    cosmetics={cosmetics}
                    query={cosmeticQuery}
                    onQuery={setCosmeticQuery}
                    openSections={openSections}
                    onToggleSection={toggleSection}
                    onModeChange={switchMode}
                  />
                </div>
              )}

              {railTab === "frames" && (
                <section
                  role="tabpanel"
                  id="zf-rail-panel-frames"
                  aria-labelledby="zf-rail-tab-frames"
                >
                  <h3 className="zf-rail-title">Add a frame</h3>
                  <p className="zf-palette-hint">
                    Search, or open a category, then click a frame to add it —
                    or drag it onto the grid.
                  </p>
                  <RailSearch
                    value={paletteQuery}
                    onChange={setPaletteQuery}
                    placeholder="Search frames…"
                    label="Search frames"
                  />
                  <div className="zf-palette-cats">
                    {paletteSearching && filteredGroups.length === 0 && (
                      <p className="zf-palette-empty">
                        No frames match “{paletteQuery.trim()}”.
                      </p>
                    )}
                    {filteredGroups.map((group) => {
                      const open =
                        paletteSearching || expandedCats.has(group.key);
                      return (
                        <div
                          key={group.key}
                          className={
                            open ? "zf-palette-cat is-open" : "zf-palette-cat"
                          }
                        >
                          <button
                            type="button"
                            className="zf-palette-cat-header"
                            aria-expanded={open}
                            onClick={() => toggleCat(group.key)}
                          >
                            <svg
                              className="zf-palette-cat-chevron"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                            >
                              <path
                                d="M6 4l4 4-4 4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="zf-palette-cat-label">
                              {group.label}
                            </span>
                            <span className="zf-palette-cat-count">
                              {group.frames.length}
                            </span>
                          </button>
                          {open && (
                            <div className="zf-palette-cat-body">
                              {group.description && (
                                <p className="zf-palette-cat-desc">
                                  {group.description}
                                </p>
                              )}
                              <div className="zf-palette">
                                {group.frames.map((def) => (
                                  <div
                                    key={def.name}
                                    // `grid-stack-item` makes GridStack accept the
                                    // card as a drag-in source (its accept check is
                                    // el.matches('.grid-stack-item')); the gs-* attrs
                                    // size the drop placeholder while dragging. Safe
                                    // off-grid: gridstack's position:absolute rule is
                                    // scoped to `.grid-stack > .grid-stack-item`.
                                    className="grid-stack-item zf-newwidget"
                                    data-frame={def.name}
                                    gs-w={def.layout?.w ?? 4}
                                    gs-h={def.layout?.h ?? 3}
                                    gs-min-w={def.layout?.minW}
                                    gs-min-h={def.layout?.minH}
                                    gs-max-w={def.layout?.maxW}
                                    gs-max-h={def.layout?.maxH}
                                    role="button"
                                    tabIndex={0}
                                    title={`Drag onto the board, or click to add ${def.label}`}
                                    onClick={() => addFrame(def.name)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        addFrame(def.name);
                                      }
                                    }}
                                  >
                                    {def.iconUrl && (
                                      <img
                                        className="zf-newwidget-icon"
                                        src={def.iconUrl}
                                        alt=""
                                        loading="lazy"
                                        draggable={false}
                                      />
                                    )}
                                    <div className="zf-newwidget-copy">
                                      <div className="zf-newwidget-name">
                                        {def.label}
                                      </div>
                                      <div className="zf-newwidget-desc">
                                        {def.description}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      </div>
      {editingInstance
        ? createPortal(
            <FrameConfigDialog
              key={editingInstance.id}
              instance={editingInstance}
              registry={registry}
              instancesRef={instancesRef}
              symbolUniverse={symbolUniverse}
              accentHue={cos.accentHue}
              // The live board currency, so the card's picker can name what
              // "inherit" currently resolves to.
              boardCurrency={cos.currencyCode}
              // The live dashboard-level cosmetics a card inherits when a
              // per-frame style override is unset — the Style panel seeds each
              // enabled override with the matching value so toggling is a no-op.
              inherited={{
                accentHue: cos.accentHue,
                accentSat: cos.accentSat,
                baseHue: cos.baseHue,
                baseSat: cos.baseSat,
                surfaceOpacity: cos.surfaceOpacity,
                radius: cos.radius,
                borderStrength: cos.borderStrength,
                density: cos.density,
                elevation: cos.elevation,
              }}
              onApply={(id) => renderInstance(id)}
              onClose={() => {
                setEditingId(null);
                // The dialog commits each valid keystroke straight into
                // instancesRef, so the *close* is the gesture boundary — one undo
                // step for the whole configuring session rather than one per
                // character typed.
                commitHistoryRef.current?.();
              }}
            />,
            document.body,
          )
        : null}
    </DashboardCurrencyProvider>
  );
}
