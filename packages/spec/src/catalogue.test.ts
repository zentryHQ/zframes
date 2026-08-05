import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  catalogueForAI,
  catalogueSummary,
  frameMatchesSearch,
  frameSearchTokens,
} from "./catalogue";
import { createRegistry } from "./frame";
import type { AnyFrameDefinition, FrameMeta } from "./frame";

/**
 * What this file pins, and why it matters
 * ---------------------------------------
 * `catalogueForAI` is the ONLY thing the generating agent reads before it emits
 * a `dashboard.json`, so its emitted per-frame shape is a wire contract, not an
 * implementation detail:
 *
 * - Drop `label` and every agent has to re-invent card titles (the whole point
 *   of `label` is that an instance omitting `title` renders it).
 * - Drop `category` and the agent loses the family taxonomy `FRAME_CATEGORIES`
 *   exists to give it.
 * - Flip `io: "input"` → `"output"` and zod starts marking every `.default()`
 *   field **required** and adding `additionalProperties: false`, so the agent
 *   dutifully writes out a full config blob for every defaulted field of every
 *   frame. That one option is load-bearing, so the test asserts the input shape
 *   *and* the output shape it must not be, side by side.
 *
 * The key set is therefore asserted as a sorted `Object.keys` comparison — a
 * dropped or renamed key fails rather than silently shrinking what the agent
 * knows.
 *
 * `catalogueForAI` has NO try/catch around `z.toJSONSchema` (unlike the editor's
 * `configFields`, which returns `[]` for an unrepresentable schema). A single
 * frame whose schema contains a `z.custom()` therefore throws and takes the
 * whole catalogue with it — i.e. `zframes catalogue`, the agent's entry point,
 * dies instead of listing the other ~200 frames. That fragility is pinned below
 * so it is visible and greppable rather than latent.
 *
 * `frameSearchTokens` / `frameMatchesSearch` are deliberately shared so the
 * editor palette (customise) and the explorer catalogue (browse) filter
 * identically. The semantics are AND over tokens with the category label folded
 * into the haystack; a regression to OR-matching would silently change what
 * users can find in *both* surfaces, which is exactly the sort of change no
 * screenshot catches.
 *
 * `packages/spec` sits below `@zframes/frames` in the layer DAG, so the real
 * frame metas can't be imported here — these tests build FrameMeta-shaped
 * fakes off real Zod schemas, which is all these pure functions look at.
 */

function fakeMeta(over: Partial<FrameMeta> & { name: string }): FrameMeta {
  return {
    label: over.name,
    category: "tools",
    description: `what ${over.name} shows`,
    capabilities: [],
    schema: z.object({}),
    ...over,
  };
}

/** A registry entry is a meta plus the React component the catalogue ignores. */
function asDefinition(meta: FrameMeta): AnyFrameDefinition {
  return { ...meta, component: () => null } as AnyFrameDefinition;
}

/** The slice of JSON Schema these assertions read. */
type JsonShape = {
  properties?: Record<string, { type?: string; default?: unknown }>;
  required?: string[];
  additionalProperties?: unknown;
};

/** Exactly the keys a catalogue entry may expose to the generating agent. */
const ENTRY_KEYS = [
  "annotatable",
  "capabilities",
  "category",
  "configSchema",
  "container",
  "description",
  "iconUrl",
  "label",
  "name",
  "usdOnly",
];

