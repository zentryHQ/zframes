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
import type {
  DashboardSpec,
  FrameInstance,
  GridPosition,
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
  setCount: Dispatch<SetStateAction<number>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setRemoved: Dispatch<SetStateAction<{ id: string; label: string } | null>>;
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
  setCount,
  setEditingId,
  setRemoved,
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

  const renderInstance = useCallback((id: string) => {
    const content = contentRef.current.get(id);
    const instance = instancesRef.current.get(id);
    if (!content || !instance) return;
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
    },
    [renderInstance],
  );
  patchInstanceRef.current = patchInstance;

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
      const label =
        inst?.title ??
        registryRef.current.get(inst?.frame ?? "")?.label ??
        inst?.frame.replace(/-/g, " ") ??
        "Frame";
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
      const sub = subGridsRef.current.get(id);
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
      setRemoved({ id, label });
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
      if (!el.querySelector(":scope > .zf-cfg-btn")) {
        const cfg = document.createElement("button");
        cfg.className = "zf-cfg-btn";
        cfg.type = "button";
        cfg.title = "Edit frame";
        cfg.setAttribute("aria-label", "Edit frame");
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
        btn.title = "Remove frame";
        btn.innerHTML = "&times;";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteItem(el);
        });
        el.appendChild(btn);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteItem],
  );

  // `:scope >` for the same reason decorateItem uses it: stripping a group must
  // not reach in and take a child's pills with it.
  const undecorateItem = useCallback((el: GridItemHTMLElement) => {
    el.querySelector(":scope > .zf-cfg-btn")?.remove();
    el.querySelector(":scope > .zf-del-btn")?.remove();
  }, []);

  // The items that currently carry the affordances — at most the hovered card
  // and the group holding it.
  const decoratedRef = useRef(new Set<GridItemHTMLElement>());

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
  const decorateChain = useCallback(
    (target: Element | null, force = false) => {
      // Mid-drag the pointer sweeps across every card it passes over; letting
      // the affordances chase it would flicker them across the board for the
      // whole gesture. The dragged item keeps whatever it had. `force` is the
      // leave-customise path, which must strip them whatever is in flight.
      if (!force && document.body.classList.contains("zf-dragging")) return;
      const chain = new Set<GridItemHTMLElement>();
      let node: Element | null = target;
      while (node) {
        const item = node.closest<GridItemHTMLElement>(".grid-stack-item");
        if (!item) break;
        chain.add(item);
        node = item.parentElement;
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

      // A drop lands in whichever grid the pointer was over, so the nested grid
      // needs the same new-frame handling the board has — otherwise a palette card
      // dropped into a group becomes a GridStack item with no instance behind it
      // and saves as nothing.
      sub.on("dropped", (_event, _prev, node?: GridStackNode) => {
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
        // whole item element, so all of that came with it and there is nothing to
        // register. Its new parentage is simply where its DOM now sits.
        if (existing && instancesRef.current.has(existing)) {
          commitHistoryRef.current?.();
          return;
        }
        const def = registryRef.current.get(frame);
        // A group holds frames, not more groups — the spec makes a nested group
        // unrepresentable, so refuse the drop here rather than saving something
        // that won't parse.
        if (def?.container) {
          sub.removeWidget(dropped, true);
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
      });

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
      return el;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildItemEl, mountSubGrid],
  );

  // Tears down all items + roots and rebuilds the grid from a frame list.
  const restore = useCallback(
    (frames: FrameInstance[]) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addItemEl, clearDeferred, deferRender],
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
      const instance: FrameInstance = {
        id,
        frame: frameName,
        position: {
          x: 0,
          y: 0,
          w: def?.layout?.w ?? 4,
          h: def?.layout?.h ?? 3,
        },
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
    [addItemEl, defaultConfig, renderInstance, uniqueId],
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
          animate: true,
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
                position: { x: 0, y: 0, w, h },
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
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerleave", onLeave);
      decorateChain(null, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, decorateChain]);

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
