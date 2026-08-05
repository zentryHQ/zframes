import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatProblems, validateDashboardSpec } from "./validate-spec";

/**
 * THE WRITE-TIME GATE — what replaced `tests/curated-specs.test.tsx`.
 *
 * That file validated the curated showcase by statically importing it, because the
 * boards were TypeScript literals. They moved into the `dashboards` table on
 * 2026-08-05, so the same checks became a function every write runs
 * (`validateDashboardSpec`) instead of a test over a module. This file pins the
 * function, which is now the ONLY thing standing between a bad spec and the
 * database — including for community publishes, which previously got the schema
 * check and nothing else.
 *
 * Each case below is a failure that renders as a plausible board rather than an
 * obvious error, which is why it is worth a test:
 *   • unknown frame / no lazy loader → an "Unknown frame" card on the front page
 *   • dead config key               → the frame's DEFAULT value, i.e. a wrong
 *                                     number with no error anywhere
 *   • overlap                       → one card silently sitting on another
 *   • group child overflow          → the renderer clamps it, so the cluster looks
 *                                     deliberate and is the wrong size
 *   • duplicate id                  → two editor React roots fighting over one node
 *
 * The last block re-validates `scripts/curated-seed.json`. That file is the seed
 * for a fresh database, NOT the running site's source of truth — so this is a
 * secondary guard: it catches registry drift against the boards we ship, while
 * `scripts/validate-dashboards.ts` checks what is actually in the table. A board
 * edited in SQL and never exported back would pass here and fail there, which is
 * the correct division of labour.
 */

/** A minimal, genuinely valid board — the baseline each failure case perturbs. */
function goodSpec(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0.0",
    title: "t",
    grid: { columns: 12, rowHeight: 96, gap: 12, rows: 6 },
    frames: [
      {
        id: "a",
        frame: "clock",
        position: { x: 0, y: 0, w: 3, h: 2 },
        config: {},
      },
    ],
    ...overrides,
  };
}

function problemsOf(spec: unknown): string {
  const r = validateDashboardSpec(spec);
  if (r.ok) return "";
  return formatProblems(r.problems);
}

describe("validateDashboardSpec — accepts a real board", () => {
  it("passes a valid spec and returns the PARSED spec", () => {
    const r = validateDashboardSpec(goodSpec());
    expect(r.ok, problemsOf(goodSpec())).toBe(true);
    if (!r.ok) return;
    // Parsed, not the raw input: schema defaults are materialised so the stored
    // jsonb is canonical and readers never re-derive them.
    expect(r.spec.theme).toBeDefined();
    expect(r.spec.appearance).toBeDefined();
    expect(r.spec.grid.mode).toBe("flow-vertical");
  });

  it("rejects a spec the schema itself refuses, naming the path", () => {
    const r = validateDashboardSpec({ frames: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.some((p) => p.path.includes("title"))).toBe(true);
  });
});

describe("validateDashboardSpec — the registry checks", () => {
  it("rejects a frame name that is not registered", () => {
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "a",
            frame: "clokc",
            position: { x: 0, y: 0, w: 3, h: 2 },
            config: {},
          },
        ],
      }),
    );
    expect(out).toMatch(/unknown frame "clokc"/);
  });

  it("rejects a config that fails its own frame's schema", () => {
    // hero-number requires a non-empty `value`.
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "a",
            frame: "hero-number",
            position: { x: 0, y: 0, w: 3, h: 2 },
            config: { value: "" },
          },
        ],
      }),
    );
    expect(out).toMatch(/config\.value/);
  });

  it("reports a config key the frame no longer has — the silent one", () => {
    // Inert, not invalid: the card renders with the frame's default instead of
    // the authored value, showing a wrong number with nothing flagged.
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "a",
            frame: "clock",
            position: { x: 0, y: 0, w: 3, h: 2 },
            config: { timezone: "UTC", tz: "UTC" },
          },
        ],
      }),
    );
    expect(out).toMatch(/config\.tz/);
    expect(out).toMatch(/no such config field/);
  });
});

describe("validateDashboardSpec — geometry", () => {
  it("rejects a frame that runs off the right edge of the grid", () => {
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "a",
            frame: "clock",
            position: { x: 10, y: 0, w: 4, h: 2 },
            config: {},
          },
        ],
      }),
    );
    expect(out).toMatch(/exceeds the board's 12 columns/);
  });

  it("rejects two cards on the same cells", () => {
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "a",
            frame: "clock",
            position: { x: 0, y: 0, w: 4, h: 2 },
            config: {},
          },
          {
            id: "b",
            frame: "clock",
            position: { x: 2, y: 1, w: 4, h: 2 },
            config: {},
          },
        ],
      }),
    );
    expect(out).toMatch(/overlaps/);
  });
});

