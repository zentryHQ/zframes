// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GridItemHTMLElement, GridStack, GridStackNode } from "gridstack";
import { z } from "zod";
import { DashboardEditor } from "./editor";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import type { DashboardSpec, GridPosition } from "@zframes/spec/spec";
import { FramesProvider } from "@zframes/core";
import type { MarketDataProvider } from "@zframes/spec/types";

// The editor's *nesting* contract: a container frame becomes a real nested
// GridStack whose children are live grid items, and Save reassembles the tree.
//
// GridStack drag gestures cannot be synthesized in jsdom (nor through a headless
// browser, per prior attempts), so this file pins the **machinery** the gesture
// drives rather than the gesture:
//   * the nested grid exists, is a GridStack (not a plain div), and carries the
//     group's own column count / row cap from its config — the numbers a drop
//     inside the group is resolved against.
//   * each child mounts its OWN React root, exactly like a board-level frame.
//     Children live in the editor's flat instance map, so this is what proves the
//     group didn't swallow them into its own single root.
//   * Save round-trips `children` from the LIVE nested grid, not from the spec it
//     loaded — the same source of truth a board-level move is saved from.
//   * deleting a group takes its children with it (they exist only inside it), so
//     the saved board isn't left with orphans it can never render.
//   * a child never saves `layouts` or nested `children`, both of which the spec
//     forbids on a child and a frame dragged in from the board would carry.
//   * an empty group still mounts a usable nested grid — the state every
//     freshly-added group is in, and the thing a drop needs to land in.

const provider: MarketDataProvider = { name: "none", capabilities: [] };

const probeFrame = defineFrame({
  name: "probe",
  label: "Probe",
  category: "tools",
  description: "a leaf frame",
  capabilities: [],
  schema: z.object({}),
  component: () => <span data-testid="probe" />,
});

const groupFrame = defineFrame({
  name: "cluster",
  label: "Cluster",
  category: "layout",
  description: "holds other frames",
  capabilities: [],
  chrome: "bare",
  container: true,
  layout: { w: 6, h: 4 },
  schema: z.object({
    columns: z.number().int().min(1).default(2),
    rows: z.number().int().min(1).default(2),
    gap: z.number().min(0).default(8),
    panel: z.boolean().default(false),
  }),
  component: () => <span data-testid="empty-hint" />,
});

const registry = createRegistry([probeFrame, groupFrame]);

interface ChildInput {
  id: string;
  position: GridPosition;
  title?: string;
  layouts?: Record<string, GridPosition>;
}

function specWith(
  frames: Array<Record<string, unknown>>,
  grid: Record<string, unknown> = {},
): DashboardSpec {
  return DashboardSpecSchema.parse({
    title: "editor-groups",
    grid: { columns: 12, rowHeight: 90, rows: 3, gap: 12, ...grid },
    frames,
  });
}

function leaf(id: string, position: GridPosition) {
  return { id, frame: "probe", position, config: {} };
}

function group(
  id: string,
  position: GridPosition,
  children: ChildInput[],
  config: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    frame: "cluster",
    position,
    config,
    children: children.map((c) => ({ ...c, frame: "probe", config: {} })),
    ...extra,
  };
}

function mount(spec: DashboardSpec) {
  const onSave = vi.fn();
  const view = render(
    <FramesProvider providers={[provider]}>
      <DashboardEditor spec={spec} registry={registry} onSave={onSave} />
    </FramesProvider>,
  );
  return { ...view, onSave };
}

/** The nested grid element belonging to a group item. */
function subGridEl(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `.grid-stack-item[gs-id="${id}"] > .zf-group-host`,
  );
  if (!el) throw new Error(`group "${id}" mounted no nested grid host`);
  return el;
}

function childItems(container: HTMLElement, id: string): HTMLElement[] {
  return [
    ...subGridEl(container, id).querySelectorAll<HTMLElement>(
      ":scope > .grid-stack-item",
    ),
  ];
}

async function clickSave(view: ReturnType<typeof mount>) {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Customize" }));
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Save" }));
  });
}

async function enterCustomise(view: ReturnType<typeof mount>) {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Customize" }));
  });
}

/** The live GridStack behind an element (the engine hangs itself off its own
 *  root, which is the only handle a test has on a nested grid). */
function gridOf(el: HTMLElement): GridStack {
  const grid = (el as unknown as { gridstack?: GridStack }).gridstack;
  if (!grid) throw new Error("element is not a live GridStack");
  return grid;
}

function boardGrid(container: HTMLElement): GridStack {
  const el = container.querySelector<HTMLElement>(
    ".zf-editor-grid > .grid-stack",
  );
  if (!el) throw new Error("board grid never initialised");
  return gridOf(el);
}

