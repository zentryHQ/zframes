import { describe, expect, it } from "vitest";
import { DashboardSpecSchema } from "./spec";

// `title` + `frames` are the only required fields; everything else defaults.
const base = { title: "t", frames: [] };

describe("DashboardSpecSchema migration + coercion + defaults", () => {
  it("hoists a legacy grid.radius into appearance.radius and drops it from grid", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      grid: { columns: 12, radius: 10 },
    });
    expect(r.appearance.radius).toBe(10);
    expect("radius" in r.grid).toBe(false);
  });

  it("lets an explicit appearance.radius win over the legacy grid.radius", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      grid: { radius: 10 },
      appearance: { radius: 20 },
    });
    expect(r.appearance.radius).toBe(20);
  });

  it("coerces a legacy numeric version to a string", () => {
    const r = DashboardSpecSchema.parse({ ...base, version: 1 });
    expect(r.version).toBe("1");
  });

  it("applies defaults for the omitted cosmetic groups", () => {
    const r = DashboardSpecSchema.parse(base);
    expect(r.version).toBe("1.0.0");
    expect(r.grid.columns).toBe(12);
    expect(typeof r.theme.accentHue).toBe("number");
    expect(typeof r.appearance.radius).toBe("number");
  });

  it("rejects a spec missing the required title", () => {
    const r = DashboardSpecSchema.safeParse({ frames: [] });
    expect(r.success).toBe(false);
  });

  it("defaults grid.mode to flow-vertical and grid.rows to 6", () => {
    const r = DashboardSpecSchema.parse(base);
    expect(r.grid.mode).toBe("flow-vertical");
    expect(r.grid.rows).toBe(6);
  });

  it("keeps `position` (vertical) and the per-mode `layouts` override side by side", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      grid: { mode: "flow-horizontal" },
      frames: [
        {
          id: "a",
          frame: "note",
          position: { x: 0, y: 5, w: 4, h: 3 },
          layouts: { "flow-horizontal": { x: 8, y: 1, w: 4, h: 2 } },
          config: {},
        },
      ],
    });
    expect(r.frames[0].position).toEqual({ x: 0, y: 5, w: 4, h: 3 });
    expect(r.frames[0].layouts?.["flow-horizontal"]).toEqual({
      x: 8,
      y: 1,
      w: 4,
      h: 2,
    });
  });
});