describe("catalogueForAI", () => {
  it("emits exactly the agent-facing keys, with the meta's values", () => {
    const [entry] = catalogueForAI([
      fakeMeta({
        name: "btc-fees",
        label: "Bitcoin Fees",
        category: "bitcoin",
        description: "Next-block fee estimates.",
        iconUrl: "https://example.test/btc.svg",
        capabilities: ["btc-fees", "btc-mempool"],
      }),
    ]);
    expect(Object.keys(entry).sort()).toEqual(ENTRY_KEYS);
    expect(entry.name).toBe("btc-fees");
    expect(entry.label).toBe("Bitcoin Fees");
    expect(entry.category).toBe("bitcoin");
    expect(entry.description).toBe("Next-block fee estimates.");
    expect(entry.iconUrl).toBe("https://example.test/btc.svg");
    expect(entry.capabilities).toEqual(["btc-fees", "btc-mempool"]);
  });

  it("tells the agent which frames accept event markers", () => {
    // `events` on a frame that has no time axis parses fine and then draws
    // nothing, so the agent needs this to place markers where they show. Always
    // present (false, not absent) — the entry shape must not vary by frame.
    const [plain] = catalogueForAI([fakeMeta({ name: "clock" })]);
    expect(plain.annotatable).toBe(false);
    const [chart] = catalogueForAI([
      fakeMeta({ name: "price-events", annotatable: true }),
    ]);
    expect(chart.annotatable).toBe(true);
    expect(Object.keys(chart).sort()).toEqual(ENTRY_KEYS);
  });

  it("tells the agent which frames ignore the display currency", () => {
    // A `currency` set on a usdOnly frame parses fine and then changes nothing
    // (US-macro series, SEC figures as filed, user-typed numbers), so the agent
    // needs this to not bother. Always present, like `annotatable`.
    const [plain] = catalogueForAI([fakeMeta({ name: "price-chart" })]);
    expect(plain.usdOnly).toBe(false);
    const [macro] = catalogueForAI([
      fakeMeta({ name: "national-debt", usdOnly: true }),
    ]);
    expect(macro.usdOnly).toBe(true);
    expect(Object.keys(macro).sort()).toEqual(ENTRY_KEYS);
  });

  it("tells the agent which frames hold other frames", () => {
    // A container's useful output lives in the instance's `children` array, which
    // is a sibling of `config` and therefore invisible in `configSchema`. Without
    // this flag an agent reading only the schema emits a correctly-configured
    // empty box. Always present, like the two flags above.
    const [plain] = catalogueForAI([fakeMeta({ name: "clock" })]);
    expect(plain.container).toBe(false);
    const [group] = catalogueForAI([
      fakeMeta({ name: "group", container: true }),
    ]);
    expect(group.container).toBe(true);
    expect(Object.keys(group).sort()).toEqual(ENTRY_KEYS);
  });

  it("keeps the key set fixed when the meta omits the optional iconUrl", () => {
    // The entry is a literal, not a filtered copy: an absent iconUrl still
    // occupies the key, so the shape the agent parses never varies by frame.
    const [entry] = catalogueForAI([fakeMeta({ name: "clock" })]);
    expect(Object.keys(entry).sort()).toEqual(ENTRY_KEYS);
    expect(entry.iconUrl).toBeUndefined();
  });

  it("serializes the config schema in input mode: defaults stay optional", () => {
    const schema = z.object({
      symbol: z.string().describe("Ticker to chart"),
      windowSec: z.number().int().default(30).describe("Rolling window"),
    });
    const [entry] = catalogueForAI([fakeMeta({ name: "price", schema })]);
    const cfg = entry.configSchema as JsonShape;

    expect(cfg.required).toEqual(["symbol"]);
    // No closed-object constraint, and the default is advertised as a hint.
    expect(cfg.additionalProperties).toBeUndefined();
    expect(cfg.properties?.windowSec.default).toBe(30);

    // The shape `io: "output"` would have produced — the exact regression the
    // explicit option prevents: every defaulted field forced into `required`,
    // plus a closed object.
    const asOutput = z.toJSONSchema(schema, { io: "output" }) as JsonShape;
    expect(asOutput.required).toEqual(["symbol", "windowSec"]);
    expect(asOutput.additionalProperties).toBe(false);
  });

  it("accepts a FrameRegistry and a plain meta list interchangeably", () => {
    const metas = [
      fakeMeta({ name: "price-chart", category: "markets" }),
      fakeMeta({ name: "tvl", category: "crypto", capabilities: ["tvl"] }),
    ];
    const fromList = catalogueForAI(metas);
    const fromRegistry = catalogueForAI(
      createRegistry(metas.map(asDefinition)),
    );

    expect(fromRegistry).toStrictEqual(fromList);
    // Registry iteration is insertion-ordered, so the agent sees the same order.
    expect(fromRegistry.map((e) => e.name)).toEqual(["price-chart", "tvl"]);
    // The component on a definition must not leak into the catalogue.
    expect(Object.keys(fromRegistry[0]).sort()).toEqual(ENTRY_KEYS);
  });

  it("throws on a schema with no JSON-Schema representation", () => {
    // KNOWN BUG: one unrepresentable frame schema throws and aborts the whole
    // catalogue — should be skipped/degraded per frame the way the editor's
    // `configFields` try/catches it, so `zframes catalogue` still lists the rest.
    // Pinned so the suite stays green; fixing the source must flip this
    // assertion.
    const customMeta = fakeMeta({
      name: "custom",
      schema: z.object({ probe: z.custom(() => true) }),
    });
    expect(() => catalogueForAI([customMeta])).toThrow(/JSON Schema/);
    expect(() =>
      catalogueForAI([fakeMeta({ name: "ok" }), customMeta]),
    ).toThrow(/JSON Schema/);
  });
});

