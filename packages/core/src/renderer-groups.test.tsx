// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { z } from "zod";
import { DashboardRenderer } from "./renderer";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema, MAX_GROUP_CHILDREN } from "@zframes/spec/spec";
import { FramesProvider } from "./hooks";
import type { Capability, MarketDataProvider } from "@zframes/spec/types";

// The *container* half of the renderer's placement contract: a `container: true`
// frame renders the instance's `children` as its own nested grid, so a cluster of
// cards takes one board slot and moves as a unit.
//
// What this pins, and why each one matters:
//   * a container renders `.zf-group` (not `.zf-frame`) and its children render
//     as real cards inside it — nesting goes through the ordinary FrameContent
//     path, so children get chrome, config validation and error cards for free.
//   * the child grid's units come from the GROUP's config (--zf-sub-cols/rows/gap),
//     NOT the board's. Reusing --zf-cols/--zf-gap here would make a child's
//     placement resolve against the dashboard, which is the one bug that looks
//     plausible in a screenshot: children would land in roughly-right places.
//   * child spans are CLAMPED to the group. The board grows downward so an
//     oversized frame merely pushes; a group's rows are fixed fractions of its
//     height, so an unclamped child silently spills out of the card.
//   * an EMPTY group still renders (its own hint), which is the state every
//     freshly-added group is in.
//   * a container never draws a card title row — only the optional group label.
//   * `children` on a NON-container frame is inert, so a stray field can't
//     smuggle a second render path into an ordinary card.

const provider: MarketDataProvider = {
  name: "test-provider",
  capabilities: ["day-stats"] as Capability[],
};

const boxFrame = defineFrame({
  name: "box",
  label: "Box",
  category: "tools",
  description: "a positioned box",
  capabilities: ["day-stats"],
  schema: z.object({}),
  component: () => <div data-testid="box" />,
});

// A stand-in for `group`: the renderer branches on the `container` flag, not on
// the frame's name, so this file tests the mechanism rather than one frame.
const groupFrame = defineFrame({
  name: "cluster",
  label: "Cluster",
  category: "layout",
  description: "holds other frames",
  capabilities: [],
  chrome: "bare",
  container: true,
  schema: z.object({
    columns: z.number().int().min(1).default(2),
    rows: z.number().int().min(1).default(2),
    gap: z.number().min(0).default(8),
    panel: z.boolean().default(false),
  }),
  component: () => <div data-testid="empty-hint" />,
});

const registry = createRegistry([boxFrame, groupFrame]);

interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
}

function child(id: string, position: Pos) {
  return { id, frame: "box", position, config: {} };
}

const GRID = {
  mode: "flow-vertical",
  columns: 12,
  rowHeight: 96,
  gap: 20,
  rows: 6,
};

function renderBoard(frames: Array<Record<string, unknown>>) {
  const spec = DashboardSpecSchema.parse({ title: "t", grid: GRID, frames });
  return render(
    <FramesProvider providers={[provider]}>
      <DashboardRenderer spec={spec} registry={registry} />
    </FramesProvider>,
  );
}

/** One `cluster` instance holding `children`. */
function group(
  children: Array<Record<string, unknown>>,
  config: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return {
    id: "g1",
    frame: "cluster",
    position: { x: 0, y: 0, w: 6, h: 4 },
    config,
    children,
    ...extra,
  };
}

afterEach(() => {
  cleanup();
});

