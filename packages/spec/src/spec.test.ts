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

// The event markers are hand-authored (by a human in the rail, or by the agent
// writing dashboard.json), so the schema IS the feedback loop — a typo'd date
// must fail at lint time, not render as a flag on 1 January 1970.
describe("event markers", () => {
  const marker = { date: "2026-03-18", label: "FOMC +25bp" };

  it("defaults to no events at all", () => {
    expect(DashboardSpecSchema.parse(base).events).toEqual([]);
  });

  it("accepts a calendar date and an intraday timestamp", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      events: [marker, { date: "2026-03-18T14:30", label: "CPI print" }],
    });
    expect(r.events).toHaveLength(2);
  });

  it("rejects a date that isn't ISO, or isn't a real day", () => {
    for (const date of ["18/03/2026", "March 18", "2026-13-01", "2026"]) {
      const r = DashboardSpecSchema.safeParse({
        ...base,
        events: [{ date, label: "x" }],
      });
      expect(r.success, `${date} should be rejected`).toBe(false);
    }
  });

  it("rejects an empty label — a flag with nothing to say is a mystery dot", () => {
    expect(
      DashboardSpecSchema.safeParse({
        ...base,
        events: [{ ...marker, label: "" }],
      }).success,
    ).toBe(false);
  });

  it("allows only http(s) source links", () => {
    // The tooltip renders this as a real anchor, so a javascript: URL in a spec
    // file would be script injection.
    expect(
      DashboardSpecSchema.safeParse({
        ...base,
        events: [{ ...marker, url: "https://example.com/a" }],
      }).success,
    ).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "example.com",
    ]) {
      expect(
        DashboardSpecSchema.safeParse({ ...base, events: [{ ...marker, url }] })
          .success,
        `${url} should be rejected`,
      ).toBe(false);
    }
  });

  it("carries the per-card fields through on a frame instance", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      frames: [
        {
          id: "a",
          frame: "price-events",
          position: { x: 0, y: 0, w: 4, h: 3 },
          events: [{ date: "2026-06-01", label: "Q2 earnings" }],
          showEvents: true,
          eventGroups: ["macro"],
          config: {},
        },
      ],
    });
    expect(r.frames[0].events).toHaveLength(1);
    expect(r.frames[0].eventGroups).toEqual(["macro"]);
  });

  it("hands out a fresh events array per parse, so an editing caller can't poison later parses", () => {
    const first = DashboardSpecSchema.parse(base);
    first.events.push(marker);
    expect(DashboardSpecSchema.parse(base).events).toEqual([]);
  });
});
