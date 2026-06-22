import { describe, expect, it } from "vitest";
import { DashboardSpecSchema } from "@zframes/core/spec";

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
});