describe("a container frame renders its children as a nested grid", () => {
  it("takes one board slot as .zf-group and mounts each child as a real card", () => {
    const { container } = renderBoard([
      group([
        child("c1", { x: 0, y: 0, w: 1, h: 1 }),
        child("c2", { x: 1, y: 0, w: 1, h: 2 }),
      ]),
    ]);

    // One group wrapper, holding one subgrid.
    const groups = container.querySelectorAll(".zf-group");
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelectorAll(".zf-subgrid")).toHaveLength(1);

    // The children are ordinary cards — full chrome, rendered component and all.
    const cards = container.querySelectorAll(".zf-subgrid > .zf-frame");
    expect(cards).toHaveLength(2);
    expect(container.querySelectorAll("[data-testid='box']")).toHaveLength(2);
    // …and the group is NOT itself a card, so there is no card-in-a-card.
    expect(container.querySelectorAll(".zf-grid > .zf-frame")).toHaveLength(0);
  });

  it("carries the GROUP's own grid units, not the board's", () => {
    const { container } = renderBoard([
      group([child("c1", { x: 0, y: 0, w: 1, h: 1 })], {
        columns: 3,
        rows: 4,
        gap: 6,
      }),
    ]);

    const el = container.querySelector<HTMLElement>(".zf-group")!;
    expect(el.style.getPropertyValue("--zf-sub-cols")).toBe("3");
    expect(el.style.getPropertyValue("--zf-sub-rows")).toBe("4");
    expect(el.style.getPropertyValue("--zf-sub-gap")).toBe("6px");
    // The board's own geometry stays on the board container and is not copied
    // down — a child resolves against --zf-sub-*, never --zf-cols/--zf-gap.
    expect(el.style.getPropertyValue("--zf-cols")).toBe("");
    expect(el.style.getPropertyValue("--zf-gap")).toBe("");
  });

  it("places each child in the group's units, 1-based like the board", () => {
    const { container } = renderBoard([
      group([child("c1", { x: 2, y: 1, w: 2, h: 3 })], {
        columns: 6,
        rows: 6,
      }),
    ]);

    const card = container.querySelector<HTMLElement>(".zf-subgrid > .zf-frame")!;
    expect(card.style.getPropertyValue("--zf-col-start")).toBe("3");
    expect(card.style.getPropertyValue("--zf-col-span")).toBe("2");
    expect(card.style.getPropertyValue("--zf-row-start")).toBe("2");
    expect(card.style.getPropertyValue("--zf-row-span")).toBe("3");
  });

  it("clamps a child's span to the group, which cannot grow to fit it", () => {
    // A 9x9 child inside a 2x2 group: the board would just get taller, but a
    // group's tracks are fractions of a fixed card, so this must be clamped
    // rather than spilling out of the surface.
    const { container } = renderBoard([
      group([child("c1", { x: 5, y: 7, w: 9, h: 9 })], {
        columns: 2,
        rows: 2,
      }),
    ]);

    const card = container.querySelector<HTMLElement>(".zf-subgrid > .zf-frame")!;
    expect(card.style.getPropertyValue("--zf-col-span")).toBe("2");
    expect(card.style.getPropertyValue("--zf-row-span")).toBe("2");
    // The start lines are clamped into range too, so the child stays on a track
    // that exists instead of being placed past the last one.
    expect(card.style.getPropertyValue("--zf-col-start")).toBe("2");
    expect(card.style.getPropertyValue("--zf-row-start")).toBe("2");
  });

  it("staggers the children's entrance independently of the board's", () => {
    const { container } = renderBoard([
      group([
        child("c1", { x: 0, y: 0, w: 1, h: 1 }),
        child("c2", { x: 1, y: 0, w: 1, h: 1 }),
      ]),
    ]);
    const spans = [
      ...container.querySelectorAll<HTMLElement>(".zf-subgrid > .zf-frame"),
    ].map((el) => el.style.getPropertyValue("--zf-enter-i"));
    expect(spans).toEqual(["0", "1"]);
  });
});