describe("catalogueSummary", () => {
  it("groups by category in first-appearance order, one line per family", () => {
    const summary = catalogueSummary([
      fakeMeta({ name: "price-chart", category: "markets" }),
      fakeMeta({ name: "tvl", category: "crypto" }),
      fakeMeta({ name: "movers", category: "markets" }),
    ]);
    expect(summary).toBe(
      [
        "markets: price-chart — what price-chart shows; " +
          "movers — what movers shows",
        "crypto: tvl — what tvl shows",
      ].join("\n"),
    );
  });

  it("collapses whitespace and truncates a long description to 110 chars", () => {
    const long = "y".repeat(200);
    const summary = catalogueSummary([
      fakeMeta({ name: "wrapped", description: "two\n   line   desc" }),
      fakeMeta({ name: "long", description: long }),
    ]);
    const [wrapped, truncated] = summary.split("; ");
    expect(wrapped).toBe("tools: wrapped — two line desc");
    expect(truncated).toBe(`long — ${"y".repeat(109)}…`);
    // 109 kept + the ellipsis: the budget is 110 visible characters.
    expect(truncated.replace("long — ", "")).toHaveLength(110);
  });

  it("leaves a description of exactly the 110-char budget untouched", () => {
    const exact = "z".repeat(110);
    expect(
      catalogueSummary([fakeMeta({ name: "edge", description: exact })]),
    ).toBe(`tools: edge — ${exact}`);
  });
});

describe("frameSearchTokens", () => {
  it("returns no tokens for an empty or whitespace-only query", () => {
    // No tokens is what makes `frameMatchesSearch` match everything, so an
    // all-spaces query must not collapse to a single empty-string token.
    expect(frameSearchTokens("")).toEqual([]);
    expect(frameSearchTokens("   \t\n ")).toEqual([]);
  });

  it("lowercases and splits a multi-word query on whitespace runs", () => {
    expect(frameSearchTokens("  BTC   Mempool\tFees\n")).toEqual([
      "btc",
      "mempool",
      "fees",
    ]);
  });
});

describe("frameMatchesSearch", () => {
  const fees = {
    name: "btc-fees",
    label: "Bitcoin Fees",
    description: "Next-block fee estimates from mempool.space.",
  };

  it("requires EVERY token to hit (AND, not OR)", () => {
    expect(
      frameMatchesSearch(fees, "Bitcoin Network", ["fee", "mempool"]),
    ).toBe(true);
    // "gold" appears nowhere; under OR-matching this would wrongly be true.
    expect(frameMatchesSearch(fees, "Bitcoin Network", ["fee", "gold"])).toBe(
      false,
    );
  });

  it("is case-insensitive through the documented tokenise-then-test pipeline", () => {
    expect(
      frameMatchesSearch(fees, "Bitcoin Network", frameSearchTokens("BITCOIN")),
    ).toBe(true);
    expect(
      frameMatchesSearch(
        { name: "BTC-FEES", label: "BITCOIN FEES" },
        "BITCOIN NETWORK",
        frameSearchTokens("bitcoin fees"),
      ),
    ).toBe(true);
  });

  it("expects pre-lowercased tokens — only the haystack is normalised", () => {
    // The contract is "tokenise once with frameSearchTokens"; a raw uppercase
    // token bypasses that and misses, which is why callers must not hand-roll
    // `query.split(" ")`.
    expect(frameMatchesSearch(fees, "Bitcoin Network", ["Bitcoin"])).toBe(
      false,
    );
  });

  it("matches on the category label alone, so a family term surfaces a frame", () => {
    const treemap = {
      name: "market-cap-treemap",
      label: "Market Cap Treemap",
      description: "Relative size of the top coins.",
    };
    // "crypto" is in neither the name, the label, nor the description.
    expect(
      `${treemap.name} ${treemap.label} ${treemap.description}`.toLowerCase(),
    ).not.toContain("crypto");
    expect(frameMatchesSearch(treemap, "Crypto & On-chain", ["crypto"])).toBe(
      true,
    );
  });

  it("tolerates a meta with no description", () => {
    const bare = { name: "divider", label: "Divider" };
    expect(frameMatchesSearch(bare, "Layout & Media", ["divider"])).toBe(true);
    expect(frameMatchesSearch(bare, "Layout & Media", ["undefined"])).toBe(
      false,
    );
  });

  it("matches everything when the query yielded no tokens", () => {
    expect(
      frameMatchesSearch(fees, "Bitcoin Network", frameSearchTokens("")),
    ).toBe(true);
    expect(
      frameMatchesSearch({ name: "", label: "" }, "", frameSearchTokens("  ")),
    ).toBe(true);
  });
});