function boardItem(container: HTMLElement, id: string): GridItemHTMLElement {
  const el = container.querySelector<GridItemHTMLElement>(
    `.zf-editor-grid > .grid-stack > .grid-stack-item[gs-id="${id}"]`,
  );
  if (!el) throw new Error(`no board item "${id}"`);
  return el;
}

/** A palette drag helper, as `setupDragIn` builds it: the item class GridStack
 *  accepts, the frame name, a content box — and no `gs-id`, because nothing is
 *  behind it yet. */
function paletteItem(frame: string): GridItemHTMLElement {
  const el = document.createElement("div") as GridItemHTMLElement;
  el.className = "grid-stack-item";
  el.setAttribute("data-frame", frame);
  el.setAttribute("gs-w", "1");
  el.setAttribute("gs-h", "1");
  const content = document.createElement("div");
  content.className = "grid-stack-item-content";
  el.appendChild(content);
  return el;
}

/**
 * Fire a nested grid's own `dropped` handler the way the engine does.
 *
 * GridStack drags cannot be synthesized (in jsdom or through a headless
 * browser, per prior attempts), so this drives the exact function the engine
 * calls, having first put the element where the engine puts it before calling
 * it: appended to the nested grid and registered as one of its widgets.
 *
 * `from` is the grid a LIVE card was dragged out of. The engine hands the
 * original node as the handler's second argument (with its source grid and its
 * pre-drag placement on it), and that is the whole basis on which a refusal can
 * put the card back rather than delete it.
 */
function simulateDrop(
  sub: GridStack,
  el: GridItemHTMLElement,
  from?: GridStack,
): void {
  let origin: GridStackNode | undefined;
  if (from) {
    // Snapshot before the removal: removeWidget drops `el.gridstackNode`.
    const node = el.gridstackNode;
    origin = { ...node, grid: from, el } as GridStackNode;
    from.removeWidget(el, false, false);
  }
  sub.el.appendChild(el);
  sub.makeWidget(el);
  const handlers = (
    sub as unknown as {
      _gsEventHandler: Record<
        string,
        ((e: unknown, prev: unknown, node: unknown) => void) | undefined
      >;
    }
  )._gsEventHandler;
  const dropped = handlers.dropped;
  if (!dropped) throw new Error("nested grid registered no dropped handler");
  dropped({ type: "dropped" }, origin, el.gridstackNode);
}

function savedSpec(onSave: ReturnType<typeof vi.fn>): DashboardSpec {
  expect(onSave).toHaveBeenCalledTimes(1);
  return onSave.mock.calls[0][0] as DashboardSpec;
}

afterEach(() => cleanup());

