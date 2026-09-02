import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  colsForHorizontal,
  containerGeometry,
  GEAR_SVG,
  posFor,
  seedHorizontal,
  subCellPx,
  type ContainerGeometry,
  type LayoutMode,
} from "./editor-grid";
import {
  buildGroupChildEl,
  collectGroupChildren,
  decorateGroupHost,
  pinGroupOuterGutter,
  subGridOptions,
} from "./editor-groups";
import { buildDefaultConfig } from "./editor-symbols";
import type { AnyFrameDefinition, FrameRegistry } from "@zframes/spec/frame";
import {
  DashboardCurrencyProvider,
  FrameContent,
  FramePatchContext,
  FramesProvider,
  useProviders,
} from "@zframes/core";
import {
  MAX_GROUP_CHILDREN,
  type DashboardSpec,
  type FrameInstance,
  type GridPosition,
} from "@zframes/spec/spec";

// ── GridStack wiring: grid init, nested groups, per-item React roots ──
//
// GridStack owns each grid item's DOM, so this controller hook owns everything
// imperative the editor does against it: building/registering item elements,
// mounting a React root per frame, turning container items into nested grids,
// the drop/drag handlers, and the teardown/rebuild lifecycle a layout-mode
// switch needs. The DashboardEditor composes it and keeps the declarative half
// (history, cosmetics state, the rail) for itself.

/**
 * Unmount a per-frame React root *after* the current render/commit finishes.
 * Frame components load lazily (`React.lazy` + `Suspense`), so a root can still
 * be mid-render when the editor tears the grid down; a synchronous
 * `root.unmount()` inside React's render phase warns ("Attempted to
 * synchronously unmount a root while React was already rendering"). Deferring
 * to a microtask sidesteps it — GridStack has already detached the DOM node, so
 * the late unmount is harmless and the new grid builds fresh nodes/roots.
 *
 * Load-bearing invariant: every caller MUST drop the id from rootsRef/contentRef
 * before scheduling the deferred unmount, so renderInstance can't reuse a root
 * that's queued for teardown. All three call sites do this synchronously.
 */
function unmountRootSoon(root: Root): void {
  queueMicrotask(() => root.unmount());
}

/** Row height last handed to each nested grid, so a re-fit that computes the same
 *  value doesn't rewrite the grid's stylesheet. Keyed by the grid itself, so a
 *  torn-down group takes its entry with it. */
const appliedCellPx = new WeakMap<GridStack, number>();

/**
 * What the one toast surface is currently saying.
 *
 * Two variants rather than two surfaces: a delete offers its own undo, and a
 * refused drop states a reason — both are the same "the board just did
 * something you should know about" slot at the bottom of the screen, and a
 * silent refusal is indistinguishable from a drop that missed.
 */
export type EditorToast =
  | {
      kind: "removed";
      id: string;
      label: string;
      /** The frame exactly as it was, children and all, so the toast's Undo can
       *  put back THAT card rather than walking the shared history back a step
       *  (which reversed whatever happened last instead). */
      instance: FrameInstance;
      /** The group it was inside, when it was a child rather than a board frame. */
      parentId?: string;
    }
  | { kind: "refused"; reason: string };

/** Elements that can hold focus inside a card — the set B-15's focus rescue
 *  indexes into, so an undo doesn't drop the keyboard user on `<body>`. */
const FOCUSABLE_IN_CARD =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Which frame held focus, and where inside it. Ids survive a rebuild; DOM
 *  nodes do not, so the position is recorded as an index into the card's
 *  focusable descendants (the rebuilt card is the same component rendering the
 *  same markup, so the index lands on the same control). */
interface FocusMemo {
  id: string;
  index: number | null;
}

/**
 * Whether the machine has asked for reduced motion, read live.
 *
 * A local subscription rather than a shared hook because the layer DAG allows
 * this package `@zframes/core` + `@zframes/spec` only — the frames' and the
 * charts' equivalents are off-limits here — and the grid engine is the one
 * thing in the editor that animates from JS rather than from CSS.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function captureFocusMemo(): FocusMemo | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const item = active.closest<HTMLElement>(".grid-stack-item");
  const id = item?.getAttribute("gs-id");
  if (!item || !id) return null;
  const index = [
    ...item.querySelectorAll<HTMLElement>(FOCUSABLE_IN_CARD),
  ].indexOf(active);
  return { id, index: index < 0 ? null : index };
}

/**
 * Undo a drop the editor refuses, leaving the board exactly as it was.
 *
 * Two cases, and they must not be confused: a palette card has nothing behind
 * it yet, so removing the item IS the undo. A card dragged in from the board (or
 * another group) is a live frame whose React root, nested grid and instance all
 * ride inside the element GridStack just re-parented — removing it would delete
 * the user's card. That one is handed back to the grid it came from, with the
 * placement it had, since GridStack has already overwritten the `gs-*`
 * attributes with the slot it was about to take inside the group.
 */
function refuseDrop(
  sub: GridStack,
  el: GridItemHTMLElement,
  origin: GridStackNode | undefined,
): void {
  const back = origin?.grid;
  if (!back) {
    sub.removeWidget(el, true);
    return;
  }
  // Quiet removal (no event): this is a gesture being rolled back, not a card
  // leaving the board.
  sub.removeWidget(el, false, false);
  el.setAttribute("gs-x", String(origin.x ?? 0));
  el.setAttribute("gs-y", String(origin.y ?? 0));
  el.setAttribute("gs-w", String(origin.w ?? 1));
  el.setAttribute("gs-h", String(origin.h ?? 1));
  back.el.appendChild(el);
  back.makeWidget(el);
}

/**
 * Compute the first free `w`×`h` slot among `taken`, so a frame added in one
 * layout mode gets a real placement in the other one too.
 *
 * `rows` bounds the scan for the horizontal board (fixed bands, scanned
 * column-major, matching `seedHorizontal`); without it the vertical board is
 * scanned row-major and grows downwards, which is where a new card belongs.
 */
function firstFreeSlot(
  taken: readonly GridPosition[],
  opts: { cols: number; rows?: number; w: number; h: number },
): GridPosition {
  const cols = Math.max(1, opts.cols);
  const w = Math.min(Math.max(1, opts.w), cols);
  const h = opts.rows
    ? Math.min(Math.max(1, opts.h), opts.rows)
    : Math.max(1, opts.h);
  const cells = new Set<string>();
  let maxY = 0;
  for (const p of taken) {
    maxY = Math.max(maxY, p.y + p.h);
    for (let i = 0; i < p.w; i++)
      for (let j = 0; j < p.h; j++) cells.add(`${p.x + i},${p.y + j}`);
  }
  const free = (x: number, y: number) => {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        if (cells.has(`${x + i},${y + j}`)) return false;
    return true;
  };
  if (opts.rows) {
    const rows = opts.rows;
    for (let x = 0; x <= cols - w; x++)
      for (let y = 0; y <= rows - h; y++) if (free(x, y)) return { x, y, w, h };
    // Every band is full — the horizontal grid grows sideways, so park it past
    // the end rather than on top of something.
    return { x: cols, y: 0, w, h };
  }
  for (let y = 0; y <= maxY; y++)
    for (let x = 0; x <= cols - w; x++) if (free(x, y)) return { x, y, w, h };
  return { x: 0, y: maxY, w, h };
}

