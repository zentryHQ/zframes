import type { GridItemHTMLElement, GridStack } from "gridstack";
import type { ChildFrameInstance, FrameInstance } from "@zframes/spec/spec";
import type { ContainerGeometry } from "./editor-grid";

// ── Group nesting: the pure half of the container-frame machinery ──
//
// A container frame's content box becomes a real nested GridStack (see
// mountSubGrid in editor-grid-controller.tsx). Everything here is the pure
// DOM/data logic that machinery drives — host decoration, the nested grid's
// options, child clamping, and reading the children back off the live grid at
// save time — kept free of refs and React so it can be reasoned about (and
// exercised by editor-groups.test.tsx through the editor) in isolation.

/**
 * Mark a container item's content box as the nested grid's host and restate the
 * group's own look on it.
 */
export function decorateGroupHost(
  el: GridItemHTMLElement,
  host: HTMLElement,
  instance: FrameInstance,
  geo: ContainerGeometry,
): void {
  el.setAttribute("data-container", "true");
  // `grid-stack` goes on FIRST, deliberately: GridStack.addGrid (which
  // makeSubGrid calls) only reuses the element it is handed if that element
  // already carries the class — otherwise it creates its own inner div. With
  // the class here, `sub.el === host`, so the box fitSubGrid measures is the
  // box the children are laid out in. Without it there is a silent extra
  // wrapper and the row height is computed against the wrong height.
  host.classList.add("grid-stack", "zf-group-host");
  // The group's own label. In the read-only renderer it's a flow child above
  // the subgrid; here the subgrid IS the content box, so it rides a ::before
  // fed from this attribute, with the grid inset to match. Same words, same
  // place, without a stray non-item child inside a GridStack container.
  if (instance.title) {
    host.classList.add("zf-group-host--titled");
    host.setAttribute("data-group-title", instance.title);
  }
  // `config.panel` has to be restated here too: the editor never renders the
  // renderer's `.zf-group--panel`, so without this the surrounding surface
  // appeared only after Save + reload — a WYSIWYG break in the one mode whose
  // whole job is to look like the result.
  host.classList.toggle("zf-group-host--panel", geo.panel);
  // Stashed on the element so fitSubGrid (called from resize handlers that
  // have only the DOM) doesn't need to re-resolve the instance's config. Only
  // `rows` is needed: the gap lives in the grid's own `margin` option, inside
  // each row's pitch, so the row height doesn't depend on it (see subCellPx).
  host.dataset.subRows = String(geo.rows);
}

/** The nested GridStack's options for a group's geometry. */
export function subGridOptions(geo: ContainerGeometry, editing: boolean) {
  return {
    column: geo.columns,
    maxRow: geo.rows,
    // The gap goes in as all FOUR per-side values, not just `margin` — that
    // alone was silently ignored. makeSubGrid seeds the nested grid with
    // `{...parentGrid.opts}`, which by then carries the BOARD's normalized
    // marginTop/Right/Bottom/Left, and GridStack's _initMargin only expands
    // `margin` into the sides it finds `undefined`. So the inherited board
    // gutter won every time and a group's own `gap` did nothing: groups
    // configured `gap: 8` and `gap: 6` both rendered the board's 6px inset
    // (live-measured). Setting the sides explicitly is what makes the config
    // real; `margin` stays so `sub.opts.margin` still reports the right base.
    margin: geo.gap / 2,
    marginTop: geo.gap / 2,
    marginRight: geo.gap / 2,
    marginBottom: geo.gap / 2,
    marginLeft: geo.gap / 2,
    // Same reasoning as the board grid: explicit placements are preserved
    // rather than gravity-packed, so a child stays where it was dropped.
    float: true,
    animate: true,
    acceptWidgets: true,
    disableDrag: !editing,
    disableResize: !editing,
  };
}

/**
 * Pin the group's OWN gutter back to the board's, because the host element wears
 * two hats: it is the board item's content box *and* the nested grid's root.
 * GridStack positions a content box with `top: var(--gs-item-margin-top)`,
 * and the var it reads is the one computed on this very element — which
 * makeSubGrid has just overwritten with the group's inner gap. So setting the
 * inner gap silently re-gutters the group against its board neighbours: a
 * `gap: 8` group pulled itself to 4px while every ordinary card sat at 6px
 * (live-measured). Inline offsets outrank the stylesheet rule, which puts the
 * outer gutter back under the board's control and leaves the var free to mean
 * what it should inside the group.
 */
export function pinGroupOuterGutter(
  host: HTMLElement,
  parent: GridStack,
): void {
  const outer = `${parent.opts.marginTop ?? 0}${parent.opts.marginUnit ?? "px"}`;
  host.style.top = outer;
  host.style.right = outer;
  host.style.bottom = outer;
  host.style.left = outer;
}

/**
 * Build a child's grid-item DOM, its placement clamped to the group's own
 * column/row count — the board it may have been dragged from is wider than any
 * group, and an unclamped child spills straight out of the card.
 */
export function buildGroupChildEl(
  child: ChildFrameInstance,
  geo: ContainerGeometry,
): { el: GridItemHTMLElement; content: HTMLElement } {
  const el = document.createElement("div") as GridItemHTMLElement;
  el.className = "grid-stack-item";
  el.setAttribute("gs-id", child.id);
  el.setAttribute("data-frame", child.frame);
  el.setAttribute("gs-x", String(Math.min(child.position.x, geo.columns - 1)));
  el.setAttribute("gs-y", String(Math.min(child.position.y, geo.rows - 1)));
  el.setAttribute("gs-w", String(Math.min(child.position.w, geo.columns)));
  el.setAttribute("gs-h", String(Math.min(child.position.h, geo.rows)));
  const content = document.createElement("div");
  content.className = "grid-stack-item-content";
  el.appendChild(content);
  return { el, content };
}

/**
 * Read a group's children back off its LIVE nested grid, so a child
 * dragged/resized inside the group is saved from the same source of truth as a
 * board-level move.
 */
export function collectGroupChildren(
  sub: GridStack,
  instances: ReadonlyMap<string, FrameInstance>,
): ChildFrameInstance[] {
  return (
    sub
      .getGridItems()
      .map((childEl): ChildFrameInstance | null => {
        const childId = childEl.getAttribute("gs-id");
        const childInst = childId ? instances.get(childId) : undefined;
        if (!childInst) return null;
        const cn = childEl.gridstackNode;
        // Built field by field rather than spread, because a child carries
        // neither `layouts` nor `children` — a group holds one arrangement
        // for every board mode, and groups don't nest — and a frame
        // dragged in from the board arrives still carrying its `layouts`.
        // Spreading would smuggle that into the saved child (where the
        // schema strips it on the next read, so the junk would be
        // invisible until someone diffed the file).
        return {
          id: childInst.id,
          frame: childInst.frame,
          config: childInst.config,
          ...(childInst.title !== undefined ? { title: childInst.title } : {}),
          ...(childInst.style !== undefined ? { style: childInst.style } : {}),
          ...(childInst.currency !== undefined
            ? { currency: childInst.currency }
            : {}),
          ...(childInst.events !== undefined
            ? { events: childInst.events }
            : {}),
          position: {
            x: cn?.x ?? childInst.position.x,
            y: cn?.y ?? childInst.position.y,
            w: cn?.w ?? childInst.position.w,
            h: cn?.h ?? childInst.position.h,
          },
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      // Same reason the board sorts: keep the written JSON diff-friendly.
      .sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      )
  );
}