describe("a container item becomes a live nested grid", () => {
  it("mounts a GridStack inside the group, carrying its own config geometry", () => {
    const { container } = mount(
      specWith([
        group(
          "g",
          { x: 0, y: 0, w: 6, h: 4 },
          [leaf("c1", { x: 0, y: 0, w: 1, h: 1 })],
          { columns: 3, rows: 2, gap: 6 },
        ),
      ]),
    );

    const host = subGridEl(container, "g");
    // The content box IS the nested grid (not a wrapper around one) — that's what
    // makes the box we measure for row height the box the children sit in.
    expect(host.classList.contains("grid-stack")).toBe(true);
    expect(host.dataset.subRows).toBe("2");
    // The gap is NOT stashed on the element: it's passed as the nested grid's own
    // margin, which GridStack spends inside each row's pitch (hence it is
    // deliberately not a term in the row height — subtracting it there too
    // stranded `rows * gap` of dead space under the last child).
    //
    // This is the group's OWN gap (6 / 2 = 3px per side), which is the regression
    // worth guarding: passing only `margin` left it inert, because makeSubGrid
    // seeds the nested grid with the parent's already-normalized opts and
    // `_initMargin` expands `margin` into the per-side keys it finds `undefined`.
    // The board's gutter therefore won, and every group rendered at 6px whatever
    // its config said — a wrong-but-plausible spacing nobody would spot by eye.
    expect(host.style.getPropertyValue("--gs-item-margin-top")).toBe("3px");
    expect(host.style.getPropertyValue("--gs-item-margin-left")).toBe("3px");
    // The group itself takes exactly one slot on the board.
    expect(
      container.querySelectorAll(
        ".zf-editor-grid > .grid-stack > .grid-stack-item",
      ),
    ).toHaveLength(1);
  });

  it("clamps a child into the group's own column/row count, not the board's", () => {
    const { container } = mount(
      specWith([
        group(
          "g",
          { x: 0, y: 0, w: 6, h: 4 },
          // Authored past the edge of a 3x2 group (legal on the 12-column board
          // it might have been dragged from).
          [leaf("c1", { x: 7, y: 5, w: 9, h: 9 })],
          { columns: 3, rows: 2 },
        ),
      ]),
    );
    const child = childItems(container, "g")[0];
    const at = (name: string) => Number(child.getAttribute(name));
    // The span is capped at the group's size, and the placement then lands wholly
    // inside it (GridStack re-packs whatever we hand it, so the contract is
    // containment, not a specific cell). Un-clamped, a 9x9 child inside a 3x2
    // group would spill straight out of the card.
    expect(at("gs-w")).toBeLessThanOrEqual(3);
    expect(at("gs-h")).toBeLessThanOrEqual(2);
    expect(at("gs-x") + at("gs-w")).toBeLessThanOrEqual(3);
    expect(at("gs-y") + at("gs-h")).toBeLessThanOrEqual(2);
  });

  it("gives every child its own React root, like a board-level frame", () => {
    const { container } = mount(
      specWith([
        group("g", { x: 0, y: 0, w: 6, h: 4 }, [
          leaf("c1", { x: 0, y: 0, w: 1, h: 1 }),
          leaf("c2", { x: 1, y: 0, w: 1, h: 1 }),
        ]),
      ]),
    );

    expect(
      childItems(container, "g").map((el) => el.getAttribute("gs-id")),
    ).toEqual(["c1", "c2"]);
    // Two separate mounted components, one per child item.
    for (const id of ["c1", "c2"]) {
      const probe = container.querySelector(
        `.grid-stack-item[gs-id="${id}"] [data-testid="probe"]`,
      );
      expect(probe, `child ${id} mounted no root`).not.toBeNull();
    }
  });

  it("shows the group's title as a label on the nested-grid host", () => {
    const { container } = mount(
      specWith([
        group(
          "g",
          { x: 0, y: 0, w: 6, h: 4 },
          [leaf("c1", { x: 0, y: 0, w: 1, h: 1 })],
          {},
          { title: "Desk" },
        ),
      ]),
    );
    const host = subGridEl(container, "g");
    // The label can't be a real child element (it would sit in GridStack's
    // absolute item flow), so it rides a data attribute + ::before.
    expect(host.getAttribute("data-group-title")).toBe("Desk");
    expect(host.classList.contains("zf-group-host--titled")).toBe(true);
  });

  it("draws the panel surface while editing, not only after a reload", () => {
    // The editor never renders the renderer's `.zf-group--panel` (a group's box is
    // a GridStack container, not a FrameContent tree), so customise mode has to
    // restate the look itself. Caught in a real browser: the panel showed up on
    // reload but not while editing — a WYSIWYG break in the one mode whose job is
    // to look like the result.
    const { container: on } = mount(
      specWith([group("g", { x: 0, y: 0, w: 6, h: 4 }, [], { panel: true })]),
    );
    expect(subGridEl(on, "g").classList.contains("zf-group-host--panel")).toBe(
      true,
    );
    cleanup();
    const { container: off } = mount(
      specWith([group("g", { x: 0, y: 0, w: 6, h: 4 }, [])]),
    );
    expect(subGridEl(off, "g").classList.contains("zf-group-host--panel")).toBe(
      false,
    );
  });

  it("mounts a usable nested grid for an EMPTY group", () => {
    const { container } = mount(
      specWith([group("g", { x: 0, y: 0, w: 6, h: 4 }, [])]),
    );
    const host = subGridEl(container, "g");
    expect(host.classList.contains("grid-stack")).toBe(true);
    expect(childItems(container, "g")).toHaveLength(0);
  });

  it("does not build a nested grid for an ordinary frame", () => {
    const { container } = mount(
      specWith([leaf("a", { x: 0, y: 0, w: 3, h: 2 })]),
    );
    expect(container.querySelector(".zf-group-host")).toBeNull();
    expect(
      container.querySelector(`.grid-stack-item[gs-id="a"][data-container]`),
    ).toBeNull();
  });
});