export interface EditorGridControllerDeps {
  spec: DashboardSpec;
  providers: ReturnType<typeof useProviders>;
  /** The live display-currency code — renderInstance re-provides it per item
   *  root, and every root re-renders when it changes. */
  currencyCode: DashboardSpec["currency"]["code"];
  /** Whether customise mode is on — drives the hover-affordance delegation and
   *  the horizontal band re-fit. */
  editing: boolean;
  /** The live inter-frame gap (px), pushed straight into the grid's margin. */
  gap: number;
  /** The editor's own root. Stable across grid re-inits (switchMode tears the
   *  GridStack down and builds a new one), so it's what the customise-mode hover
   *  delegation listens on — see decorateChain. */
  editorRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  registryRef: MutableRefObject<FrameRegistry>;
  /** Mirrors the editor's `mode` state for the []-deps GridStack callbacks
   *  (buildItemEl, captureLayout, the drop handlers) that must read the
   *  *current* mode without being re-created. */
  modeRef: MutableRefObject<LayoutMode>;
  editingRef: MutableRefObject<boolean>;
  /** Mirror of the open config dialog's frame id, so deleting the frame being
   *  edited also closes the dialog. */
  editingIdRef: MutableRefObject<string | null>;
  columnsRef: MutableRefObject<number>;
  rowHeightRef: MutableRefObject<number>;
  /** Indirection for the GridStack handlers, which are registered once at grid
   *  init and must reach the *current* commitHistory (owned by the editor, since
   *  it depends on collectSpec). */
  commitHistoryRef: MutableRefObject<(() => void) | null>;
  /** Called after a frame patched its OWN config through `useFramePatch`. The
   *  editor decides what that write means (a durable edit, a host auto-save, or
   *  a transient one it reverts when customise mode opens) — the controller
   *  only reports that it happened. */
  selfPatchRef: MutableRefObject<((id: string) => void) | null>;
  setCount: Dispatch<SetStateAction<number>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setToast: Dispatch<SetStateAction<EditorToast | null>>;
  /** Write into the editor's polite live region. What a pointer user reads off
   *  the moving card, a keyboard user has to be told. */
  setAnnouncement: Dispatch<SetStateAction<string>>;
}

