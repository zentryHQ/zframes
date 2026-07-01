import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AnyFrameDefinition } from "@zframes/spec/frame";
import {
  buildDefaultConfig,
  configFields,
  defaultForShape,
  humanizeKey,
} from "./editor-symbols";

// core sits *below* frames in the dependency graph, so the real @zframes/frames
// schemas can't be imported here. Instead we build FrameDefinition-shaped fakes
// off real Zod schemas that mirror the actual frame schemas — enough for the
// pure introspection under test, and the `.safeParse` round-trip proves the
// seeded config really would render instead of erroring.
function fakeFrame(name: string, schema: z.ZodType): AnyFrameDefinition {
  return {
    name,
    label: name,
    category: "tools",
    description: "",
    capabilities: [],
    schema,
    component: () => null,
  } as unknown as AnyFrameDefinition;
}

describe("humanizeKey", () => {
  it("splits camelCase into Title-cased words", () => {
    expect(humanizeKey("maxReferenceRates")).toBe("Max Reference Rates");
  });

  it("splits before an uppercase run after a digit but keeps the digit attached", () => {
    // regex boundary is ([a-z0-9])([A-Z]): "show2Things" -> "Show2 Things".
    expect(humanizeKey("show2Things")).toBe("Show2 Things");
  });

  it("replaces snake_case and kebab-case separators with spaces", () => {
    expect(humanizeKey("show_total")).toBe("Show total");
    expect(humanizeKey("show-total")).toBe("Show total");
  });

  it("returns the original (empty) key when there is nothing to humanize", () => {
    expect(humanizeKey("")).toBe("");
  });
});

describe("defaultForShape", () => {
  it("prefers an explicit schema default over everything else", () => {
    expect(
      defaultForShape({ type: "string", default: "D", enum: ["a", "b"] }, "x"),
    ).toBe("D");
  });

  it("uses the first enum value when there is no default", () => {
    expect(defaultForShape({ type: "string", enum: ["a", "b"] }, "x")).toBe(
      "a",
    );
  });

  it("seeds a required number to exclusiveMinimum + 1 (a .positive() field)", () => {
    // .positive() -> exclusiveMinimum: 0, so 0 itself would fail; expect 1.
    expect(defaultForShape({ type: "number", exclusiveMinimum: 0 }, "x")).toBe(
      1,
    );
  });

  it("seeds a required number to its minimum when only a minimum is set", () => {
    expect(defaultForShape({ type: "number", minimum: 3 }, "x")).toBe(3);
  });

  it("seeds an unbounded required number to 0", () => {
    expect(defaultForShape({ type: "number" }, "x")).toBe(0);
    expect(defaultForShape({ type: "integer" }, "x")).toBe(0);
  });

  it("seeds a required boolean to false", () => {
    expect(defaultForShape({ type: "boolean" }, "flag")).toBe(false);
  });

  it("maps known string keys to semantic placeholders", () => {
    expect(defaultForShape({ type: "string" }, "url")).toBe("https://");
    expect(defaultForShape({ type: "string" }, "text")).toBe("New note");
    expect(defaultForShape({ type: "string" }, "title")).toBe("Heading");
  });

  it("gives sibling symbol items distinct values by index", () => {
    expect(defaultForShape({ type: "string" }, "symbol", 0)).toBe("xyz:TSLA");
    expect(defaultForShape({ type: "string" }, "symbol", 1)).toBe("xyz:NVDA");
  });

  it("humanizes an unknown string key as its placeholder", () => {
    expect(defaultForShape({ type: "string" }, "maxRates")).toBe("Max Rates");
  });

  it("builds a min-length array of distinct symbol placeholders", () => {
    expect(
      defaultForShape(
        { type: "array", items: { type: "string" }, minItems: 2 },
        "symbols",
      ),
    ).toEqual(["xyz:TSLA", "xyz:NVDA"]);
  });

  it("returns an empty array when the array has no minItems", () => {
    expect(
      defaultForShape({ type: "array", items: { type: "string" } }, "y"),
    ).toEqual([]);
  });

  it("recurses into object required fields only", () => {
    expect(
      defaultForShape(
        {
          type: "object",
          required: ["a"],
          properties: { a: { type: "string" }, b: { type: "string" } },
        },
        "o",
      ),
    ).toEqual({ a: "A" });
  });

  it("returns null for an unrecognised shape", () => {
    expect(defaultForShape({}, "x")).toBeNull();
  });
});

describe("configFields", () => {
  it("emits one humanized field per non-symbol property", () => {
    const note = fakeFrame(
      "note",
      z.object({
        text: z.string().min(1),
        align: z.enum(["left", "center"]).default("left"),
      }),
    );
    const fields = configFields(note);
    expect(fields.map((f) => f.key)).toEqual(["text", "align"]);
    expect(fields.map((f) => f.label)).toEqual(["Text", "Align"]);
    // The shape carries the raw JSON-Schema so the rail can pick a control.
    expect(fields[1].shape.enum).toEqual(["left", "center"]);
  });

  it("drops the symbol/symbols/holdings keys the ticker picker owns", () => {
    const def = fakeFrame(
      "liveline",
      z.object({
        symbols: z.array(z.string()).min(2),
        windowSec: z.number().int().min(10).default(30),
      }),
    );
    const keys = configFields(def).map((f) => f.key);
    expect(keys).toEqual(["windowSec"]);
    expect(keys).not.toContain("symbols");
  });

  it("returns [] when the schema cannot be converted to JSON Schema", () => {
    // z.custom() has no JSON-Schema representation; z.toJSONSchema throws.
    const custom = fakeFrame(
      "custom",
      z.custom(() => false),
    );
    expect(configFields(custom)).toEqual([]);
  });
});

