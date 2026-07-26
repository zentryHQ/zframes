import { describe, expect, it } from "vitest";
// `tests/` is not a package, so a bare `zod` specifier has nowhere to resolve
// from — the repo root installs only its own devDependencies. Reach the one
// zod the workspace installed through the link in the package under test, so
// the `z` that builds these schemas is the same realpath (and therefore the
// same module instance) that `editor-symbols.ts` calls `toJSONSchema` from.
import { z } from "../packages/editor/node_modules/zod";
import { allFrameMetas } from "../packages/frames/src/schemas";
import type { AnyFrameDefinition } from "../packages/spec/src/frame";
import {
  configFields,
  detectSymbolControl,
  type JsonShape,
  type SymbolControl,
} from "../packages/editor/src/editor-symbols";

/**
 * Pins the contract between the frame registry and the editor's config rail:
 * every config field of every frame is editable in exactly one place.
 *
 * The rail has two halves. `detectSymbolControl` decides whether a frame gets
 * the rich ticker picker (by introspecting its schema for a `symbol`,
 * `symbols`, or `holdings` property), and `configFields` generates a plain
 * control for every *other* property — it strips those three keys
 * unconditionally, because the picker owns them.
 *
 * Nothing links the two. If `detectSymbolControl` returns null for a frame that
 * does have a symbol field, `configFields` still drops the field, so the ticker
 * becomes editable NOWHERE: no picker, no generic control. The frame keeps
 * rendering perfectly with its seeded default, which is exactly why the
 * 230-frame render smoke cannot see it — the only symptom is a user who cannot
 * change the symbol. The likely triggers are ordinary: an unusual schema
 * wrapper making `isType(props.symbol, "string")` false, or a frame rename
 * outdating the hard-coded fallback list at the bottom of the detector.
 *
 * Coverage is uneven across the picker's three kinds, on purpose and pinned:
 * the `symbol` and `symbols` halves are exercised by real registry frames (24
 * and 17 of them), while `holdings` is reached only by the synthetic schemas in
 * the branch suite below, because no shipped frame declares a `holdings` config
 * property. "Pins the contract" therefore means *the two legs the registry can
 * reach*; the third is guarded by the census test, which fails the day a
 * holdings frame ships and the leg goes live.
 *
 * It lives in repo-level `tests/` because it must import BOTH sides at once,
 * which the ESLint layer DAG forbids from inside either package (frames never
 * see the editor, and `packages/frames`' manifest has no `@zframes/editor`
 * dependency). Imports are relative for the same reason the sibling guards
 * are: `tests/` is not a package.
 */

/**
 * Mirror of the module-private `SYMBOL_FIELD_KEYS` in editor-symbols.ts — the
 * keys `configFields` refuses to emit a generic control for. Duplicated
 * because it is not exported.
 *
 * Drift is detectable for `symbol` and `symbols` only. The partition test below
 * catches a change to either, because a registry frame declares each key, so the
 * rail's two halves visibly double-count it (key dropped from the real set) or
 * drop it (key added): verified by mutation on a copy of the source outside the
 * repo — deleting "symbol" makes 24 frames fail that test, deleting "symbols"
 * makes 17. The `holdings` leg is dormant: no shipped frame declares a
 * `holdings` config property, so deleting it from the real set leaves all of
 * these tests green. The census test pins that gap so it stops being silent.
 */
const SYMBOL_FIELD_KEYS = ["symbol", "symbols", "holdings"] as const;

/**
 * Which config key each control kind claims ownership of. `holdings` is dead
 * against today's registry (see the census test) and goes live the moment a
 * frame declares that field.
 */
const KEY_FOR_KIND: Record<SymbolControl["kind"], string> = {
  single: "symbol",
  symbols: "symbols",
  holdings: "holdings",
};

/** The six frame names the detector falls back to when introspection fails. */
const FALLBACK_SINGLE = ["price-chart"];
const FALLBACK_SYMBOLS = [
  "price-liveline",
  "price-ticker",
  "funding-rate-chart",
  "funding-heatmap",
  "price-compare",
];

/**
 * Both functions under test read only `name` and `schema`, so a React-free
 * `FrameMeta` from the registry is a valid stand-in for the `FrameDefinition`
 * the editor passes them. (`tests/` cannot import the components: that is the
 * whole reason `schemas.ts` exists.)
 */
