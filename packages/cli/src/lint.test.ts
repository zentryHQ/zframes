import type { DashboardSpec } from "@zframes/core/spec";
import { describe, expect, it } from "vitest";
import { lintSpec } from "./lint";

type FrameInput = {
  id: string;
  frame: string;
  position: { x: number; y: number; w: number; h: number };
  config: unknown;
};

// lintSpec only reads spec.frames and spec.grid.columns, so a minimal cast is
// enough — we don't need the full validated spec here.
function makeSpec(frames: FrameInput[], columns = 12): DashboardSpec {
  return { grid: { columns }, frames } as unknown as DashboardSpec;
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
    const issues = lintSpec(
      makeSpec([
        clock("a", { x: 0, y: 0, w: 2, h: 2 }),
        clock("b", { x: 4, y: 0, w: 2, h: 2 }),
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
});