describe("Save reassembles the nested tree", () => {
  it("round-trips a group's children off the live nested grid", async () => {
    const view = mount(
      specWith([
        group("g", { x: 0, y: 0, w: 6, h: 4 }, [
          leaf("c1", { x: 0, y: 0, w: 1, h: 1 }),
          leaf("c2", { x: 1, y: 1, w: 1, h: 1 }),
        ]),
      ]),
    );
    await clickSave(view);

    const saved = savedSpec(view.onSave);
    expect(saved.frames).toHaveLength(1);
    const g = saved.frames[0];
    expect(g.id).toBe("g");
    expect(g.children?.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(g.children?.[0].position).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(g.children?.[1].position).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    // The children are NOT also on the board — a child saved twice renders twice.
    expect(saved.frames.map((f) => f.id)).toEqual(["g"]);
    // …and the round-tripped spec is still valid, which is what a reload does.
    expect(() => DashboardSpecSchema.parse(saved)).not.toThrow();
  });

  it("sorts children y-then-x for a diff-friendly file, not DOM order", async () => {
    const view = mount(
      specWith([
        group("g", { x: 0, y: 0, w: 6, h: 4 }, [
          // Authored bottom-first, so DOM order and sorted order differ.
          leaf("low", { x: 0, y: 1, w: 1, h: 1 }),
          leaf("high", { x: 1, y: 0, w: 1, h: 1 }),
        ]),
      ]),
    );
    await clickSave(view);
    expect(savedSpec(view.onSave).frames[0].children?.map((c) => c.id)).toEqual(
      ["high", "low"],
    );
  });

  it("never writes `layouts` or nested `children` onto a child", async () => {
    const view = mount(
      specWith([
        group("g", { x: 0, y: 0, w: 6, h: 4 }, [
          // A child that arrived carrying a board-mode layout (what a frame
          // dragged in from the board looks like).
          {
            id: "c1",
            position: { x: 0, y: 0, w: 1, h: 1 },
            layouts: { "flow-horizontal": { x: 9, y: 9, w: 1, h: 1 } },
          },
        ]),
      ]),
    );
    await clickSave(view);
    const child = savedSpec(view.onSave).frames[0].children?.[0];
    expect(child).toBeDefined();
    expect("layouts" in (child as object)).toBe(false);
    expect("children" in (child as object)).toBe(false);
  });

  it("omits `children` entirely for an empty group rather than writing []", async () => {
    const view = mount(specWith([group("g", { x: 0, y: 0, w: 6, h: 4 }, [])]));
    await clickSave(view);
    const g = savedSpec(view.onSave).frames[0];
    expect(g.children).toBeUndefined();
  });

  it("keeps a board frame and a grouped frame apart", async () => {
    const view = mount(
      specWith([
        leaf("board", { x: 0, y: 0, w: 3, h: 2 }),
        group("g", { x: 3, y: 0, w: 6, h: 4 }, [
          leaf("inside", { x: 0, y: 0, w: 1, h: 1 }),
        ]),
      ]),
    );
    await clickSave(view);
    const saved = savedSpec(view.onSave);
    expect(saved.frames.map((f) => f.id).sort()).toEqual(["board", "g"]);
    expect(saved.frames.find((f) => f.id === "g")?.children?.[0].id).toBe(
      "inside",
    );
    expect(
      saved.frames.find((f) => f.id === "board")?.children,
    ).toBeUndefined();
  });
});

describe("what a group refuses, and how", () => {
  it("refuses a group from the palette, and says why", async () => {
    // The rule is right (the file format cannot represent a nested group) but
    // the refusal was invisible: the card was removed at the moment of release
    // with no message and nothing in the board to show for it, which is
    // indistinguishable from a drop that missed.
    const view = mount(specWith([group("g", { x: 0, y: 0, w: 6, h: 4 }, [])]));
    await enterCustomise(view);
    const el = paletteItem("cluster");
    await act(async () => {
      simulateDrop(gridOf(subGridEl(view.container, "g")), el);
    });

    expect(el.isConnected).toBe(false);
    expect(view.getByRole("status").textContent).toContain(
      "Groups can't be nested",
    );
  });

  it("refuses an existing group and hands it back to the board", async () => {
    // The container check used to sit AFTER the known-frame early return, so a
    // group dragged off the board was accepted: it rendered with its children,
    // and at Save the inner group was written as a childless frame — every card
    // inside it gone from the file, silently, visible only after the reload.
    const view = mount(
      specWith([
        group("outer", { x: 0, y: 0, w: 6, h: 4 }, [
          leaf("c1", { x: 0, y: 0, w: 1, h: 1 }),
        ]),
        group("inner", { x: 6, y: 0, w: 6, h: 4 }, [
          leaf("c2", { x: 0, y: 0, w: 1, h: 1 }),
          leaf("c3", { x: 1, y: 0, w: 1, h: 1 }),
        ]),
      ]),
    );
    await enterCustomise(view);
    const board = boardGrid(view.container);
    const innerEl = boardItem(view.container, "inner");
    await act(async () => {
      simulateDrop(gridOf(subGridEl(view.container, "outer")), innerEl, board);
    });

    // Handed back rather than deleted: it is a live card with mounted React
    // roots and a nested grid of its own inside it.
    expect(innerEl.parentElement).toBe(board.el);
    expect(view.getByRole("status").textContent).toContain(
      "Groups can't be nested",
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    const saved = savedSpec(view.onSave);
    expect(saved.frames.map((f) => f.id).sort()).toEqual(["inner", "outer"]);
    const inner = saved.frames.find((f) => f.id === "inner");
    expect(inner?.children?.map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(() => DashboardSpecSchema.parse(saved)).not.toThrow();
  });

  it("refuses the 25th card at drop time rather than at Save", async () => {
    // The cap lived only in the schema, so the 25th dropped in happily, rendered
    // and dragged like the others — and then the server refused the WHOLE spec at
    // Save, writing nothing, with a message that may not even name the group.
    const children = Array.from({ length: 24 }, (_, i) => ({
      id: `c${i}`,
      frame: "probe",
      config: {},
      position: { x: i % 6, y: Math.floor(i / 6), w: 1, h: 1 },
    }));
    const view = mount(
      specWith([
        {
          id: "g",
          frame: "cluster",
          position: { x: 0, y: 0, w: 12, h: 8 },
          config: { columns: 6, rows: 8 },
          children,
        },
      ]),
    );
    await enterCustomise(view);
    const sub = gridOf(subGridEl(view.container, "g"));
    expect(childItems(view.container, "g")).toHaveLength(24);

    const el = paletteItem("probe");
    await act(async () => {
      simulateDrop(sub, el);
    });
    expect(el.isConnected).toBe(false);
    expect(childItems(view.container, "g")).toHaveLength(24);
    expect(view.getByRole("status").textContent).toContain("at most 24 cards");
  });

  it("still accepts an ordinary frame from the palette", async () => {
    // The guard rails above must not make the normal path a refusal.
    const view = mount(specWith([group("g", { x: 0, y: 0, w: 6, h: 4 }, [])]));
    await enterCustomise(view);
    const el = paletteItem("probe");
    await act(async () => {
      simulateDrop(gridOf(subGridEl(view.container, "g")), el);
    });

    expect(el.isConnected).toBe(true);
    expect(el.getAttribute("gs-id")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    expect(savedSpec(view.onSave).frames[0].children).toHaveLength(1);
  });
});

describe("deleting a group", () => {
  it("takes its children with it, leaving no orphans in the saved spec", async () => {
    const view = mount(
      specWith([
        leaf("keep", { x: 0, y: 0, w: 3, h: 2 }),
        group("g", { x: 3, y: 0, w: 6, h: 4 }, [
          leaf("c1", { x: 0, y: 0, w: 1, h: 1 }),
          leaf("c2", { x: 1, y: 0, w: 1, h: 1 }),
        ]),
      ]),
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Customize" }));
    });
    // The delete × is injected into GridStack-owned DOM on hover, so reach the
    // item first and then look inside it.
    const groupItem = view.container.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="g"]`,
    )!;
    fireEvent.pointerOver(groupItem);
    const del = view.container.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="g"] > .zf-del-btn`,
    );
    expect(del, "group item carries no delete affordance").not.toBeNull();
    await act(async () => {
      fireEvent.click(del!);
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });

    const saved = savedSpec(view.onSave);
    // The group is gone, its children did not resurface at board level, and the
    // untouched frame survived.
    expect(saved.frames.map((f) => f.id)).toEqual(["keep"]);
  });

  it("gives each child its own delete affordance in customise mode", async () => {
    const view = mount(
      specWith([
        group("g", { x: 0, y: 0, w: 6, h: 4 }, [
          leaf("c1", { x: 0, y: 0, w: 1, h: 1 }),
        ]),
      ]),
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Customize" }));
    });
    // A nested frame is configurable and removable on its own — without this the
    // only way to change one would be to delete the whole cluster.
    const childItem = view.container.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="c1"]`,
    )!;
    fireEvent.pointerOver(childItem);
    expect(childItem.querySelector(".zf-del-btn")).not.toBeNull();
    expect(childItem.querySelector(".zf-cfg-btn")).not.toBeNull();

    // Hovering a child hovers its group too, so the cluster stays deletable
    // rather than handing the pointer's arrival to the innermost card alone.
    // The group's own pill has to be a DIRECT child — a descendant query here
    // would pass on the child's, which is exactly the bug this guards.
    const groupItem = view.container.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="g"]`,
    )!;
    expect(groupItem.querySelector(":scope > .zf-del-btn")).not.toBeNull();
  });
});