export function useEditorGridController({
  spec,
  providers,
  currencyCode,
  editing,
  gap,
  editorRef,
  gridRef,
  registryRef,
  modeRef,
  editingRef,
  editingIdRef,
  columnsRef,
  rowHeightRef,
  commitHistoryRef,
  selfPatchRef,
  setCount,
  setEditingId,
  setToast,
  setAnnouncement,
}: EditorGridControllerDeps) {
  const gridInstanceRef = useRef<GridStack | null>(null);
  const gridReadyRef = useRef(false);
  // Authoritative per-instance data (frame/title/config). GridStack
  // owns position; we merge the two at save time.
  // Children of a group live in this SAME flat map, keyed by their own id (ids are
  // unique board-wide), so renderInstance / patchInstance / the config rail work
  // on a nested frame with no special case. The tree is reassembled only at save
  // time, from the two refs below.
  const instancesRef = useRef<Map<string, FrameInstance>>(new Map());
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const contentRef = useRef<Map<string, HTMLElement>>(new Map());
  // The nested GridStack per container instance, rebuilt from scratch by
  // restore(). Parentage itself is deliberately NOT tracked here: GridStack moves
  // an item's DOM between grids on a cross-grid drag, so the nested grid's own
  // item list is the only account of who is inside a group that can't go stale —
  // collectSpec reads children straight off it.
  const subGridsRef = useRef<Map<string, GridStack>>(new Map());
  // One ResizeObserver per group, keeping its inner row height fitted to its
  // current pixel height (GridStack nested grids need a px cellHeight). Held so
  // they can be disconnected — an observer on a removed group's detached node
  // would otherwise leak for the life of the editor.
  const subObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const counterRef = useRef(0);

  // Stable closures for the GridStack callbacks captured by the mount effect.
  const providersRef = useRef(providers);
  providersRef.current = providers;

  // GridStack owns each item's DOM, so every frame lives in its OWN React root
  // (below). Context from the editor's tree does NOT reach those roots — they
  // must re-provide anything frames read, which is why the display currency is
  // provided per item here as well as at the editor root.
  const currencyRef = useRef(currencyCode);
  currencyRef.current = currencyCode;

  const defaultConfig = useCallback(
    (def?: AnyFrameDefinition): Record<string, unknown> =>
      def ? buildDefaultConfig(def) : {},
    [],
  );

  const uniqueId = useCallback((frame: string): string => {
    let id = `${frame}-${++counterRef.current}`;
    while (instancesRef.current.has(id))
      id = `${frame}-${++counterRef.current}`;
    return id;
  }, []);

  // Allows frame components (e.g. note) to patch their own config in-place
  // without opening the config rail. Kept in a ref so the stable renderInstance
  // closure always calls the latest version.
  const patchInstanceRef = useRef<
    ((id: string, patch: Record<string, unknown>) => void) | null
  >(null);

  // Ref-held because the container apply path below is defined ABOVE the fit
  // itself (which needs the sub-grid machinery), and both have to stay
  // []-deps stable — the same indirection commitHistoryRef uses.
  const fitSubGridRef = useRef<
    ((item: HTMLElement, host: HTMLElement, sub: GridStack) => void) | null
  >(null);

  // Re-state a group's own geometry and look on its LIVE nested grid.
  //
  // A container has no React root — its content box IS the grid — so there is
  // nothing to re-render when its config changes, and the "apply" the dialog
  // fires used to fall off the end of renderInstance: Columns, Rows, Gap, Panel
  // and the title were stored and then appeared only after a Save + reload, or
  // whenever an unrelated undo happened to rebuild the board. The one remaining
  // dead control in customise mode's live preview.
  //
  // Pushed into the existing grid rather than remounting it, deliberately:
  // rebuilding the sub-grid would unmount every child's React root and replay
  // its first render (and its subscriptions) on each step of a slider.
  const applyGroupGeometry = useCallback(
    (instance: FrameInstance, sub: GridStack) => {
      const geo = containerGeometry(
        registryRef.current.get(instance.frame),
        instance.config,
      );
      if (!geo) return;
      const host = sub.el;
      const item = host.closest<GridItemHTMLElement>(".grid-stack-item");
      if (!item) return;
      // Panel + title + the stashed row count, all read off the instance.
      decorateGroupHost(item, host, instance, geo);
      // `margin` works here where it silently didn't at init: the setter clears
      // the per-side values first, so `_initMargin` re-expands the new gap into
      // all four (see subGridOptions for the init-time footgun). maxRow also
      // compacts any child left past a shrunken row count.
      sub.updateOptions({
        column: geo.columns,
        maxRow: geo.rows,
        margin: geo.gap / 2,
      });
      // The nested row height is derived from the group's box and its row
      // count, so a Rows change has to re-fit or the children keep the old
      // pitch. A change that leaves the pitch identical (columns, gap, panel)
      // costs nothing: fitSubGrid's own memo skips the stylesheet write, which
      // is what makes this safe to call on every apply.
      fitSubGridRef.current?.(item, host, sub);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const renderInstance = useCallback((id: string) => {
    const instance = instancesRef.current.get(id);
    if (!instance) return;
    // A container's "render" is its grid geometry (see applyGroupGeometry) —
    // it deliberately owns no content root.
    const sub = subGridsRef.current.get(id);
    if (sub) {
      applyGroupGeometry(instance, sub);
      return;
    }
    const content = contentRef.current.get(id);
    if (!content) return;
    let root = rootsRef.current.get(id);
    if (!root) {
      content.innerHTML = "";
      root = createRoot(content);
      rootsRef.current.set(id, root);
    }
    root.render(
      <FramesProvider providers={providersRef.current}>
        <DashboardCurrencyProvider code={currencyRef.current}>
          <FramePatchContext.Provider
            value={(patch) => patchInstanceRef.current?.(id, patch)}
          >
            <FrameContent
              instance={instance}
              registry={registryRef.current}
              className="zf-fill"
            />
          </FramePatchContext.Provider>
        </DashboardCurrencyProvider>
      </FramesProvider>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Deferred first render (restore only) ──
  // restore() used to createRoot + render every frame synchronously in one
  // effect — ~300 roots on a big board, a multi-second first-mount stall. The
  // GridStack widgets are still all added synchronously (geometry and scroll
  // height must be right immediately), but each item's React root is created
  // only when its element approaches the viewport, one-shot per item.
  // Everything a save needs (instancesRef, the nested grids, gridstackNode) is
  // registered synchronously, so an item whose root never mounted still
  // round-trips through collectSpec.
  const restoringRef = useRef(false);
  const deferredRef = useRef<Map<Element, string[]>>(new Map());
  const restoreObserverRef = useRef<IntersectionObserver | null>(null);

  const clearDeferred = useCallback(() => {
    restoreObserverRef.current?.disconnect();
    deferredRef.current.clear();
  }, []);

  /** Render `id` when `el` nears the viewport — or immediately outside a
   *  restore pass / where IntersectionObserver is unavailable (jsdom). */
  const deferRender = useCallback(
    (el: Element, id: string) => {
      if (!restoringRef.current) {
        renderInstance(id);
        return;
      }
      if (
        !restoreObserverRef.current &&
        typeof IntersectionObserver === "function"
      ) {
        restoreObserverRef.current = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const ids = deferredRef.current.get(entry.target);
              deferredRef.current.delete(entry.target);
              restoreObserverRef.current?.unobserve(entry.target);
              if (ids) for (const deferredId of ids) renderInstance(deferredId);
            }
          },
          { rootMargin: "600px" },
        );
      }
      const io = restoreObserverRef.current;
      if (!io) {
        renderInstance(id);
        return;
      }
      // A group's children queue on the GROUP's element (their own elements sit
      // inside it, so one observation covers the cluster).
      const ids = deferredRef.current.get(el);
      if (ids) {
        ids.push(id);
      } else {
        deferredRef.current.set(el, [id]);
        io.observe(el);
      }
    },
    [renderInstance],
  );

  const patchInstance = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const inst = instancesRef.current.get(id);
      if (!inst) return;
      instancesRef.current.set(id, {
        ...inst,
        config: { ...inst.config, ...patch },
      });
      renderInstance(id);
      // A frame writing its own config used to land in the working copy with no
      // history entry, no dirty dot and no way back — and then an unrelated
      // Save, minutes later, wrote it to disk. Report it instead: the editor
      // makes the write either durable or transient, never laundered.
      selfPatchRef.current?.(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderInstance],
  );
  patchInstanceRef.current = patchInstance;

  /**
   * How a card is named to the user: its own title, else the frame's label,
   * else the frame name made readable.
   *
   * One source for all four places that need it — the removal toast, the two
   * pills' accessible names, and the keyboard geometry announcements — because
   * a control named differently from the card it acts on is worse than one with
   * no name at all.
   */
  const labelOf = useCallback((el: GridItemHTMLElement | string): string => {
    const id = typeof el === "string" ? el : (el.getAttribute("gs-id") ?? "");
    const inst = instancesRef.current.get(id);
    return (
      inst?.title ??
      registryRef.current.get(inst?.frame ?? "")?.label ??
      inst?.frame.replace(/-/g, " ") ??
      "Frame"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteItem = useCallback((el: GridItemHTMLElement) => {
    // The owning grid, which for a frame inside a group is that group's NESTED
    // grid — removing it from the board grid instead would leave the item's DOM
    // in place and the board's item count unchanged.
    const grid = el.gridstackNode?.grid ?? gridInstanceRef.current;
    if (!grid) return;
    const id = el.getAttribute("gs-id");
    if (id) {
      // Name the removal before the instance is gone, so the toast can say what
      // was deleted rather than "a frame".
      const inst = instancesRef.current.get(id);
      const label = labelOf(id);
      // The frame exactly as it stood, so the toast's Undo can re-insert THIS
      // card instead of stepping the shared history back one entry (which
      // reversed whatever the user did next, under a button naming the card).
      // Its live position, not the loaded one — the card goes back where it was
      // sitting — and a group's children come off its live nested grid, or the
      // cluster would come back empty.
      const node = el.gridstackNode;
      const livePos: GridPosition | undefined = node
        ? {
            x: node.x ?? 0,
            y: node.y ?? 0,
            w: node.w ?? 1,
            h: node.h ?? 1,
          }
        : undefined;
      const sub = subGridsRef.current.get(id);
      // A child of a group: its position is its slot INSIDE the group, and a
      // child never carries per-board-mode layouts, so the mode doesn't apply.
      const parentId =
        el.parentElement
          ?.closest<HTMLElement>('.grid-stack-item[data-container="true"]')
          ?.getAttribute("gs-id") ?? undefined;
      const removedInstance: FrameInstance | undefined = inst
        ? {
            ...inst,
            ...(livePos
              ? parentId || modeRef.current !== "flow-horizontal"
                ? { position: livePos }
                : { layouts: { ...inst.layouts, "flow-horizontal": livePos } }
              : {}),
            ...(sub
              ? {
                  children: collectGroupChildren(sub, instancesRef.current),
                }
              : {}),
          }
        : undefined;
      const root = rootsRef.current.get(id);
      if (root) unmountRootSoon(root);
      rootsRef.current.delete(id);
      contentRef.current.delete(id);
      instancesRef.current.delete(id);
      // A still-deferred render for this item (or this group's children) has
      // nothing left to mount into.
      deferredRef.current.delete(el);
      restoreObserverRef.current?.unobserve(el);
      // Deleting a group takes its children with it — they exist only inside it.
      // Their instances have to go too, or the next save would still carry them
      // (and the recoverable-delete snapshot is what puts them all back).
      if (sub) {
        for (const childEl of sub.getGridItems()) {
          const childId = childEl.getAttribute("gs-id");
          if (!childId) continue;
          const childRoot = rootsRef.current.get(childId);
          if (childRoot) unmountRootSoon(childRoot);
          rootsRef.current.delete(childId);
          contentRef.current.delete(childId);
          instancesRef.current.delete(childId);
        }
        subGridsRef.current.delete(id);
        // An observer left watching a removed group's detached node would leak
        // for the life of the editor.
        subObserversRef.current.get(id)?.disconnect();
        subObserversRef.current.delete(id);
      }
      if (editingIdRef.current === id) setEditingId(null);
      if (removedInstance) {
        setToast({
          kind: "removed",
          id,
          label,
          instance: removedInstance,
          ...(parentId ? { parentId } : {}),
        });
      }
    }
    grid.removeWidget(el, true);
    setCount(gridInstanceRef.current?.getGridItems().length ?? 0);
    // Record the removal so ⌘Z and the toast's Undo can both put it back — with
    // its config, tickers, events and style overrides, which a re-add can't.
    commitHistoryRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adds the customise-mode affordances to a grid item: a per-frame gear that
  // opens *that* frame's settings dialog, plus the delete ×. Idempotent —
  // guarded so repeated calls don't stack buttons/listeners.
  //
  // The guards are `:scope >`, not a bare descendant query: a group ITEM
  // contains its children's items, so a plain `.zf-del-btn` lookup finds a
  // child's pill and concludes the group is already decorated — leaving a
  // cluster with no delete of its own whenever a child got decorated first.
  const decorateItem = useCallback(
    (el: GridItemHTMLElement) => {
      const named = labelOf(el);
      if (!el.querySelector(":scope > .zf-cfg-btn")) {
        const cfg = document.createElement("button");
        cfg.className = "zf-cfg-btn";
        cfg.type = "button";
        cfg.title = "Edit frame";
        // Named after the card, because there is one of these per card and a
        // list of eleven "Edit frame" buttons says nothing about which is which.
        cfg.setAttribute("aria-label", `Edit ${named}`);
        cfg.innerHTML = GEAR_SVG;
        cfg.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = el.getAttribute("gs-id");
          if (id) setEditingId(id);
        });
        el.appendChild(cfg);
      }
      if (!el.querySelector(":scope > .zf-del-btn")) {
        const btn = document.createElement("button");
        btn.className = "zf-del-btn";
        btn.type = "button";
        // The `title` is load-bearing beyond the tooltip: the runtime's e2e test
        // finds this button by it. The accessible NAME is the aria-label, which
        // outranks both the title and the glyph — without it the button
        // announced as "×", since name-from-content beats a title.
        btn.title = "Remove frame";
        btn.setAttribute("aria-label", `Remove ${named}`);
        btn.innerHTML = '<span aria-hidden="true">&times;</span>';
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteItem(el);
        });
        el.appendChild(btn);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteItem, labelOf],
  );

  // `:scope >` for the same reason decorateItem uses it: stripping a group must
  // not reach in and take a child's pills with it.
  const undecorateItem = useCallback((el: GridItemHTMLElement) => {
    el.querySelector(":scope > .zf-cfg-btn")?.remove();
    el.querySelector(":scope > .zf-del-btn")?.remove();
  }, []);

  // The items that currently carry the affordances — at most the hovered card
  // and the focused card, plus the group holding either.
  const decoratedRef = useRef(new Set<GridItemHTMLElement>());
  // The two things that can call for the affordances, tracked separately and
  // decorated as a UNION. One shared "current target" would mean hovering card
  // A strips card B's pills while B still has focus — and if the focus was ON
  // one of those pills, removing it drops the keyboard user onto <body>.
  const hoverTargetRef = useRef<Element | null>(null);
  const focusTargetRef = useRef<Element | null>(null);

  // Move the gear + delete onto the item under the pointer, and off everything
  // else. They are a HOVER affordance (both are opacity:0 until their item is
  // hovered), so decorating the whole board — which is what customise mode used
  // to do on entry — put two invisible frosted pills on every card: 512 of them
  // on this repo's own 247-frame board. Each carries a `backdrop-filter`, and
  // that forces a compositing layer per pill, so entering customise mode nearly
  // tripled the board's layer count (61 → 172, measured over CDP) and scrolling
  // fell from ~72fps to ~52 with paint work doubling (159ms → 300ms per scroll
  // pass). Decorating only what the pointer is actually over holds the layer
  // count at 94 and puts scrolling back at ~68fps. Dropping the blur instead
  // was measured too and did NOT help — the elements have to not be there.
  //
  // The chain, not just the innermost item: hovering a frame inside a group
  // hovers the group as well, so both used to show their pills. Walking up
  // keeps a cluster deletable while the pointer sits on one of its children.
  //
  // Driven by FOCUS as well as the pointer, which is what makes a card
  // operable without one: nothing on a card existed until a pointer was over
  // it, so a keyboard user could tab through the bar, the rail and the palette
  // and find no control on any card at all.
  const refreshDecoration = useCallback(
    (force = false) => {
      // Mid-drag the pointer sweeps across every card it passes over; letting
      // the affordances chase it would flicker them across the board for the
      // whole gesture. The dragged item keeps whatever it had. `force` is the
      // leave-customise path, which must strip them whatever is in flight.
      if (!force && document.body.classList.contains("zf-dragging")) return;
      const chain = new Set<GridItemHTMLElement>();
      for (const target of force
        ? []
        : [hoverTargetRef.current, focusTargetRef.current]) {
        let node: Element | null = target;
        while (node) {
          const item = node.closest<GridItemHTMLElement>(".grid-stack-item");
          if (!item) break;
          chain.add(item);
          node = item.parentElement;
        }
      }
      for (const el of decoratedRef.current) {
        if (chain.has(el)) continue;
        // A deleted card takes its pills with it; only strip a live one.
        if (el.isConnected) undecorateItem(el);
        decoratedRef.current.delete(el);
      }
      for (const el of chain) {
        if (decoratedRef.current.has(el)) continue;
        decorateItem(el);
        decoratedRef.current.add(el);
      }
    },
    [decorateItem, undecorateItem],
  );

  /** Set the hovered target (null = the pointer left the board) and re-decorate.
   *  `force` strips everything regardless, for the leave-customise path. */
  const decorateChain = useCallback(
    (target: Element | null, force = false) => {
      hoverTargetRef.current = target;
      if (force) focusTargetRef.current = null;
      refreshDecoration(force);
    },
    [refreshDecoration],
  );

  /**
   * Make every card a keyboard stop while customising, and name it.
   *
   * Without this there is nothing on the board to Tab TO: the pills are the only
   * per-card controls and they only exist once something in the card has focus,
   * which is a loop with no way in. A `tabindex` on the card container is the
   * way in, and it is also what the geometry keys below hang off — so it is
   * granted with the mode and taken away with it, never left on a viewing board.
   */
  const setKeyboardAffordance = useCallback(
    (root: HTMLElement, on: boolean) => {
      const items = [
        ...(root.classList.contains("grid-stack-item") ? [root] : []),
        ...root.querySelectorAll<HTMLElement>(".grid-stack-item"),
      ];
      for (const el of items) {
        if (on) {
          el.setAttribute("tabindex", "0");
          // A bare focusable div announces nothing; `role` is what lets the
          // label be read at all.
          el.setAttribute("role", "group");
          el.setAttribute("aria-label", labelOf(el as GridItemHTMLElement));
        } else {
          el.removeAttribute("tabindex");
          el.removeAttribute("role");
          el.removeAttribute("aria-label");
        }
      }
    },
    [labelOf],
  );

  /**
   * The keyboard equivalent of a drag and of a resize: one cell per press.
   *
   * Geometry had no keyboard path of any kind — `enableMove`/`enableResize`
   * toggle GridStack's POINTER handles and nothing else — so on a board a user
   * could otherwise fully theme and save, no existing card could be moved or
   * resized at all. Returns whether the key was ours, so the caller only
   * suppresses the ones it handled.
   */
  const nudgeItem = useCallback(
    (el: GridItemHTMLElement, key: string, resize: boolean): boolean => {
      const node = el.gridstackNode;
      const grid = node?.grid ?? gridInstanceRef.current;
      if (!node || !grid) return false;
      const back = key === "ArrowLeft" || key === "ArrowUp";
      const sideways = key === "ArrowLeft" || key === "ArrowRight";
      const step = back ? -1 : 1;
      const cols = grid.getColumn();
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const w = node.w ?? 1;
      const h = node.h ?? 1;
      if (resize) {
        // The frame's own size envelope, which GridStack already carries per
        // node from the gs-min-*/gs-max-* attributes buildItemEl wrote — so a
        // keyboard resize cannot take a card outside the bounds a drag respects.
        const minW = node.minW ?? 1;
        const minH = node.minH ?? 1;
        const maxW = Math.max(minW, Math.min(node.maxW ?? cols, cols - x));
        const maxH = Math.max(minH, node.maxH ?? Number.MAX_SAFE_INTEGER);
        grid.update(
          el,
          sideways
            ? { w: clamp(w + step, minW, maxW) }
            : { h: clamp(h + step, minH, maxH) },
        );
      } else {
        grid.update(
          el,
          sideways
            ? { x: clamp(x + step, 0, Math.max(0, cols - w)) }
            : { y: Math.max(0, y + step) },
        );
      }
      // Read back off the node rather than echoing the request: the engine has
      // the last word on where an item can actually sit (row caps, collisions).
      const after = el.gridstackNode;
      setAnnouncement(
        `${labelOf(el)}: column ${(after?.x ?? x) + 1}, row ${
          (after?.y ?? y) + 1
        }, ${after?.w ?? w} by ${after?.h ?? h}`,
      );
      // One press, one undo step — the same contract a completed drag has.
      commitHistoryRef.current?.();
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelOf],
  );

  /** Set the focused target and re-decorate. Called from `focusin` and from
   *  `focusout`'s `relatedTarget`, which is the element ABOUT to take focus —
   *  reading it there is what lets a Tab from a card's gear to its own delete
   *  keep the pills in place instead of destroying the button being tabbed to. */
  const decorateFocus = useCallback(
    (target: Element | null) => {
      focusTargetRef.current = target;
      refreshDecoration();
    },
    [refreshDecoration],
  );

  // Ref-held so the []-deps GridStack callbacks (the drop handlers) can reach
  // the current one without being re-created.
  const decorateChainRef = useRef(decorateChain);
  decorateChainRef.current = decorateChain;

  // Builds the GridStack item DOM for an instance and registers its content
  // node + data. Does not render React (caller calls renderInstance).
  // `autoPosition` lets GridStack pick the first free slot (used by click-to-add,
  // where the instance has no meaningful x/y yet).
  const buildItemEl = useCallback(
    (instance: FrameInstance, autoPosition = false): GridItemHTMLElement => {
      const mode = modeRef.current;
      const horizontal = mode === "flow-horizontal";
      // Position in the active mode. flow-horizontal with no stored layout →
      // pos is undefined: auto-position so GridStack packs it into the bands.
      const pos = posFor(instance, mode);
      const w = pos?.w ?? instance.position.w;
      const rawH = pos?.h ?? instance.position.h;
      const h = horizontal ? Math.min(rawH, spec.grid.rows) : rawH;
      const def = registryRef.current.get(instance.frame);
      const layout = def?.layout;
      const el = document.createElement("div") as GridItemHTMLElement;
      el.className = "grid-stack-item";
      el.setAttribute("gs-id", instance.id);
      el.setAttribute("data-frame", instance.frame);
      if (autoPosition || !pos) {
        el.setAttribute("gs-auto-position", "true");
      } else {
        el.setAttribute("gs-x", String(pos.x));
        el.setAttribute("gs-y", String(pos.y));
      }
      el.setAttribute("gs-w", String(w));
      el.setAttribute("gs-h", String(h));
      if (layout?.minW) el.setAttribute("gs-min-w", String(layout.minW));
      if (layout?.minH) el.setAttribute("gs-min-h", String(layout.minH));
      if (layout?.maxW) el.setAttribute("gs-max-w", String(layout.maxW));
      if (layout?.maxH) el.setAttribute("gs-max-h", String(layout.maxH));
      const content = document.createElement("div");
      content.className = "grid-stack-item-content";
      el.appendChild(content);
      // A container frame's content div becomes the nested GridStack itself (see
      // mountSubGrid), so it gets NO React root of its own — registering it would
      // have FrameContent render the group's chrome into the very element
      // GridStack is about to fill with child items. Its children each get their
      // own root instead, exactly like a top-level frame.
      if (!containerGeometry(def, instance.config)) {
        contentRef.current.set(instance.id, content);
      }
      return el;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.grid.rows],
  );

  // Re-fit a group's inner row height to its CURRENT pixel height. GridStack
  // nested grids need a px cellHeight (its docs are explicit that % doesn't
  // work), so without this the children keep the height they were built with and
  // either overflow or float above the bottom of a resized group.
  const fitSubGrid = useCallback(
    (item: HTMLElement, host: HTMLElement, sub: GridStack) => {
      const rows = Number(host.dataset.subRows) || 2;
      // Measured off the ITEM, not the grid host — deliberately. `sub.cellHeight`
      // drives the host's own height, so measuring the host makes this a feedback
      // loop: each fit shrinks the box the next fit measures, converging a few
      // percent short. (That was visible in the browser as dead space under a
      // panel group's last child.) The item's height comes from the BOARD grid
      // and is unaffected by the nested row height, so it's a stable input.
      //
      // What we need is the height of the children's CONTAINING BLOCK. GridStack's
      // items are absolutely positioned, so that is the host's **padding box** —
      // which has two consequences, both live-measured and both previously wrong
      // here:
      //
      //  * The host's own padding does NOT inset them (an abs-positioned child
      //    resolves `top: 0` to the border's inner edge, padding included). So
      //    padding must NOT come off the height: `.zf-group-host--titled`'s 20px
      //    label band was subtracted and then not used by anything, landing as
      //    20px of dead space beneath the last child of every titled group.
      //  * The host IS inset from the item by the grid's `margin`, but GridStack
      //    spends that as `top`/`bottom` offsets on the absolutely-positioned
      //    content box, leaving `margin-*` at 0 — so the old marginTop/Bottom
      //    read contributed nothing and the inset went unsubtracted.
      //
      // Hence: item height, less the host's inset on each side, less its border.
      const cs = getComputedStyle(host);
      const outside =
        (parseFloat(cs.top) || 0) +
        (parseFloat(cs.bottom) || 0) +
        (parseFloat(cs.borderTopWidth) || 0) +
        (parseFloat(cs.borderBottomWidth) || 0);
      const h = item.clientHeight - outside;
      // Pre-layout (height 0) there is nothing to fit yet — the ResizeObserver in
      // mountSubGrid calls back once the browser has sized the item.
      if (h <= 0) return;
      const cell = subCellPx(h, rows);
      // The observer fires continuously through GridStack's resize animation, and
      // most of those frames land on the same row height. cellHeight() rewrites
      // the nested grid's stylesheet, so re-applying an unchanged value is pure
      // layout thrash.
      if (appliedCellPx.get(sub) === cell) return;
      appliedCellPx.set(sub, cell);
      sub.cellHeight(cell);
    },
    [],
  );
  fitSubGridRef.current = fitSubGrid;

  // Turn a container item into a real nested GridStack and mount its children.
  //
  // `makeSubGrid(el, opts, undefined, false)` is the whole trick: with
  // saveContent=false GridStack calls addGrid on the item's EXISTING content div
  // (rather than wrapping that content as a first child, which is what the
  // default `true` does and is wrong here — the group has no content of its own).
  // It also sets `node.subGrid`, which is how collectSpec reads the children back,
  // and registers the nested grid for cross-grid dragging so a card can be
  // dragged into and out of the group.
  const mountSubGrid = useCallback(
    (
      parent: GridStack,
      el: GridItemHTMLElement,
      instance: FrameInstance,
      geo: ContainerGeometry,
    ) => {
      const host = el.querySelector<HTMLElement>(
        ".grid-stack-item-content",
      ) as HTMLElement | null;
      if (!host) return;
      decorateGroupHost(el, host, instance, geo);

      const sub = parent.makeSubGrid(
        el,
        subGridOptions(geo, editingRef.current),
        undefined,
        false,
      );
      pinGroupOuterGutter(host, parent);
      subGridsRef.current.set(instance.id, sub);

      for (const child of instance.children ?? []) {
        instancesRef.current.set(child.id, child);
        const { el: childEl, content: childContent } = buildGroupChildEl(
          child,
          geo,
        );
        sub.el.appendChild(childEl);
        sub.makeWidget(childEl);
        contentRef.current.set(child.id, childContent);
        // Immediate outside a restore pass (an interactive drop is on screen);
        // deferred to the group's viewport approach during restore.
        deferRender(el, child.id);
      }

      // Every refusal gets ONE visible form: the toast the deletes already use.
      // A silently-removed card is indistinguishable from a drop that missed, so
      // the user had no way to learn the rule they had just broken.
      const refuse = (
        dropped: GridItemHTMLElement,
        origin: GridStackNode | undefined,
        reason: string,
      ) => {
        refuseDrop(sub, dropped, origin);
        // The origin grid fired its own `removed` mid-drag, so the board's count
        // is one short until the card is back in it.
        setCount(gridInstanceRef.current?.getGridItems().length ?? 0);
        setToast({ kind: "refused", reason });
      };

      // A drop lands in whichever grid the pointer was over, so the nested grid
      // needs the same new-frame handling the board has — otherwise a palette card
      // dropped into a group becomes a GridStack item with no instance behind it
      // and saves as nothing.
      sub.on(
        "dropped",
        (_event, origin: GridStackNode | undefined, node?: GridStackNode) => {
          const dropped = node?.el as GridItemHTMLElement | undefined;
          if (!dropped) return;
          const content = dropped.querySelector<HTMLElement>(
            ".grid-stack-item-content",
          );
          const frame = dropped.getAttribute("data-frame");
          if (!content || !frame) return;
          const existing = dropped.getAttribute("gs-id");
          // A card dragged in from the board (or another group) already has an
          // instance, a content node and a live React root — GridStack moved the
          // whole item element, so all of that came with it and there is nothing
          // to register. Its new parentage is simply where its DOM now sits.
          const known = !!existing && instancesRef.current.has(existing);
          const def = registryRef.current.get(frame);
          // BOTH refusals run before that early return, deliberately. A GROUP
          // dragged off the board is a *known* frame, so checking the container
          // rule after the return let it land — and since a child can carry no
          // `children`, Save then wrote the inner group as an empty box and every
          // card inside it was gone from the file, silently.
          if (def?.container) {
            refuse(
              dropped,
              known ? origin : undefined,
              "Groups can't be nested",
            );
            return;
          }
          // The 24-child cap lived only in the schema, so the 25th card dropped
          // in happily and the whole spec was refused by the server at Save —
          // after the work, with a message that may not name the group. The
          // dropped item is already in the grid, hence the strict `>`.
          if (sub.getGridItems().length > MAX_GROUP_CHILDREN) {
            refuse(
              dropped,
              known ? origin : undefined,
              `A group holds at most ${MAX_GROUP_CHILDREN} cards`,
            );
            return;
          }
          if (known) {
            commitHistoryRef.current?.();
            return;
          }
          const id = existing || uniqueId(frame);
          dropped.setAttribute("gs-id", id);
          instancesRef.current.set(id, {
            id,
            frame,
            position: {
              x: node?.x ?? 0,
              y: node?.y ?? 0,
              w: node?.w ?? def?.layout?.w ?? 1,
              h: node?.h ?? def?.layout?.h ?? 1,
            },
            config: defaultConfig(def),
          });
          contentRef.current.set(id, content);
          renderInstance(id);
          // The pointer released over this card, so it is the hovered one — give
          // it the affordances now rather than waiting for the next pointerover.
          decorateChainRef.current(dropped);
          commitHistoryRef.current?.();
          setEditingId(id);
        },
      );

      sub.on("dragstop", () => commitHistoryRef.current?.());
      sub.on("resizestop", () => commitHistoryRef.current?.());

      // A ResizeObserver rather than a one-shot rAF: the group's pixel height is
      // not final on the next frame (GridStack animates, fonts settle, the
      // customise toolbar appears and reflows the board), and a fit computed
      // against a half-laid-out box sticks — which showed up in the browser as
      // dead space under a panel group's last child. The observer also covers the
      // cases a resize handler misses: window resize, a density/gap change, and
      // the board's own column reflow.
      // Guarded because jsdom (the test environment) has no ResizeObserver, and
      // the fit is an enhancement over GridStack's own layout rather than a
      // prerequisite for it — one deferred fit is the honest fallback there.
      // Observes the ITEM for the same reason fitSubGrid measures it: the host's
      // height is an output of the fit, so watching it would feed back.
      if (typeof ResizeObserver === "function") {
        // The observer fires many times per GridStack resize animation, so the
        // fit is coalesced into one pending frame (latest box wins) instead of
        // measuring and writing a row height per notification.
        let fitFrame = 0;
        const ro = new ResizeObserver(() => {
          if (fitFrame) return;
          fitFrame = requestAnimationFrame(() => {
            fitFrame = 0;
            fitSubGrid(el, host, sub);
          });
        });
        ro.observe(el);
        subObserversRef.current.set(instance.id, ro);
      } else {
        requestAnimationFrame(() => fitSubGrid(el, host, sub));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultConfig, deferRender, fitSubGrid, renderInstance, uniqueId],
  );

  // Build an item, register it with the grid, and — when it's a container — turn
  // it into a nested grid holding its children. The one path every add/restore
  // route goes through, so nesting can't be forgotten in one of them.
  const addItemEl = useCallback(
    (
      grid: GridStack,
      instance: FrameInstance,
      autoPosition = false,
    ): GridItemHTMLElement => {
      const el = buildItemEl(instance, autoPosition);
      grid.el.appendChild(el);
      grid.makeWidget(el);
      const geo = containerGeometry(
        registryRef.current.get(instance.frame),
        instance.config,
      );
      if (geo) mountSubGrid(grid, el, instance, geo);
      // Every add and every restore comes through here, so this is the one place
      // a newly-built card (and, for a group, its children) can be given the
      // keyboard affordance without each caller remembering to.
      if (editingRef.current) setKeyboardAffordance(el, true);
      return el;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildItemEl, mountSubGrid, setKeyboardAffordance],
  );

  // Where focus was before a rebuild, when the rebuild is a mode switch:
  // teardownGrid runs first and destroys the item DOM, so by the time restore()
  // looks, `document.activeElement` is already `<body>`.
  const pendingFocusRef = useRef<FocusMemo | null>(null);

  /**
   * Put focus back where the rebuild found it.
   *
   * Two steps on purpose. The card's own element exists the moment the grid is
   * rebuilt, so focus lands inside the right card immediately and the tab
   * position is never lost. The control *inside* it is rendered by a React root
   * that has only just been asked to render, so the index lookup is retried on
   * the next frame, once that commit has happened. If the control is gone for
   * good (a config the undo removed, a delete pill that belonged to the old
   * element) focus stays on the card, which is the recoverable place to be.
   */
  const restoreFocus = useCallback((memo: FocusMemo | null) => {
    if (!memo) return;
    const find = () =>
      gridInstanceRef.current?.el.querySelector<HTMLElement>(
        `.grid-stack-item[gs-id="${memo.id}"]`,
      ) ?? null;
    const item = find();
    if (!item) return;
    const focusInner = (target: HTMLElement) => {
      const inner = [
        ...target.querySelectorAll<HTMLElement>(FOCUSABLE_IN_CARD),
      ];
      const control = memo.index === null ? undefined : inner[memo.index];
      if (control) control.focus();
      return !!control;
    };
    if (!focusInner(item)) {
      // A grid item is a plain div, so it needs to be made programmatically
      // focusable to hold the rescue. The element is thrown away by the next
      // rebuild, so the attribute never accumulates.
      if (!item.hasAttribute("tabindex")) item.setAttribute("tabindex", "-1");
      item.focus();
    }
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
      const settled = find();
      // Only chase the inner control while focus is still where we left it —
      // the user may have tabbed on in the meantime.
      if (!settled || !settled.contains(document.activeElement)) return;
      focusInner(settled);
    });
  }, []);

  // Tears down all items + roots and rebuilds the grid from a frame list.
  const restore = useCallback(
    (frames: FrameInstance[]) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      // Every card element is destroyed below, so whatever held focus would
      // otherwise fall to <body> silently — on every undo, redo, Cancel and
      // mode switch.
      const focusMemo = pendingFocusRef.current ?? captureFocusMemo();
      pendingFocusRef.current = null;
      rootsRef.current.forEach(unmountRootSoon);
      rootsRef.current.clear();
      contentRef.current.clear();
      // Renders still pending from a previous restore target elements this pass
      // is about to remove.
      clearDeferred();
      // Nested grids are recreated per item below, so the old instances are
      // dropped wholesale — keeping a stale one would leave collectSpec reading a
      // detached grid and saving the pre-undo children.
      for (const ro of subObserversRef.current.values()) ro.disconnect();
      subObserversRef.current.clear();
      subGridsRef.current.clear();
      instancesRef.current = new Map(frames.map((f) => [f.id, f]));

      grid.removeAll(true);
      grid.el
        .querySelectorAll(".grid-stack-item")
        .forEach((node) => node.remove());

      grid.batchUpdate();
      restoringRef.current = true;
      try {
        for (const f of frames) {
          // addItemEl also mounts the nested grid + child widgets for a
          // container, and registers each child in instancesRef — so an undo
          // restores a group's contents, not just the empty group. React roots
          // are deferred to viewport approach (see deferRender).
          const el = addItemEl(grid, f);
          deferRender(el, f.id);
          // No decoration pass here: these are brand-new item elements, but the
          // gear + delete follow the pointer now (decorateChain), so whichever
          // restored card the user reaches for gets them on hover. The stale set
          // still points at the items this loop just replaced — drop it so the
          // next pointerover doesn't try to strip buttons off detached nodes.
        }
      } finally {
        restoringRef.current = false;
      }
      decoratedRef.current.clear();
      grid.batchUpdate(false);
      setCount(frames.length);
      restoreFocus(focusMemo);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addItemEl, clearDeferred, deferRender, restoreFocus],
  );

  /**
   * The VERTICAL slot a frame added while the board is sideways should occupy.
   *
   * The two layouts are meant to be independently editable and losslessly
   * switchable, and this was the one place that broke: a frame added in
   * flow-horizontal kept (0,0) as its vertical position, so switching back
   * piled every one of them into the top-left corner for the grid to resolve —
   * silently, and looking exactly like the board had lost the layout.
   *
   * The other direction needs no seed: a frame added in flow-vertical simply
   * has no horizontal layout yet, and `seedHorizontal` first-fit packs exactly
   * those the first time the board goes sideways.
   */
  const seedVerticalPosition = useCallback(
    (w: number, h: number): GridPosition => {
      const taken: GridPosition[] = [];
      // Board-level items only. instancesRef is flat, so a group's children are
      // in it too — but their positions are slots inside their group and would
      // block board cells that are actually free.
      for (const el of gridInstanceRef.current?.getGridItems() ?? []) {
        const id = el.getAttribute("gs-id");
        const inst = id ? instancesRef.current.get(id) : undefined;
        if (inst) taken.push(inst.position);
      }
      return firstFreeSlot(taken, { cols: columnsRef.current, w, h });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Click-to-add: append a new frame to the grid in the first free slot.
  // The drag-in path (the `dropped` handler) covers the same job for users who
  // prefer dragging; this is the one-click equivalent.
  const addFrame = useCallback(
    (frameName: string) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      const def = registryRef.current.get(frameName);
      const id = uniqueId(frameName);
      const w = def?.layout?.w ?? 4;
      const h = def?.layout?.h ?? 3;
      const instance: FrameInstance = {
        id,
        frame: frameName,
        // Sideways, the live grid position is written to the horizontal slot
        // only, so `position` is what a mode switch will read: seed it. In
        // flow-vertical it is the active slot and `autoPosition` below fills it.
        position:
          modeRef.current === "flow-horizontal"
            ? seedVerticalPosition(w, h)
            : { x: 0, y: 0, w, h },
        config: defaultConfig(def),
      };
      instancesRef.current.set(id, instance);
      addItemEl(grid, instance, true);
      renderInstance(id);
      // Added from the palette, so the pointer is over the rail rather than the
      // new card — no decoration to place yet; hovering it will.
      setCount(grid.getGridItems().length);
      commitHistoryRef.current?.();
      // Newly added → open its settings dialog straight away (required-field
      // frames land as error cards until configured, so jump the user there).
      setEditingId(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addItemEl, defaultConfig, renderInstance, seedVerticalPosition, uniqueId],
  );

  // Pixel size of one horizontal band: the height left below the chrome / row
  // count, so the bands fill the viewport. Measured live from the grid wrapper's
  // top offset (header + toolbar above it) rather than its clientHeight — the
  // wrapper is a flex child whose height follows its own content, so reading
  // clientHeight would feed back its current (too-short) size. Reused as the
  // column width too (square-ish cells), since GridStack derives column width
  // from the element's width.
  const horizontalCellPx = useCallback(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const top =
      gridRef.current?.parentElement?.getBoundingClientRect().top ?? 120;
    const avail = vh - top - 56; // 56 ≈ pinned ticker tape + breathing room
    return Math.max(80, Math.floor(avail / spec.grid.rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.grid.rows]);

  // Tear down the live GridStack (listeners, React roots, item DOM, inline
  // sizing) so it can be re-initialised in a different mode. Shared by unmount
  // and switchMode.
  const teardownGrid = useCallback(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    // A mode switch tears down before it restores, so the focused element is
    // gone by the time restore() would look for it. Hand the memo over.
    pendingFocusRef.current = captureFocusMemo();
    const el = grid.el;
    grid.off("dropped");
    grid.off("removed");
    grid.off("drag");
    grid.off("dragstart");
    grid.off("dragstop");
    document.body.classList.remove("zf-dragging");
    rootsRef.current.forEach(unmountRootSoon);
    rootsRef.current.clear();
    contentRef.current.clear();
    clearDeferred();
    // Nested grids are destroyed along with their parent items by grid.destroy,
    // but the maps pointing at them are ours to clear — a stale entry would have
    // collectSpec read a detached grid after a mode switch.
    for (const ro of subObserversRef.current.values()) ro.disconnect();
    subObserversRef.current.clear();
    subGridsRef.current.clear();
    grid.destroy(false);
    if (el) {
      el.querySelectorAll(".grid-stack-item").forEach((node) => node.remove());
      el.style.width = "";
      el.style.height = "";
    }
    gridInstanceRef.current = null;
  }, [clearDeferred]);

  // Initialise GridStack for a layout mode and wire its drop/removal handlers.
  // flow-vertical is the classic column grid; flow-horizontal is the coerced
  // wide, height-bounded, side-scrolling grid — the element is forced wide
  // (cols × cell, square cells) so .zf-editor-grid scrolls it sideways.
  // float:true (both modes) so explicit (seeded/dragged) placements are
  // preserved, not gravity-packed: with float:false the engine compacts upward
  // after every drop, so on a busy board a dropped frame can't sit where you put
  // it and gets yanked to the only free space. The read-only renderer places
  // frames at their explicit x/y too, so honouring gaps keeps customise mode and
  // the live dashboard pixel-consistent. `cols` is the content-fitted column
  // count (ignored vertical).
  const initGrid = useCallback(
    (m: LayoutMode, cols: number): GridStack => {
      const horizontal = m === "flow-horizontal";
      const cell = horizontal ? horizontalCellPx() : rowHeightRef.current;
      const grid = GridStack.init(
        {
          column: horizontal ? cols : columnsRef.current,
          cellHeight: cell,
          margin: spec.grid.gap / 2,
          float: true,
          ...(horizontal
            ? { maxRow: spec.grid.rows, minRow: spec.grid.rows }
            : {}),
          // Off when the machine has asked for reduced motion: the engine's
          // own reflow transition is the animation, and nothing overrides it in
          // CSS. Re-applied live by the media-query effect below.
          animate: !prefersReducedMotion(),
          // The drop accept check is `el.matches('.grid-stack-item')`, so the
          // palette cards carry that class (see the `.zf-newwidget` markup) —
          // else GridStack silently rejects the drag and nothing lands.
          acceptWidgets: true,
          disableDrag: true,
          disableResize: true,
        },
        gridRef.current!,
      )!;
      grid.el.style.width = horizontal ? `${cols * cell}px` : "";

      // A palette card dropped onto the grid lands in the *active* mode, so its
      // position writes to that mode's slot (and seeds the other with a default).
      grid.on("dropped", (_event, _prev, node?: GridStackNode) => {
        const el = node?.el as GridItemHTMLElement | undefined;
        if (!el) return;
        const content = el.querySelector(
          ".grid-stack-item-content",
        ) as HTMLElement | null;
        const frame = el.getAttribute("data-frame");
        if (!content || !frame) return;
        const existing = el.getAttribute("gs-id");
        // A frame dragged OUT of a group and onto the board already has an
        // instance and a React root — it just stopped being someone's child.
        // Re-registering it here would build a second root over the live one.
        if (existing && instancesRef.current.has(existing)) {
          setCount(grid.getGridItems().length);
          commitHistoryRef.current?.();
          return;
        }
        const id = existing || uniqueId(frame);
        el.setAttribute("gs-id", id);
        const def = registryRef.current.get(frame);
        const w = node?.w ?? def?.layout?.w ?? 4;
        const h = node?.h ?? def?.layout?.h ?? 3;
        const dropPos: GridPosition = {
          x: node?.x ?? 0,
          y: node?.y ?? 0,
          w,
          h,
        };
        const instance: FrameInstance =
          modeRef.current === "flow-horizontal"
            ? {
                id,
                frame,
                // Not (0,0): that is the vertical slot, and it is what a switch
                // back to flow-vertical reads (see seedVerticalPosition).
                position: seedVerticalPosition(w, h),
                layouts: { "flow-horizontal": dropPos },
                config: defaultConfig(def),
              }
            : { id, frame, position: dropPos, config: defaultConfig(def) };
        instancesRef.current.set(id, instance);
        // A group dragged in from the palette becomes a nested grid immediately,
        // so the user can drop frames straight into it — the alternative was an
        // inert box until the board was reloaded.
        const geo = containerGeometry(def, instance.config);
        if (geo) {
          mountSubGrid(grid, el, instance, geo);
        } else {
          contentRef.current.set(id, content);
          renderInstance(id);
        }
        // Dropped under the pointer, so this IS the hovered card.
        decorateChainRef.current(el);
        setCount(grid.getGridItems().length);
        commitHistoryRef.current?.();
        setEditingId(id);
      });

      grid.on("removed", () => setCount(grid.getGridItems().length));

      // Horizontal drag-scroll state. GridStack keeps ONE handler per drag event,
      // so a second grid.on("dragstart") would replace the cursor handler below
      // rather than run beside it — the gesture hooks live in those handlers.
      //
      // `drag` fires on every pointer move, so the scroller's box is measured
      // once per gesture and the nudge is written inside one pending rAF: a rect
      // read plus a scrollLeft write per move is a forced layout per move.
      let scrollerRect: DOMRect | null = null;
      let pendingScroll = 0;
      let scrollFrame = 0;
      const endDragScroll = () => {
        scrollerRect = null;
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
        pendingScroll = 0;
      };

      // Hold the closed-hand cursor for the whole drag. A hover-only rule drops
      // as soon as GridStack slides the pointer off the dragged content box onto
      // the placeholder/grid, so pin `grabbing` on <body> from dragstart→dragstop
      // — covers the placeholder, sibling cards, and any body-appended helper.
      grid.on("dragstart", () => {
        endDragScroll();
        document.body.classList.add("zf-dragging");
      });
      grid.on("dragstop", () => {
        endDragScroll();
        document.body.classList.remove("zf-dragging");
        // One undo step per completed gesture, not per intermediate position.
        // A drag that ended where it began pushes nothing (pushHistory drops
        // structural no-ops), so ⌘Z never burns a press on a non-change.
        commitHistoryRef.current?.();
      });
      // Resizing a group re-fits its children's row height too, but that is the
      // per-group ResizeObserver's job (mountSubGrid) — it sees the settled box,
      // which this event does not. Nothing to do here but record the gesture.
      grid.on("resizestop", () => {
        endDragScroll();
        commitHistoryRef.current?.();
      });

      if (horizontal) {
        // GridStack has no horizontal drag-scroll — nudge the wrapper when the
        // pointer nears its left/right edge during a drag.
        grid.on("drag", (event: Event) => {
          const scroller = gridRef.current?.parentElement;
          if (!scroller) return;
          const cx =
            (event as MouseEvent).clientX ??
            (event as TouchEvent).touches?.[0]?.clientX;
          if (cx == null) return;
          if (!scrollerRect) scrollerRect = scroller.getBoundingClientRect();
          const edge = 64;
          if (cx < scrollerRect.left + edge) pendingScroll = -18;
          else if (cx > scrollerRect.right - edge) pendingScroll = 18;
          else pendingScroll = 0;
          if (scrollFrame || pendingScroll === 0) return;
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = 0;
            if (pendingScroll !== 0) scroller.scrollLeft += pendingScroll;
          });
        });
      }
      return grid;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      horizontalCellPx,
      spec.grid.rows,
      spec.grid.gap,
      uniqueId,
      defaultConfig,
      renderInstance,
      mountSubGrid,
      seedVerticalPosition,
    ],
  );

  // Persist the CURRENT mode's GridStack positions back into instancesRef before
  // a mode switch, so the arrangement you just made isn't lost on re-init.
  const captureLayout = useCallback(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    const m = modeRef.current;
    for (const el of grid.getGridItems()) {
      const id = el.getAttribute("gs-id");
      if (!id) continue;
      const inst = instancesRef.current.get(id);
      if (!inst) continue;
      const node = el.gridstackNode;
      if (!node) continue;
      const pos: GridPosition = {
        x: node.x ?? 0,
        y: node.y ?? 0,
        w: node.w ?? 1,
        h: node.h ?? 1,
      };
      instancesRef.current.set(
        id,
        m === "flow-horizontal"
          ? { ...inst, layouts: { ...inst.layouts, "flow-horizontal": pos } }
          : { ...inst, position: pos },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live gap: GridStack positions items absolutely, so the inter-frame gutter is
  // its `margin` (half on each side → matches the bare renderer's CSS `gap`).
  // Push every change straight to the live grid. Radius needs no effect — it
  // rides the inline --zf-frame-radius var on .zf-editor.
  useEffect(() => {
    gridInstanceRef.current?.margin(gap / 2);
  }, [gap]);

  // The currency code is read from a ref, so React has no dependency that would
  // notice a change: re-render every MOUNTED item root when the dashboard
  // currency changes, or already-mounted cards would keep quoting the old one.
  // Only rootsRef's keys — rendering every instance here would eagerly mount
  // the roots restore() deliberately deferred (this effect also runs once on
  // mount); a deferred item reads the current code when it first renders.
  useEffect(() => {
    for (const id of rootsRef.current.keys()) renderInstance(id);
  }, [currencyCode, renderInstance]);

  // Mount once: init GridStack for the saved mode, render the spec. Horizontal
  // seeds a tidy layout for any frame that doesn't have one yet.
  useEffect(() => {
    if (!gridRef.current || gridReadyRef.current) return;
    gridReadyRef.current = true;
    const horizontal = modeRef.current === "flow-horizontal";
    const cols = horizontal
      ? colsForHorizontal(spec.frames, spec.grid.rows)
      : columnsRef.current;
    gridInstanceRef.current = initGrid(modeRef.current, cols);
    restore(
      horizontal
        ? seedHorizontal(spec.frames, cols, spec.grid.rows)
        : spec.frames,
    );
    return () => {
      teardownGrid();
      gridReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter/leave customise mode: toggle drag+resize, and arm (or disarm) the
  // hover delegation that carries the per-item affordances.
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    // Nested grids get the same treatment as the board: without this a group's
    // children stay locked (or stay draggable) while the board toggles, so a
    // cluster couldn't be rearranged in customise mode at all.
    const grids = [grid, ...subGridsRef.current.values()];
    for (const g of grids) {
      g.enableMove(editing);
      g.enableResize(editing);
    }
    setKeyboardAffordance(grid.el, editing);
    if (!editing) {
      decorateChain(null, true);
      return;
    }
    // Delegated from the editor root rather than the grid element: switchMode
    // tears the GridStack down and rebuilds it, and this root outlives that.
    // pointerover only fires on boundary crossings, so the handler runs on
    // card-to-card moves, not on every pixel of pointer travel.
    const root = editorRef.current;
    if (!root) return;
    const onOver = (e: PointerEvent) =>
      decorateChain(e.target instanceof Element ? e.target : null);
    // Leaving the editor entirely (out to the header, the tape, the orb) has no
    // hovered card, so nothing should keep wearing the pills.
    const onLeave = () => decorateChain(null);
    // focusin is the keyboard's pointerover. focusout reads `relatedTarget` —
    // the element ABOUT to take focus — because acting on "focus left" alone
    // would strip a card's pills at the exact moment a Tab was travelling
    // between two of them, and removing the button being tabbed to drops focus
    // on <body>.
    const onFocusIn = (e: FocusEvent) =>
      decorateFocus(e.target instanceof Element ? e.target : null);
    const onFocusOut = (e: FocusEvent) =>
      decorateFocus(
        e.relatedTarget instanceof Element ? e.relatedTarget : null,
      );
    /**
     * Geometry from the keyboard, on the focused CARD only.
     *
     * The class check is the whole guard: an arrow key inside a frame's own
     * input, or on the gear pill, has to keep its ordinary meaning, and only the
     * card container itself is a nudge target. Modifier chords are left alone
     * too — ⌘Z belongs to the editor's own shortcut handler.
     */
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("grid-stack-item")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = target as GridItemHTMLElement;
      if (e.key.startsWith("Arrow")) {
        // Shift is the resize modifier, matching the two things a pointer can
        // do to a card: move it, or drag its corner.
        if (nudgeItem(el, e.key, e.shiftKey)) e.preventDefault();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = el.getAttribute("gs-id");
        if (id) setEditingId(id);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // Deleting the focused element would drop focus on <body>, so hand it
        // to a neighbour first — the same rescue restore() does for a rebuild.
        const owner = el.parentElement;
        const neighbour =
          el.nextElementSibling ?? el.previousElementSibling ?? null;
        deleteItem(el);
        const next =
          neighbour instanceof HTMLElement &&
          neighbour.classList.contains("grid-stack-item")
            ? neighbour
            : (owner?.querySelector<HTMLElement>(".grid-stack-item") ?? null);
        next?.focus();
      }
    };
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keydown", onKeyDown);
      decorateChain(null, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, decorateChain, decorateFocus, nudgeItem, setKeyboardAffordance]);

  /**
   * Reduced motion, applied to the grid ENGINE and re-applied live.
   *
   * GridStack was handed `animate: true` unconditionally, and its stock
   * `.grid-stack-animate` transition is never overridden anywhere — so on a
   * machine that had asked for reduced motion, every card displaced by a drag
   * still slid across the board. `setAnimation` is the engine's own switch, and
   * it has to reach the nested grids too or a cluster's children keep animating
   * inside a board that has stopped.
   */
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const apply = () => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      for (const g of [grid, ...subGridsRef.current.values()]) {
        g.setAnimation(!mq.matches);
      }
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [editing]);

  // flow-horizontal is height-locked, but the customise toolbar is a row above
  // the grid that shrinks/grows the available height as it appears/disappears.
  // Re-fit the band size live (grid.cellHeight — no re-init, no reload) so the
  // board keeps filling exactly the room left, rather than being pushed past the
  // viewport. Deferred a frame so the toolbar's DOM change is measured first.
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid || modeRef.current !== "flow-horizontal") return;
    const id = requestAnimationFrame(() => {
      const cell = horizontalCellPx();
      grid.cellHeight(cell);
      grid.el.style.width = `${grid.getColumn() * cell}px`;
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, horizontalCellPx]);

  return {
    gridInstanceRef,
    instancesRef,
    subGridsRef,
    renderInstance,
    restore,
    addFrame,
    teardownGrid,
    initGrid,
    captureLayout,
  };
}