function asDef(meta: { name: string; schema: z.ZodType }): AnyFrameDefinition {
  return meta as unknown as AnyFrameDefinition;
}

/** A FrameDefinition-shaped fake built off a real Zod schema. */
function fakeFrame(name: string, schema: z.ZodType): AnyFrameDefinition {
  return asDef({ name, schema });
}

/**
 * The frame's JSON-Schema property keys, or null when the schema has no
 * JSON-Schema form (which is what sends the detector into its name fallback).
 */
function propertyKeys(def: AnyFrameDefinition): string[] | null {
  try {
    const schema = z.toJSONSchema(def.schema, { io: "input" }) as JsonShape;
    return Object.keys(schema.properties ?? {});
  } catch {
    return null;
  }
}

/** The symbol-shaped config keys a frame actually declares. */
function symbolKeysOf(def: AnyFrameDefinition): string[] {
  const keys = propertyKeys(def) ?? [];
  return SYMBOL_FIELD_KEYS.filter((key) => keys.includes(key));
}

const registry = allFrameMetas.map(asDef);

describe("frame registry ↔ editor symbol control", () => {
  it("gives every frame with a symbol-shaped config field a ticker control", () => {
    const offenders: string[] = [];
    let withSymbolField = 0;
    for (const def of registry) {
      const declared = symbolKeysOf(def);
      if (declared.length === 0) continue;
      withSymbolField += 1;
      const control = detectSymbolControl(def);
      if (!control) {
        offenders.push(`${def.name} (declares ${declared.join(", ")})`);
        continue;
      }
      if (!declared.includes(KEY_FOR_KIND[control.kind]))
        offenders.push(
          `${def.name} (declares ${declared.join(", ")}, ` +
            `picker owns ${KEY_FOR_KIND[control.kind]})`,
        );
    }
    expect(
      offenders,
      "These frames declare a symbol field the ticker picker does not claim. " +
        "configFields strips symbol/symbols/holdings unconditionally, so the " +
        "field is editable nowhere — no picker and no generic control. The " +
        "frame still renders with its seeded default, so only a user notices:\n" +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
    // Anti-vacuity floor: the check above is a "no offenders" list, so a
    // registry that stopped exposing schemas must not read as fully covered.
    // 41 of the 230 frames declare a symbol field today — and that 41 is
    // 24 `symbol` + 17 `symbols` + 0 `holdings`, which is exactly why this
    // floor cannot speak for the holdings leg. The census test does.
    expect(withSymbolField).toBeGreaterThan(35);
    expect(registry.length).toBeGreaterThan(200);
  });

  it("partitions every config field between the picker and the generic rail", () => {
    // The user-facing contract: each schema property is editable in exactly
    // one place. A key missing from both halves is uneditable; a key in both
    // is two controls writing the same config field.
    const offenders: string[] = [];
    for (const def of registry) {
      const declared = propertyKeys(def);
      if (declared === null) continue; // covered by the unrepresentable test
      const control = detectSymbolControl(def);
      const editable = [
        ...configFields(def).map((field) => field.key),
        ...(control ? [KEY_FOR_KIND[control.kind]] : []),
      ].sort();
      if (JSON.stringify(editable) !== JSON.stringify([...declared].sort()))
        offenders.push(
          `${def.name}: declares [${[...declared].sort().join(", ")}] ` +
            `but the rail edits [${editable.join(", ")}]`,
        );
    }
    expect(
      offenders,
      "Config fields must be editable exactly once — a key in neither half " +
        "cannot be changed at all, a key in both gets two controls writing " +
        "it:\n" +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("pins the per-kind census, so the dormant holdings leg is not silent", () => {
    // Which control kinds the registry actually reaches — i.e. which legs of
    // the mirrored SYMBOL_FIELD_KEYS the two tests above can police at all.
    const kinds = { single: 0, symbols: 0, holdings: 0, none: 0 };
    for (const def of registry)
      kinds[detectSymbolControl(def)?.kind ?? "none"] += 1;

    // Exact, not a floor — the zero IS the assertion. No shipped frame declares
    // a `holdings` config property today (`portfolio-holdings` only has a
    // holdings *count*), so the holdings picker is exercised solely by the
    // synthetic schemas in the branch suite below, and `KEY_FOR_KIND.holdings`
    // plus the "holdings" entry in the mirror are dead code against the
    // registry. Mutation-proved: deleting "holdings" from the real
    // SYMBOL_FIELD_KEYS leaves every test in this file green.
    expect(
      kinds.holdings,
      "A frame now routes to the holdings picker, so the holdings leg of " +
        "SYMBOL_FIELD_KEYS / KEY_FOR_KIND just went live and the two tests " +
        "above started policing it. That is the news this assertion exists to " +
        "deliver: update this census and the mirror's doc comment rather than " +
        "just bumping the number.",
    ).toBe(0);
    // A frame declaring a wrong-shaped `holdings` (array of numbers, objects
    // with no `symbol`) would leave this zero intact — that near miss is the
    // first test's job, which counts declared keys rather than routed ones.

    // Anti-vacuity floors for the two live legs (24 + 17 today): without them
    // a registry whose schemas all stopped converting would report
    // `holdings: 0` too, and this test would pass while meaning nothing.
    expect(kinds.single).toBeGreaterThan(20);
    expect(kinds.symbols).toBeGreaterThan(14);
  });

  it("keeps every registry schema representable as JSON Schema", () => {
    // Both functions degrade when z.toJSONSchema throws: configFields returns
    // [] (a frame with NO editable fields) and the detector falls back to the
    // hard-coded name list. No shipped frame may depend on that path.
    const unrepresentable = registry
      .filter((def) => propertyKeys(def) === null)
      .map((def) => def.name);
    expect(unrepresentable).toEqual([]);
  });

  it("keeps the hard-coded fallback names in the registry and redundant", () => {
    // The fallback list is the detector's only frame-specific knowledge, so a
    // rename silently outdates it. Both halves matter: the names must still
    // exist, and their real schemas must produce the same control on their
    // own — the fallback is belt-and-braces, never the load-bearing path.
    const byName = new Map(registry.map((def) => [def.name, def]));
    for (const name of FALLBACK_SINGLE) {
      const def = byName.get(name);
      expect(
        def,
        `${name} is in the fallback list but not the registry`,
      ).toBeDefined();
      expect(symbolKeysOf(def!)).toContain("symbol");
      expect(detectSymbolControl(def!)?.kind).toBe("single");
    }
    for (const name of FALLBACK_SYMBOLS) {
      const def = byName.get(name);
      expect(
        def,
        `${name} is in the fallback list but not the registry`,
      ).toBeDefined();
      expect(symbolKeysOf(def!)).toContain("symbols");
      expect(detectSymbolControl(def!)?.kind).toBe("symbols");
    }
  });

  it("carries the array bounds a real multi-symbol frame declares", () => {
    // The picker enforces min/max add/remove from these, so they must survive
    // the JSON-Schema round trip rather than come back undefined.
    const liveline = registry.find((def) => def.name === "price-liveline");
    expect(detectSymbolControl(liveline!)).toEqual({
      kind: "symbols",
      minItems: 2,
      maxItems: 8,
    });
    // price-ticker declares .min(1) and no ceiling.
    const ticker = registry.find((def) => def.name === "price-ticker");
    expect(detectSymbolControl(ticker!)).toEqual({
      kind: "symbols",
      minItems: 1,
      maxItems: undefined,
    });
  });
});

describe("detectSymbolControl branches", () => {
  it("returns the single control for a string `symbol`", () => {
    const def = fakeFrame(
      "x",
      z.object({ symbol: z.string().min(1), interval: z.enum(["1m", "1h"]) }),
    );
    expect(detectSymbolControl(def)).toEqual({ kind: "single" });
  });

  it("still detects an optional or defaulted `symbol`", () => {
    expect(
      detectSymbolControl(
        fakeFrame("x", z.object({ symbol: z.string().optional() })),
      ),
    ).toEqual({ kind: "single" });
    expect(
      detectSymbolControl(
        fakeFrame("x", z.object({ symbol: z.string().default("BTC") })),
      ),
    ).toEqual({ kind: "single" });
  });

  it("carries min/max off a `symbols` string array", () => {
    const def = fakeFrame(
      "x",
      z.object({ symbols: z.array(z.string()).min(2).max(8) }),
    );
    expect(detectSymbolControl(def)).toEqual({
      kind: "symbols",
      minItems: 2,
      maxItems: 8,
    });
  });

  it("leaves the bounds undefined for an unbounded `symbols` array", () => {
    const def = fakeFrame("x", z.object({ symbols: z.array(z.string()) }));
    expect(detectSymbolControl(def)).toEqual({
      kind: "symbols",
      minItems: undefined,
      maxItems: undefined,
    });
  });

  it("returns the holdings control for an array of objects carrying a symbol", () => {
    const def = fakeFrame(
      "x",
      z.object({
        holdings: z
          .array(z.object({ symbol: z.string(), shares: z.number() }))
          .min(1)
          .max(20),
      }),
    );
    expect(detectSymbolControl(def)).toEqual({
      kind: "holdings",
      minItems: 1,
      maxItems: 20,
    });
  });

  it("prefers `symbol` over `symbols` over `holdings` when several are present", () => {
    // Detection order is the rail's precedence: only one picker renders, so a
    // frame declaring two symbol-shaped fields leaves the loser uneditable.
    const all = z.object({
      symbols: z.array(z.string()),
      holdings: z.array(z.object({ symbol: z.string() })),
      symbol: z.string(),
    });
    expect(detectSymbolControl(fakeFrame("x", all))).toEqual({
      kind: "single",
    });
    const both = z.object({
      holdings: z.array(z.object({ symbol: z.string() })),
      symbols: z.array(z.string()),
    });
    expect(detectSymbolControl(fakeFrame("x", both))).toEqual({
      kind: "symbols",
      minItems: undefined,
      maxItems: undefined,
    });
  });

  it("returns null for symbol-shaped keys of the wrong type", () => {
    // These are the near misses that make the failure invisible: the key is
    // there, so configFields strips it, but the picker declines it.
    expect(
      detectSymbolControl(fakeFrame("x", z.object({ symbol: z.number() }))),
    ).toBeNull();
    expect(
      detectSymbolControl(
        fakeFrame("x", z.object({ symbols: z.array(z.number()) })),
      ),
    ).toBeNull();
    expect(
      detectSymbolControl(
        fakeFrame("x", z.object({ holdings: z.array(z.number()) })),
      ),
    ).toBeNull();
    expect(
      detectSymbolControl(
        fakeFrame(
          "x",
          z.object({ holdings: z.array(z.object({ qty: z.number() })) }),
        ),
      ),
    ).toBeNull();
  });

  it("returns null for a frame with no symbol field and no fallback name", () => {
    const def = fakeFrame("clock", z.object({ timezone: z.string() }));
    expect(detectSymbolControl(def)).toBeNull();
  });
});

describe("detectSymbolControl name fallback", () => {
  /** z.custom() has no JSON-Schema form, so z.toJSONSchema throws. */
  const unconvertible = () => z.custom(() => false);

  it("really does defeat z.toJSONSchema, so the catch branch runs", () => {
    // Without this the tests below would pass on the ordinary "no symbol
    // property" fallthrough and never prove the catch is reachable at all.
    expect(() => z.toJSONSchema(unconvertible(), { io: "input" })).toThrow();
  });

  it("falls back to the single control for price-chart", () => {
    expect(
      detectSymbolControl(fakeFrame("price-chart", unconvertible())),
    ).toEqual({ kind: "single" });
  });

  it("falls back to the symbols control for the five multi-symbol names", () => {
    for (const name of FALLBACK_SYMBOLS)
      expect(
        detectSymbolControl(fakeFrame(name, unconvertible())),
        `${name} should fall back to the symbols control`,
      ).toEqual({ kind: "symbols" });
  });

  it("returns null for an unknown name when the schema cannot be converted", () => {
    expect(
      detectSymbolControl(fakeFrame("no-such-frame", unconvertible())),
    ).toBeNull();
  });

  it("applies the fallback to any non-matching schema, not just a throwing one", () => {
    // The list sits after the try block, so it also fires for a perfectly
    // convertible schema that simply has no symbol field. That is what makes a
    // rename dangerous: a renamed field on a still-listed frame yields a picker
    // writing a config key the schema rejects.
    expect(
      detectSymbolControl(
        fakeFrame("price-chart", z.object({ ticker: z.string() })),
      ),
    ).toEqual({ kind: "single" });
  });
});