describe("buildDefaultConfig", () => {
  it("resolves an all-optional frame straight from safeParse({})", () => {
    const clock = fakeFrame(
      "clock",
      z.object({
        timezone: z.string().default(""),
        hour12: z.boolean().default(false),
      }),
    );
    expect(buildDefaultConfig(clock)).toEqual({
      timezone: "",
      hour12: false,
    });
  });

  it("seeds a required string field and omits optional ones", () => {
    const heading = fakeFrame(
      "heading",
      z.object({
        title: z.string().min(1),
        subtitle: z.string().optional(),
      }),
    );
    // title is required -> "Heading" placeholder; optional subtitle stays out.
    expect(buildDefaultConfig(heading)).toEqual({ title: "Heading" });
  });

  it("seeds a required symbol and lets defaulted enums fill themselves", () => {
    const priceChart = fakeFrame(
      "price-chart",
      z.object({
        symbol: z.string().min(1),
        interval: z.enum(["1m", "1h"]).default("1h"),
        mode: z.enum(["candle", "line"]).default("candle"),
      }),
    );
    expect(buildDefaultConfig(priceChart)).toEqual({
      symbol: "xyz:TSLA",
      interval: "1h",
      mode: "candle",
    });
  });

  it("seeds a min-length symbols array with exactly that many distinct items", () => {
    const liveline = fakeFrame(
      "price-liveline",
      z.object({
        symbols: z.array(z.string()).min(2).max(8),
        windowSec: z.number().int().min(10).max(300).default(30),
      }),
    );
    const cfg = buildDefaultConfig(liveline);
    expect(cfg.symbols).toEqual(["xyz:TSLA", "xyz:NVDA"]);
    expect(cfg.windowSec).toBe(30);
  });

  it("seeds a required .positive() number to satisfy the exclusive minimum", () => {
    const posn = fakeFrame("posn", z.object({ shares: z.number().positive() }));
    expect(buildDefaultConfig(posn)).toEqual({ shares: 1 });
  });

  it("seeds a required int-with-minimum to its floor", () => {
    const reqMin = fakeFrame(
      "req-min",
      z.object({ count: z.number().int().min(3) }),
    );
    expect(buildDefaultConfig(reqMin)).toEqual({ count: 3 });
  });

  it("seeds a required boolean to false", () => {
    const reqBool = fakeFrame("req-bool", z.object({ flag: z.boolean() }));
    expect(buildDefaultConfig(reqBool)).toEqual({ flag: false });
  });

  it("seeds an array of required objects with distinct nested symbols", () => {
    const portfolio = fakeFrame(
      "portfolio",
      z.object({
        holdings: z
          .array(
            z.object({
              symbol: z.string().min(1),
              shares: z.number().positive(),
            }),
          )
          .min(2),
      }),
    );
    expect(buildDefaultConfig(portfolio)).toEqual({
      holdings: [
        { symbol: "xyz:TSLA", shares: 1 },
        { symbol: "xyz:NVDA", shares: 1 },
      ],
    });
  });

  it("falls back to {} when the schema cannot be introspected and {} fails to parse", () => {
    // z.custom(() => false) rejects {} AND has no JSON-Schema form -> graceful {}.
    const custom = fakeFrame(
      "custom",
      z.custom(() => false),
    );
    expect(buildDefaultConfig(custom)).toEqual({});
  });

  // The whole point: a freshly-added frame must render, not error. For every
  // required-field schema shape, the seeded config must pass the frame's OWN
  // schema.safeParse — otherwise the palette drops in an error card.
  it.each([
    [
      "required string",
      z.object({ title: z.string().min(1), subtitle: z.string().optional() }),
    ],
    [
      "required symbol + defaulted enums",
      z.object({
        symbol: z.string().min(1),
        interval: z.enum(["1m", "1h"]).default("1h"),
      }),
    ],
    [
      "min(2) symbols array",
      z.object({ symbols: z.array(z.string()).min(2).max(8) }),
    ],
    [
      "min(1) symbols array",
      z.object({ symbols: z.array(z.string()).min(1).max(6) }),
    ],
    ["required positive number", z.object({ shares: z.number().positive() })],
    ["required int minimum", z.object({ count: z.number().int().min(3) })],
    ["required boolean", z.object({ flag: z.boolean() })],
    [
      "required url/text/title strings",
      z.object({
        url: z.string().min(1),
        text: z.string().min(1),
        title: z.string().min(1),
      }),
    ],
    [
      "min(2) holdings objects",
      z.object({
        holdings: z
          .array(
            z.object({
              symbol: z.string().min(1),
              shares: z.number().positive(),
            }),
          )
          .min(2),
      }),
    ],
  ] as const)(
    "produces a config that passes the frame's own schema: %s",
    (_name, schema) => {
      const def = fakeFrame("t", schema);
      const cfg = buildDefaultConfig(def);
      const parsed = def.schema.safeParse(cfg);
      expect(parsed.success).toBe(true);
    },
  );
});
