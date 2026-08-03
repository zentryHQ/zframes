// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  createRegistry,
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  currencySymbol,
  formatMoney,
  formatMoneyCompact,
  type CurrencyCode,
  type DashboardSpec,
  type FxRate,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { allFrames } from "./index";
import { MockMarketDataProvider } from "./testing/mock-provider";

// The display-currency contract at the FRAME level: a board declares
// `currency.code`, providers report USD, and every card's money figures must be
// converted once — symbol and number agreeing — by the time they reach the DOM.
//
// Nothing pinned that end to end before. `tests/currency-coverage.test.ts` is a
// source grep for `formatPrice`/`formatCompactUsd`, so it is blind to a frame
// that converts twice, that prints `money.symbol` beside a raw USD number, or
// that leaks dollars through a shared primitive's default formatter (exactly the
// `MoverRow` case pinned below). `frame-smoke.test.tsx` renders all 230 frames
// but its spec omits `currency`, which makes `useMoney()` the USD identity — so
// 18 of the 19 supported currencies had never been rendered at all.
//
// This file renders a curated subset of money frames through the REAL
// DashboardRenderer on a THB board and a EUR board, fed by the deterministic
// offline MockMarketDataProvider (whose seeded `fx-rates` answers arbitrary
// codes), and asserts on the text that actually lands in the card:
//   - converted frames show the board's symbol and no "$";
//   - the documented USD_ONLY carve-outs show "$" and no baht — the point of the
//     carve-out;
//   - the magnitude is usd × rate, never usd × rate² and never the unconverted
//     figure wearing a baht sign;
//   - with the rate unresolved every card falls back to whole dollars.
// The existing 230-frame loop is deliberately left untouched; a bounded subset
// keeps the runtime small while covering each shape (hero numeral, list rows,
// order book, chart title, gauge headline).

