import type { DashboardSpec } from "@zframes/spec/spec";
import { describe, expect, it } from "vitest";
import { frameMetas } from "@zframes/frames/schemas";
import { lintSpec } from "./lint";

type Pos = { x: number; y: number; w: number; h: number };
type FrameInput = {
  id: string;
  frame: string;
  position: Pos;
  layouts?: { "flow-horizontal"?: Pos };
  config: unknown;
  children?: FrameInput[];
};

// lintSpec only reads spec.frames + spec.grid.{columns,rows}, so a minimal cast
// is enough — we don't need the full validated spec here.
function makeSpec(frames: FrameInput[], columns = 12, rows = 6): DashboardSpec {
  return { grid: { columns, rows }, frames } as unknown as DashboardSpec;
}

const clock = (id: string, pos: FrameInput["position"]): FrameInput => ({
  id,
  frame: "clock",
  position: pos,
  config: {}, // clock is all-optional → valid
});

describe("lintSpec", () => {
  it("returns no issues for an empty dashboard", () => {
    expect(lintSpec(makeSpec([]))).toEqual([]);
  });

  it("returns no issues for valid, non-overlapping, in-bounds frames", () => {
    // The span comes from clock's own `layout` rather than a literal: this
    // asserts a CLEAN result, so any hard-coded size would start failing the day
    // clock's measured floor moved past it — which is a fact about clock, not a
    // regression in the linter.
    const { w, h } = frameMetas.find((m) => m.name === "clock")!.layout!;
    const issues = lintSpec(
      makeSpec([
        clock("a", { x: 0, y: 0, w, h }),
        clock("b", { x: w + 1, y: 0, w, h }),
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a duplicate frame id", () => {
    const issues = lintSpec(
      makeSpec([
        clock("dup", { x: 0, y: 0, w: 2, h: 2 }),
        clock("dup", { x: 4, y: 0, w: 2, h: 2 }),
      ]),
    );
    expect(issues.some((i) => /duplicate frame id/.test(i.message))).toBe(true);
  });

  it("flags an unknown frame name", () => {
    const issues = lintSpec(
      makeSpec([
        {
          id: "x",
          frame: "does-not-exist",
          position: { x: 0, y: 0, w: 2, h: 2 },
          config: {},
        },
      ]),
    );
    expect(issues.some((i) => /unknown frame/.test(i.message))).toBe(true);
  });

  it("surfaces a frame's invalid config with the Zod field path", () => {
    const issues = lintSpec(
      makeSpec([
        {
          id: "img",
          frame: "image",
          position: { x: 0, y: 0, w: 2, h: 2 },
          config: { url: "" }, // image.url is required, min length 1
        },
      ]),
    );
    expect(issues.some((i) => i.message.startsWith("config.url"))).toBe(true);
  });

  it("flags a frame that overflows the grid columns", () => {
    const issues = lintSpec(
      makeSpec([clock("wide", { x: 10, y: 0, w: 5, h: 2 })], 12),
    );
    expect(issues.some((i) => /overflows the grid/.test(i.message))).toBe(true);
  });

  it("flags a flow-horizontal layout that overflows the row bands", () => {
    const overflowing = lintSpec(
      makeSpec(
        [
          {
            ...clock("h", { x: 0, y: 0, w: 2, h: 2 }),
            layouts: { "flow-horizontal": { x: 20, y: 4, w: 2, h: 4 } }, // 4+4 > 6
          },
        ],
        12,
        6,
      ),
    );
    expect(
      overflowing.some((i) => /horizontal layout overflows/.test(i.message)),
    ).toBe(true);

    // x grows freely (sideways scroll), so a large x alone is fine.
    const wideButInBand = lintSpec(
      makeSpec(
        [
          {
            ...clock("h", { x: 0, y: 0, w: 2, h: 2 }),
            layouts: { "flow-horizontal": { x: 99, y: 0, w: 2, h: 6 } },
          },
        ],
        12,
        6,
      ),
    );
    expect(
      wideButInBand.some((i) => /horizontal layout overflows/.test(i.message)),
    ).toBe(false);
  });

  /**
   * The frames are picked from the registry by the property under test rather
   * than named, so these keep testing the rule when the bounds themselves move —
   * they are derived by measurement (`.github/scripts/frame-size-probe.ts`) and
   * are expected to change as frames do. A hard-coded `clock` at 1×1 would go
   * green the day clock's floor dropped to 1, testing nothing.
   */
  const withMinimum = frameMetas.find(
    (m) => (m.layout?.minW ?? 1) > 1 && (m.layout?.minH ?? 1) > 1,
  );
  const withCeiling = frameMetas.find(
    (m) => m.layout?.maxW != null || m.layout?.maxH != null,
  );

  it("flags a frame placed below its declared minimum size", () => {
    expect(withMinimum, "no frame declares a floor above 1×1").toBeDefined();
    const layout = withMinimum!.layout!;
    const issues = lintSpec(
      makeSpec([
        {
          id: "tiny",
          frame: withMinimum!.name,
          position: { x: 0, y: 0, w: layout.minW! - 1, h: layout.minH! - 1 },
          // Config is irrelevant to the geometry check; an invalid one just adds
          // its own issues alongside the one under test.
          config: {},
        },
      ]),
    );
    expect(issues.some((i) => /is below its .* minimum/.test(i.message))).toBe(
      true,
    );
  });

  it("flags a frame stretched past its declared maximum size", () => {
    expect(withCeiling, "no frame declares a ceiling").toBeDefined();
    const layout = withCeiling!.layout!;
    const issues = lintSpec(
      makeSpec(
        [
          {
            id: "huge",
            frame: withCeiling!.name,
            position: {
              x: 0,
              y: 0,
              w: layout.maxW != null ? layout.maxW + 1 : layout.w,
              h: layout.maxH != null ? layout.maxH + 1 : layout.h,
            },
            config: {},
          },
        ],
        // Widen the board so an over-wide frame trips the SIZE check rather than
        // the grid-overflow one.
        24,
      ),
    );
    expect(issues.some((i) => /is above its .* maximum/.test(i.message))).toBe(
      true,
    );
  });

  it("accepts a frame placed at exactly its declared bounds", () => {
    const meta = withMinimum!;
    const layout = meta.layout!;
    for (const [w, h] of [
      [layout.minW!, layout.minH!],
      [layout.w, layout.h],
      [layout.maxW ?? layout.w, layout.maxH ?? layout.h],
    ]) {
      const issues = lintSpec(
        makeSpec(
          [
            {
              id: "ok",
              frame: meta.name,
              position: { x: 0, y: 0, w, h },
              config: {},
            },
          ],
          24,
        ),
      );
      expect(
        issues.filter((i) => /minimum|maximum/.test(i.message)),
        `${meta.name} at ${w}×${h}`,
      ).toEqual([]);
    }
  });

  it("flags overlapping frames but not merely touching ones", () => {
    const overlapping = lintSpec(
      makeSpec([
        clock("a", { x: 0, y: 0, w: 5, h: 5 }),
        clock("b", { x: 2, y: 2, w: 5, h: 5 }),
      ]),
    );
    expect(overlapping.some((i) => /overlaps frame/.test(i.message))).toBe(
      true,
    );

    const touching = lintSpec(
      makeSpec([
        clock("a", { x: 0, y: 0, w: 5, h: 5 }),
        clock("b", { x: 5, y: 0, w: 5, h: 5 }),
      ]),
    );
    expect(touching.some((i) => /overlaps frame/.test(i.message))).toBe(false);
  });

  it("flags children on a non-container frame", () => {
    const issues = lintSpec(
      makeSpec([
        {
          ...clock("host", { x: 0, y: 0, w: 3, h: 2 }),
          children: [clock("kid", { x: 0, y: 0, w: 1, h: 1 })],
        },
      ]),
    );
    expect(issues.some((i) => /not a container/.test(i.message))).toBe(true);
  });

  const group = (
    children: FrameInput[],
    columns = 2,
    rows = 2,
  ): FrameInput => ({
    id: "cluster",
    frame: "group",
    position: { x: 0, y: 0, w: 6, h: 4 },
    config: { columns, rows },
    children,
  });

  it("accepts a valid group and its children", () => {
    const issues = lintSpec(
      makeSpec([
        group([
          clock("kid-a", { x: 0, y: 0, w: 1, h: 1 }),
          clock("kid-b", { x: 1, y: 0, w: 1, h: 1 }),
          clock("kid-c", { x: 0, y: 1, w: 2, h: 1 }),
        ]),
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("validates children: unknown frame, bad config, group-in-group", () => {
    const issues = lintSpec(
      makeSpec([
        group([
          {
            id: "ghost",
            frame: "does-not-exist",
            position: { x: 0, y: 0, w: 1, h: 1 },
            config: {},
          },
          {
            id: "img",
            frame: "image",
            position: { x: 1, y: 0, w: 1, h: 1 },
            config: { url: "" },
          },
          {
            id: "nested",
            frame: "group",
            position: { x: 0, y: 1, w: 2, h: 1 },
            config: {},
          },
        ]),
      ]),
    );
    expect(
      issues.some(
        (i) => i.frameId === "ghost" && /unknown frame/.test(i.message),
      ),
    ).toBe(true);
    expect(
      issues.some(
        (i) => i.frameId === "img" && i.message.startsWith("config.url"),
      ),
    ).toBe(true);
    expect(
      issues.some(
        (i) => i.frameId === "nested" && /do not nest/.test(i.message),
      ),
    ).toBe(true);
  });

  it("flags a child that overflows or overlaps within the group's own grid", () => {
    const issues = lintSpec(
      makeSpec([
        group([
          // x(1) + w(2) > 2 columns
          clock("wide-kid", { x: 1, y: 0, w: 2, h: 1 }),
          clock("kid-a", { x: 0, y: 1, w: 2, h: 1 }),
          clock("kid-b", { x: 0, y: 1, w: 1, h: 1 }),
        ]),
      ]),
    );
    expect(
      issues.some(
        (i) =>
          i.frameId === "wide-kid" && /overflows its group/.test(i.message),
      ),
    ).toBe(true);
    expect(
      issues.some(
        (i) =>
          i.frameId === "kid-a" &&
          /overlaps frame "kid-b" inside group/.test(i.message),
      ),
    ).toBe(true);
  });

  it("flags a child id colliding with a board-level id", () => {
    const issues = lintSpec(
      makeSpec([
        clock("dup", { x: 6, y: 0, w: 2, h: 2 }),
        group([clock("dup", { x: 0, y: 0, w: 1, h: 1 })]),
      ]),
    );
    expect(issues.some((i) => /duplicate frame id/.test(i.message))).toBe(true);
  });
});