describe("a container's own chrome", () => {
  it("renders the group label from the instance title, not a card title row", () => {
    const { container } = renderBoard([
      group([child("c1", { x: 0, y: 0, w: 1, h: 1 })], {}, { title: "Desk" }),
    ]);
    const label = container.querySelector(".zf-group-title");
    expect(label?.textContent).toBe("Desk");
    // The card title row belongs to cards; a group has no header of that kind.
    const group0 = container.querySelector(".zf-group")!;
    expect(group0.querySelector(":scope > .zf-frame-title")).toBeNull();
  });

  it("omits the label entirely when the instance sets no title", () => {
    const { container } = renderBoard([
      group([child("c1", { x: 0, y: 0, w: 1, h: 1 })]),
    ]);
    expect(container.querySelector(".zf-group-title")).toBeNull();
  });

  it("adds the panel surface only when config asks for it", () => {
    const { container: off } = renderBoard([group([])]);
    expect(off.querySelector(".zf-group--panel")).toBeNull();
    cleanup();
    const { container: on } = renderBoard([group([], { panel: true })]);
    expect(on.querySelector(".zf-group--panel")).not.toBeNull();
  });
});

describe("edge cases a generated spec actually produces", () => {
  it("renders an empty group as its own hint rather than a void", () => {
    const { container } = renderBoard([group([])]);
    // Still a real board slot…
    expect(container.querySelector(".zf-group")).not.toBeNull();
    // …whose subgrid holds the frame's own component instead of children.
    expect(container.querySelector(".zf-subgrid--empty")).not.toBeNull();
    expect(container.querySelector("[data-testid='empty-hint']")).not.toBeNull();
  });

  it("treats a missing `children` key the same as an empty one", () => {
    const { container } = renderBoard([
      {
        id: "g1",
        frame: "cluster",
        position: { x: 0, y: 0, w: 6, h: 4 },
        config: {},
      },
    ]);
    expect(container.querySelector(".zf-subgrid--empty")).not.toBeNull();
  });

  it("gives a broken child its own error card, sparing the group and its siblings", () => {
    const { container } = renderBoard([
      group([
        { id: "bad", frame: "nope", position: { x: 0, y: 0, w: 1, h: 1 } },
        child("ok", { x: 1, y: 0, w: 1, h: 1 }),
      ]),
    ]);
    // The group still renders, the unknown child is a contained error card, and
    // the healthy sibling next to it renders normally.
    expect(container.querySelector(".zf-group")).not.toBeNull();
    expect(container.querySelectorAll(".zf-frame--error")).toHaveLength(1);
    expect(container.querySelectorAll("[data-testid='box']")).toHaveLength(1);
  });

  it("ignores `children` on a frame that is not a container", () => {
    const { container } = renderBoard([
      {
        id: "f1",
        frame: "box",
        position: { x: 0, y: 0, w: 2, h: 2 },
        config: {},
        children: [child("c1", { x: 0, y: 0, w: 1, h: 1 })],
      },
    ]);
    // A normal card, and NO nested grid: `container` on the definition is the
    // only thing that opens the nesting path.
    expect(container.querySelector(".zf-grid > .zf-frame")).not.toBeNull();
    expect(container.querySelector(".zf-subgrid")).toBeNull();
    expect(container.querySelectorAll("[data-testid='box']")).toHaveLength(1);
  });

  it("rejects a spec whose group exceeds the child ceiling", () => {
    const tooMany = Array.from({ length: MAX_GROUP_CHILDREN + 1 }, (_, i) =>
      child(`c${i}`, { x: 0, y: 0, w: 1, h: 1 }),
    );
    expect(() =>
      DashboardSpecSchema.parse({
        title: "t",
        grid: GRID,
        frames: [group(tooMany)],
      }),
    ).toThrow();
  });

  it("rejects a group nested inside a group — one level, by construction", () => {
    expect(() =>
      DashboardSpecSchema.parse({
        title: "t",
        grid: GRID,
        frames: [
          group([
            {
              id: "inner",
              frame: "cluster",
              position: { x: 0, y: 0, w: 1, h: 1 },
              config: {},
              children: [child("deep", { x: 0, y: 0, w: 1, h: 1 })],
            },
          ]),
        ],
      }),
    ).toThrow();
  });
});