// jsdom lacks these browser APIs the renderer + charts + canvas frames touch;
// stub them so a missing global can't masquerade as a currency bug.
beforeAll(() => {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const g = globalThis as unknown as Record<string, unknown>;
  g.IntersectionObserver = NoopObserver;
  g.ResizeObserver = NoopObserver;
  if (!g.matchMedia) {
    g.matchMedia = () => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }
  // A tolerant 2D context so liveline/canvas frames draw into a no-op instead of
  // throwing on a null context (jsdom has no canvas backend).
  const ctx2d = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getImageData")
          return () => ({ data: new Uint8ClampedArray(4) });
        if (
          prop === "createLinearGradient" ||
          prop === "createRadialGradient" ||
          prop === "createPattern"
        )
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set() {
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx2d) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const registry = createRegistry(allFrames);
const frameByName = new Map(allFrames.map((f) => [f.name, f]));

/**
 * Frames whose money figures are convertible market data AND land in the card as
 * text under jsdom. Each must quote the board currency and nothing else.
 */
const CONVERTS = [
  "price-chart",
  "top-movers",
  "order-book-depth",
  "options-oi-strike",
  "options-max-pain",
  "metal-price",
  "metals-board",
  "metal-value",
  "stablecoin-supply",
  "defi-revenue",
  "open-interest",
  "nft-collections",
  "dex-hot-pools",
  "yield-scanner",
  "sector-performance",
  "etf-flows",
  "tokenized-gold",
  "bitcoin-dominance",
  "us-gold-reserve",
  "volume-profile",
  // Both render the shared `MoverRow`, which resolves the card's currency
  // itself — see the MoverRow group at the bottom of this file.
  "price-ticker",
  "coin-movers",
];

/**
 * Converts correctly, but its own DATA contains a literal dollar sign (a
 * Polymarket question — "BTC above $100k by year end?"), so only the presence of
 * the board symbol can be asserted, not the absence of "$".
 */
const CONVERTS_WITH_LITERAL_USD = ["prediction-markets"];

/**
 * The documented USD_ONLY carve-outs (the exemption list in
 * `tests/currency-coverage.test.ts`): US-macro series, SEC figures as reported,
 * and user-typed numbers. On a baht board these must STILL read in dollars —
 * converting them is the bug. If one of them is ever migrated to `useMoney()`
 * (and dropped from that list), it must MOVE from here into CONVERTS; leaving it
 * here fails below with "lost its USD figures".
 */
const USD_ONLY_CARVE_OUTS = [
  "national-debt",
  "rates-board",
  "fundamentals",
  "breakeven",
  "risk-reward",
  "returns-projector",
];

/**
 * Money frames whose figures live somewhere jsdom can't read them (a canvas
 * liveline, a zero-width D3 treemap/bubble pack) or behind a connect gate, so
 * only the mount is asserted for them.
 */
const MOUNT_ONLY = [
  "price-compare",
  "market-cap-treemap",
  "tvl-treemap",
  "tvl-bars",
  "market-bubbles",
  "portfolio-value",
  "portfolio-holdings",
  "capital-structure-bars",
];

const SUBSET = [
  ...CONVERTS,
  ...CONVERTS_WITH_LITERAL_USD,
  ...USD_ONLY_CARVE_OUTS,
  ...MOUNT_ONLY,
];

const BAHT = currencySymbol("THB");
const EURO = currencySymbol("EUR");

/** A one-frame board on `code`, with schema-valid seeded config for the frame. */
function specFor(frameName: string, code: CurrencyCode): DashboardSpec {
  const def = frameByName.get(frameName);
  if (!def) throw new Error(`no such frame: ${frameName}`);
  return DashboardSpecSchema.parse({
    title: "currency smoke",
    currency: { code },
    grid: {
      mode: "flow-vertical",
      columns: 6,
      rowHeight: 96,
      gap: 12,
      rows: 4,
    },
    frames: [
      {
        id: "c",
        frame: frameName,
        position: { x: 0, y: 0, w: 4, h: 4 },
        config: buildDefaultConfig(def),
      },
    ],
  });
}

/**
 * Flush the mock's resolved promises and the state updates they cause. Several
 * chained rounds are needed: the board's fx poll lands first, then every card
 * re-renders through the resolved rate.
 */
async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/**
 * Renders one frame on a `code` board and returns the text of its CARD —
 * deliberately not the whole container, whose text would include the renderer's
 * injected `<style>` sheet. Also asserts the card mounted and is not the
 * renderer's error card, so no caller can assert against an error message.
 */
async function cardTextOf(
  frameName: string,
  code: CurrencyCode,
  provider: MockMarketDataProvider = new MockMarketDataProvider("normal"),
): Promise<string> {
  const { container } = render(
    <FramesProvider providers={[provider]}>
      <DashboardRenderer spec={specFor(frameName, code)} registry={registry} />
    </FramesProvider>,
  );
  await settle();
  const card = container.querySelector(".zf-frame, .zf-bare");
  expect(card, `${frameName} [${code}] mounted no card`).not.toBeNull();
  expect(
    container.querySelector(".zf-frame--error"),
    `${frameName} [${code}] rendered an error card`,
  ).toBeNull();
  const text = (card?.textContent ?? "").replace(/\s+/g, " ");
  cleanup();
  return text;
}

/** The mock's fx provider with the rate permanently unresolved (empty answer). */
class NoRateProvider extends MockMarketDataProvider {
  override getFxRates(): Promise<FxRate[]> {
    return Promise.resolve([]);
  }
}

/** The seeded USD→`code` rate the mock reports, read from the mock itself. */
async function seededRate(code: CurrencyCode): Promise<number> {
  const rates = await new MockMarketDataProvider("normal").getFxRates("USD", [
    code,
  ]);
  const rate = rates.find((r) => r.symbol === code)?.rate;
  if (rate === undefined) throw new Error(`mock has no ${code} rate`);
  return rate;
}

afterEach(() => cleanup());

describe("the currency subset itself", () => {
  it("names only real frames, with no frame in two groups", () => {
    const unknown = SUBSET.filter((name) => !frameByName.has(name));
    expect(unknown, `not registered frames: ${unknown.join(", ")}`).toEqual([]);
    // A frame promoted from MOUNT_ONLY to CONVERTS (or a carve-out migrated to
    // useMoney) must be MOVED, not copied — two groups assert opposite things.
    expect(new Set(SUBSET).size).toBe(SUBSET.length);
    // Enough breadth that a regression in one family can't hide.
    expect(SUBSET.length).toBeGreaterThanOrEqual(30);
  });
});

describe("every money frame mounts on a non-USD board", () => {
  it.each(SUBSET)(
    "%s mounts a clean card on a THB board and on a EUR board",
    async (name) => {
      // cardTextOf asserts the card mounted and is not an error card; a
      // non-empty body proves the frame rendered content, not a blank shell.
      for (const code of ["THB", "EUR"] as const) {
        const text = await cardTextOf(name, code);
        expect(
          text.length,
          `${name} [${code}] rendered no text`,
        ).toBeGreaterThan(0);
      }
    },
  );
});

describe("conversion reaches the DOM", () => {
  it.each(CONVERTS)(
    "%s quotes baht, not dollars, on a THB board",
    async (name) => {
      const text = await cardTextOf(name, "THB");
      expect(text, `${name} printed no baht figure`).toContain(BAHT);
      // A digit right after the symbol: the glyph is in front of a number, not
      // stranded in a caption.
      expect(text).toMatch(new RegExp(`${BAHT}[\\d-]`));
      expect(
        text,
        `${name} still printed a dollar figure on a THB board`,
      ).not.toContain("$");
    },
  );

  it.each(CONVERTS)(
    "%s quotes euro, not dollars, on a EUR board",
    async (name) => {
      // The second code catches a frame that hard-codes THB (or the baht symbol)
      // rather than reading the board's currency.
      const text = await cardTextOf(name, "EUR");
      expect(text, `${name} printed no euro figure`).toContain(EURO);
      expect(text).toMatch(new RegExp(`${EURO}[\\d-]`));
      expect(text).not.toContain("$");
      expect(text).not.toContain(BAHT);
    },
  );

  it.each(CONVERTS_WITH_LITERAL_USD)(
    "%s converts its own figures (its data quotes a literal $)",
    async (name) => {
      const thb = await cardTextOf(name, "THB");
      expect(thb).toMatch(new RegExp(`${BAHT}[\\d-]`));
      const eur = await cardTextOf(name, "EUR");
      expect(eur).toMatch(new RegExp(`${EURO}[\\d-]`));
      expect(eur).not.toContain(BAHT);
    },
  );
});

describe("the USD_ONLY carve-outs stay in dollars on a converted board", () => {
  it.each(USD_ONLY_CARVE_OUTS)(
    "%s keeps quoting dollars on a THB and a EUR board",
    async (name) => {
      for (const [code, symbol] of [
        ["THB", BAHT],
        ["EUR", EURO],
      ] as const) {
        const text = await cardTextOf(name, code);
        expect(text, `${name} lost its USD figures on a ${code} board`).toMatch(
          /\$[\d-]/,
        );
        expect(
          text,
          `${name} is USD_ONLY but rendered a ${code} symbol`,
        ).not.toContain(symbol);
      }
    },
  );
});

describe("no double conversion", () => {
  it("prints usd × rate — not usd × rate², and not the raw USD figure", async () => {
    const rate = await seededRate("THB");
    // The check only discriminates if the rate is far from 1: at rate ≈ 1,
    // usd × rate and usd × rate² format identically.
    expect(rate).toBeGreaterThan(1.5);

    const source = new MockMarketDataProvider("normal");

    // An aggregate (money.compact) — the stablecoin float.
    const { totalUsd } = await source.getStablecoinSupply();
    expect(totalUsd).toBeGreaterThan(0);
    const once = formatMoneyCompact(totalUsd * rate, "THB");
    const twice = formatMoneyCompact(totalUsd * rate * rate, "THB");
    // The three expectations below only mean something if the three renderings
    // are distinguishable strings at this magnitude.
    expect(
      new Set([once, twice, formatMoneyCompact(totalUsd, "THB")]).size,
    ).toBe(3);
    const supply = await cardTextOf("stablecoin-supply", "THB");
    expect(supply).toContain(once);
    expect(supply).not.toContain(twice);
    // The symbol-swap failure: a baht sign in front of an unconverted number.
    expect(supply).not.toContain(formatMoneyCompact(totalUsd, "THB"));

    // A second aggregate from a different provider capability.
    const { total24h } = await source.getFeesOverview();
    expect(total24h).toBeGreaterThan(0);
    const fees = await cardTextOf("defi-revenue", "THB");
    expect(fees).toContain(formatMoneyCompact(total24h * rate, "THB"));
    expect(fees).not.toContain(
      formatMoneyCompact(total24h * rate * rate, "THB"),
    );
    expect(fees).not.toContain(formatMoneyCompact(total24h, "THB"));

    // A price level (money.price), which rounds on a different ladder.
    const [gold] = await source.getMetalSpot(["XAU"]);
    expect(gold.price).toBeGreaterThan(0);
    const metals = await cardTextOf("metals-board", "THB");
    expect(metals).toContain(formatMoney(gold.price * rate, "THB"));
    expect(metals).not.toContain(formatMoney(gold.price * rate * rate, "THB"));
    expect(metals).not.toContain(formatMoney(gold.price, "THB"));
  });

  it("scales the same USD figure by each board's own rate", async () => {
    const thbRate = await seededRate("THB");
    const eurRate = await seededRate("EUR");
    expect(thbRate).not.toBe(eurRate);

    const { totalUsd } = await new MockMarketDataProvider(
      "normal",
    ).getStablecoinSupply();

    const thb = await cardTextOf("stablecoin-supply", "THB");
    expect(thb).toContain(formatMoneyCompact(totalUsd * thbRate, "THB"));

    const eur = await cardTextOf("stablecoin-supply", "EUR");
    expect(eur).toContain(formatMoneyCompact(totalUsd * eurRate, "EUR"));
    // Not the baht magnitude wearing a euro sign.
    expect(eur).not.toContain(formatMoneyCompact(totalUsd * thbRate, "EUR"));
  });
});

describe("the unresolved-rate carve-out, at frame level", () => {
  it.each(CONVERTS)(
    "%s quotes whole dollars while the THB rate is unresolved",
    async (name) => {
      // The fx capability answers with no THB entry, so the board keeps rate 1:
      // a baht glyph here would sit in front of an unconverted dollar amount.
      const text = await cardTextOf(name, "THB", new NoRateProvider("normal"));
      expect(text, `${name} rendered no figure at all`).toMatch(/\$[\d-]/);
      expect(text, `${name} showed a baht symbol with no rate`).not.toContain(
        BAHT,
      );
    },
  );

  it("leaves the magnitude unconverted, not merely the symbol", async () => {
    const { totalUsd } = await new MockMarketDataProvider(
      "normal",
    ).getStablecoinSupply();
    const text = await cardTextOf(
      "stablecoin-supply",
      "THB",
      new NoRateProvider("normal"),
    );
    expect(text).toContain(formatMoneyCompact(totalUsd, "USD"));
  });
});

describe("the shared MoverRow row converts for every consumer", () => {
  // The regression this group exists for: MoverRow took an optional
  // `formatValue` defaulting to the USD `formatPrice`, and `price-ticker` /
  // `coin-movers` never passed one — so those two cards quoted dollars on a baht
  // board while `top-movers`, which did pass it, converted. No source grep could
  // see it: the `$` lived in the primitive's default, not in the frames. The row
  // now calls `useMoney()` itself, so there is nothing left to omit.
  it("prints the converted price for a consumer that passes nothing", async () => {
    const rate = await seededRate("THB");
    const def = frameByName.get("price-ticker")!;
    const { symbols } = buildDefaultConfig(def) as { symbols: string[] };
    expect(symbols.length).toBeGreaterThan(0);

    const source = new MockMarketDataProvider("normal");
    let mid = 0;
    const unsubscribe = source.subscribeMids((mids) => {
      mid = mids[symbols[0]] ?? 0;
    }, symbols);
    unsubscribe();
    expect(mid).toBeGreaterThan(0);

    const ticker = await cardTextOf("price-ticker", "THB");
    expect(ticker).toContain(formatMoney(mid * rate, "THB"));
    expect(ticker).not.toContain(formatMoney(mid, "USD"));

    // And the sibling that renders the same row still agrees.
    const movers = await cardTextOf("top-movers", "THB");
    expect(movers).toMatch(new RegExp(`${BAHT}[\\d-]`));
    expect(movers).not.toContain("$");
  });
});