describe("validateDashboardSpec — grouped children", () => {
  const group = (children: unknown[], config: Record<string, unknown> = {}) =>
    goodSpec({
      frames: [
        {
          id: "g",
          frame: "group",
          position: { x: 0, y: 0, w: 6, h: 4 },
          config: { columns: 2, rows: 2, ...config },
          children,
        },
      ],
    });

  it("accepts a well-formed cluster", () => {
    const spec = group([
      {
        id: "c1",
        frame: "clock",
        position: { x: 0, y: 0, w: 1, h: 1 },
        config: {},
      },
      {
        id: "c2",
        frame: "clock",
        position: { x: 1, y: 0, w: 1, h: 2 },
        config: {},
      },
    ]);
    expect(validateDashboardSpec(spec).ok, problemsOf(spec)).toBe(true);
  });

  it("rejects a child that does not fit its GROUP's inner grid", () => {
    // Legal on the 12-column board, illegal in a 2x2 group — and the renderer
    // clamps rather than spilling, so this is invisible without the check.
    const out = problemsOf(
      group([
        {
          id: "c1",
          frame: "clock",
          position: { x: 0, y: 0, w: 6, h: 1 },
          config: {},
        },
      ]),
    );
    expect(out).toMatch(/does not fit its group's 2x2 inner grid/);
  });

  it("rejects two children sharing cells inside one group", () => {
    const out = problemsOf(
      group([
        {
          id: "c1",
          frame: "clock",
          position: { x: 0, y: 0, w: 2, h: 1 },
          config: {},
        },
        {
          id: "c2",
          frame: "clock",
          position: { x: 1, y: 0, w: 1, h: 1 },
          config: {},
        },
      ]),
    );
    expect(out).toMatch(/overlaps a sibling inside "g"/);
  });

  it("validates a CHILD's frame name and config, not just the group's", () => {
    const out = problemsOf(
      group([
        {
          id: "c1",
          frame: "not-a-frame",
          position: { x: 0, y: 0, w: 1, h: 1 },
          config: {},
        },
      ]),
    );
    expect(out).toMatch(/unknown frame "not-a-frame"/);
    expect(out).toMatch(/children\[0\]/);
  });
});

describe("validateDashboardSpec — ids and safety", () => {
  it("rejects a duplicate id, including one shared with a grouped child", () => {
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "dup",
            frame: "group",
            position: { x: 0, y: 0, w: 6, h: 4 },
            config: { columns: 2, rows: 2 },
            children: [
              {
                id: "dup",
                frame: "clock",
                position: { x: 0, y: 0, w: 1, h: 1 },
                config: {},
              },
            ],
          },
        ],
      }),
    );
    expect(out).toMatch(/duplicate instance id "dup"/);
  });

  it("rejects an unsafe URL scheme anywhere in the spec", () => {
    const out = problemsOf(
      goodSpec({
        frames: [
          {
            id: "a",
            frame: "image",
            position: { x: 0, y: 0, w: 3, h: 2 },
            config: { url: "javascript:alert(1)" },
          },
        ],
      }),
    );
    expect(out).toMatch(/unsafe URL scheme/);
  });
});

describe("the shipped curated seed still validates", () => {
  // Secondary guard — see the header. This is the bootstrap data, so a frame
  // rename still fails CI for the boards we ship; the live table is checked by
  // scripts/validate-dashboards.ts.
  const seed = JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "scripts", "curated-seed.json"),
      "utf8",
    ),
  ) as { id: string; landingOrder: number | null; spec: unknown }[];

  it("ships a non-empty seed with unique ids", () => {
    expect(seed.length).toBeGreaterThan(0);
    const ids = seed.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares a contiguous landing order starting at 0", () => {
    // The landing stack renders these in order; a gap or a duplicate would make
    // two boards fight for one slot in the sticky scroll.
    const orders = seed
      .map((s) => s.landingOrder)
      .filter((o): o is number => o !== null)
      .sort((a, b) => a - b);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it.each(seed.map((s) => [s.id, s] as const))(
    "curated board %s validates against the live registry",
    (id, entry) => {
      const result = validateDashboardSpec(entry.spec);
      if (!result.ok)
        throw new Error(
          `${id} is invalid:\n${formatProblems(result.problems)}`,
        );
      expect(result.ok).toBe(true);
    },
  );
});
