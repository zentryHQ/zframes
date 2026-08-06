// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  createRegistry,
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  currencySymbol,
  formatMagnitude,
  formatMoney,
  formatMoneyCompact,
  type CurrencyCode,
  type DashboardSpec,
  type FxRate,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { allFrames } from "./index";
import { logCall } from "./journal-store";
import { allFrameMetas } from "./schemas";
import { MockMarketDataProvider } from "./testing/mock-provider";

/**
 * WHAT THIS PINS — the display-currency contract for EVERY registered frame.
 *
 * Providers report USD; a board declares `currency.code` and every card's money
 * must be converted once, symbol and number agreeing, by the time it reaches the
 * DOM. Two guards existed and neither covers the whole registry:
 *
 *   - `tests/currency-coverage.test.ts` greps frame sources for the hard-coded
 *     `$` helpers. It cannot see a frame that leaks dollars through a SHARED
 *     component's default formatter — the `$` lives in the primitive, not in the
 *     frame. That is how two `MoverRow` consumers leaked dollars, and a grep
 *     also cannot tell a sound exemption from an unsound one: it once exempted
 *     `journal-log`/`journal-ui` as "user-entered journal amounts" when the
 *     figures they print are live provider mids. Both classes are fixed, and the
 *     regression tests at the bottom of this file are what keep them fixed.
 *   - `frame-currency-smoke.test.tsx` renders a curated ~35-frame subset.
 *
 * So this file renders ALL of them, twice — a USD board and a THB board at a
 * fixed 36.5 rate — through the real DashboardRenderer + real registry, and
 * classifies every frame in `allFrameMetas` into exactly one of three buckets
 * with a stated reason: CONVERTS, USD_ONLY, NO_MONEY.
 *
 * REAL FAILURE IT CATCHES: a card quoting `$99,355` on a baht board (a wrong
 * number, not a slow one — the user reads it as baht), or the mirror image, a
 * US-macro figure like the national debt restated in baht. Both are silent: the
 * dashboard renders, no error card, nothing throws. It also catches the subtler
 * axis case — a converted spot price sitting next to an UNconverted strike axis.
 *
 * The three buckets partition the registry exactly, so a NEW frame fails this
 * file until someone classifies it. That guard is the point: the classification
 * is only worth something if it cannot rot.
 */

/** Units of THB per 1 USD. Far from 1 so a missed conversion cannot round away. */
const RATE = 36.5;
const BAHT = currencySymbol("THB");

/**
 * Frames that render convertible market money: on a THB board they must show
 * baht, never a dollar sign, and their figures must differ from the USD render.
 */
const CONVERTS: Record<string, string> = {
  "analyst-ratings": "the consensus price target beside the live price",
  "bitcoin-dominance": "total crypto market cap",
  "company-profile": "last sale, market cap and the 52-week range",
  "equity-options-greeks": "spot and the strike ladder",
  "equity-options-max-pain": "the max-pain strike and spot",
  "equity-options-oi": "spot and the strike axis",
  "equity-options-smile": "spot and the strike axis",
  "valuation-multiples": "market cap; the ratios themselves are unit-less",
  "defi-revenue": "24h protocol fees and revenue",
  "dex-hot-pools": "pool price, liquidity and 24h volume",
  "journal-log": "the ticker picker's live mid",
  "journal-open": "an open call's entry, live now, and target",
  "dex-pool-bubbles": "pool 24h volume",
  "dex-pool-liquidity-scatter": "liquidity and 24h-volume axes",
  "dex-pool-treemap": "pool 24h volume per tile",
  "dex-volume-bubbles": "protocol 24h DEX volume",
  "dex-volume-share-area": "DEX volume by protocol",
  "dex-volume-treemap": "DEX 24h volume per tile",
  "dex-volume-chart": "DEX volume history on the value axis",
  "etf-flow-bars": "daily ETF net flow",
  "etf-flow-calendar": "daily ETF net flow per day cell",
  "etf-flows": "ETF net-flow totals",
  "etf-flows-chart": "ETF net flow on the value axis",
  "etf-issuer-bars": "per-issuer net flow",
  "etf-issuer-treemap": "per-issuer net flow per tile",
  "market-bubbles": "coin market caps",
  "market-cap-treemap": "coin market caps",
  "market-scatter": "market-cap axis",
  "metal-ath": "the all-time-high London fix",
  "metal-fix-table":
    "LBMA fix prices — the USD series goes through money; a GBP/EUR series is shown as published",
  "metal-milestones": "fix-price milestones",
  "metal-open-interest": "the 'at <spot>/oz' caption",
  "metal-price": "metal spot price",
  "metal-price-chart": "fix prices on the chart axis",
  "metal-real-price": "the real and nominal fix prices, and the value axis",
  "metal-spec-notional": "net speculative positioning valued in money",
  "metal-value": "the value of a stated holding",
  "metal-vs-macro": "the metal's latest fix price in the header",
  "metals-board": "spot price per metal",
  mvrv: "market cap vs realized cap",
  "nft-bubbles": "collection market caps",
  "nft-collections": "floor price and 24h volume",
  "nft-scatter": "24h-volume axis",
  "nft-treemap": "collection market cap per tile",
  "oi-treemap": "open-interest notional per tile",
  "open-interest": "open-interest notional",
  "options-max-pain": "max-pain strike and spot",
  "home-value-chart":
    "typical home values on the value axis via money.magnitude",
  "home-value-bars": "typical home value per bar via money.magnitude",
  "home-value-scatter": "typical home value on the y axis via money.magnitude",
  "mortgage-payment":
    "the monthly payment, loan amount and home value via money.price",
  "metro-home-values": "typical home value per metro via money.price",
  "options-oi-ladder-heatmap": "strike buckets via money.magnitude",
  "options-oi-skew": "strike axis via money.magnitude (converted, symbol-less)",
  "options-oi-strike": "strike axis plus the spot caption",
  "options-vol-smile": "the spot caption and strike axis",
  "order-book-depth": "bid/ask prices (base-asset sizes stay unconverted)",
  "portfolio-allocation": "holding values behind the account gate",
  "portfolio-holdings": "holding values behind the account gate",
  "portfolio-value": "account value behind the account gate",
  "portfolio-value-bars": "per-holding value behind the account gate",
  "prediction-market-bars": "market 24h volume",
  "prediction-market-scatter": "24h-volume axis",
  "prediction-markets": "market 24h volume",
  "prediction-markets-bubble": "market 24h volume",
  "price-chart": "last price and price axis",
  "price-ticker": "each row's live price, via the shared MoverRow",
  "coin-movers": "each gainer/loser price, via the shared MoverRow",
  "price-compare":
    "both symbols' prices on the value axis and legend (rendered with " +
    "`normalize: false` — see CONFIG_OVERRIDE)",
  "price-events": "price history on the value axis, under the event markers",
  "price-liveline": "the live price readout",
  "protocol-fees-bubbles": "protocol 24h fees",
  "protocol-fees-treemap": "protocol 24h fees per tile",
  "protocol-fees-vs-tvl-scatter": "TVL and fee axes",
  "protocol-tvl-bubbles": "protocol TVL",
  "protocol-tvl-by-category": "TVL by category",
  "protocol-tvl-chart": "protocol TVL on the value axis",
  "protocol-tvl-share-area": "TVL share history",
  "protocol-tvl-treemap": "protocol TVL per tile",
  "realized-price": "realized price on the value axis",
  "sector-bubbles": "sector market caps",
  "sector-performance": "sector market caps",
  "sector-treemap": "sector market cap in the tile tooltip",
  "stablecoin-chains": "stablecoin float per chain",
  "stablecoin-supply": "total stablecoin float",
  "tokenized-gold": "token price vs spot",
  "top-movers": "price per symbol (passes money.price into MoverRow)",
  "trending-coins": "price, in the branch used when a coin has no 24h change",
  "tvl-bars": "chain TVL",
  "tvl-bubbles": "chain TVL",
  "tvl-treemap": "chain TVL per tile",
  "us-gold-reserve": "book value of the US gold reserve",
  "volume-movers-scatter": "24h notional volume axis",
  "volume-profile": "the price levels of each volume bucket",
  "volume-share-donut": "total 24h notional volume",
  "yield-risk-pie": "pool TVL",
  "yield-scanner": "pool TVL",
  "yield-scatter": "TVL bubble axis",
};

/**
 * Legitimately dollars. Same carve-out rationale as `USD_ONLY` in
 * `tests/currency-coverage.test.ts` — US-macro series nobody quotes in another
 * currency, SEC figures as filed, and numbers the user typed themselves (a typed
 * value must read back as typed). No new exemptions: converting these would be
 * the bug, so on a THB board they must STILL read in dollars.
 */
const USD_ONLY: Record<string, string> = {
  breakeven: "user-entered position maths",
  calculator: "user-entered account size, risk and levels",
  "capital-structure-bars": "SEC balance-sheet figures, as reported",
  "cashflow-trend": "published cash-flow statement figures, as reported",
  "earnings-calendar": "consensus EPS as published; caps only rank the session",
  "earnings-countdown":
    "an EPS is a per-share figure as the company reported it",
  "earnings-surprise": "reported vs consensus EPS, both as published",
  "financials-trend": "SEC XBRL reported history, as filed",
  fundamentals: "SEC filing figures, as reported",
  "institutional-ownership": "13F holdings aggregates, as reported",
  "national-debt": "US-macro — Treasury debt is quoted in USD",
  "nyfed-reference-rate-bars": "US-macro — NY Fed repo volumes in USD",
  "rates-board": "US-macro — official US rate board",
  "returns-projector": "user-entered projection inputs",
  "risk-reward": "user-entered trade levels",
  "treasury-auction-size-bars": "US-macro — Treasury auction sizes",
  "treasury-debt-composition-area": "US-macro — Treasury debt split",
};

/**
 * Renders no money at all — percentages, ratios, counts, index levels,
 * base-asset amounts, clocks, or user-authored text. These must emit NEITHER a
 * dollar sign NOR a board symbol on either board: if one of them starts showing
 * money it fails here and has to be reclassified.
 */
const NO_MONEY: Record<string, string> = {
  breathing: "a breathing pacer",
  "btc-block-size-bars": "block size in bytes",
  "btc-blocks": "block height, tx counts, subsidy in BTC",
  "btc-difficulty": "retarget percentages and block counts",
  "btc-difficulty-chart": "network difficulty (dimensionless)",
  "btc-fees": "fee rates in sat/vB",
  "btc-hashrate": "hashrate and difficulty",
  "btc-in-gold": "BTC priced in ounces of gold — a ratio",
  "btc-mempool": "mempool vsize and tx counts",
  "chain-activity": "per-chain tx, block and mempool counts",
  "chain-activity-bars": "24h transaction counts",
  "chain-activity-scatter": "24h change % vs transaction counts",
  "chain-price-movers": "24h price change %",
  "margin-trend": "gross/operating/net margins — percentages of revenue",
  checklist: "user-authored checklist items",
  clock: "a wall clock",
  "coin-momentum-heatmap": "per-window change %",
  "coin-momentum-scatter": "24h vs 7d change %",
  countdown: "time remaining",
  "custom-data":
    "user-declared JSON values and a user-declared unit — the escape hatch is outside the currency contract by design",
  "cycle-signals": "cycle-indicator thresholds (ratios)",
  "cycle-valuation-composite": "a composite cycle score",
  "daily-analysis": "the agent's brief prose; any figure is text it wrote",
  "day-meter": "weekday progress",
  dice: "a coin flip / die roll (random — its two renders need not match)",
  "dino-game": "a canvas game",
  divider: "a rule",
  "dominance-bars": "market-cap share %",
  "dominance-gauge": "BTC dominance %",
  drawdy: "a canvas sketchpad",
  dxy: "the dollar-index level (an index, not a price)",
  "dxy-chart": "dollar-index history",
  "eth-issuance-impact": "net issuance %/yr",
  "eth-staking": "staking APR %",
  "eth-supply": "supply and burn, in ETH",
  "fear-greed": "a 0–100 index",
  "fear-greed-chart": "0–100 index history",
  "filings-feed": "SEC filing titles and dates",
  "filings-mix": "filing-type share %",
  "financial-stress": "the OFR FSI index level",
  "commodity-vol-regime":
    "an implied-volatility index in percent, its percentile, and session counts",
  "credit-spread-chart": "option-adjusted spreads in percentage points",
  "credit-quality-gap":
    "the high-yield minus investment-grade spread, in percentage points",
  "home-value-momentum": "year-over-year home-value change, a percentage",
  "index-annual-returns": "calendar-year percent returns",
  "index-drawdown": "percent below the window high",
  "index-level": "an equity/volatility index level, not a price",
  "regional-home-price-bars": "FHFA index year-over-year percentages",
  "vix-gauge": "the VIX index level and its regime band",
  "home-price-index": "the Case-Shiller index level (base year = 100)",
  "index-level-chart": "an equity/volatility index level, not a price",
  "mortgage-rate-chart": "the 30-year mortgage rate, a percentage",
  "regional-home-prices": "FHFA index levels / cumulative % change",
  "flappy-bird": "a canvas game",
  "funding-bars": "annualized funding %",
  "funding-carry-area": "funding carry %",
  "funding-comparison": "per-venue funding %",
  "funding-crowding-scatter": "funding % vs positioning",
  "funding-heatmap": "a funding % grid",
  "funding-leaderboard-bars": "funding %",
  "funding-rate-chart": "funding % history",
  "funding-spread-bars": "cross-venue funding spread %",
  "funding-venue-heatmap": "funding % by venue",
  "fx-board": "FX rates (units per USD), not a USD amount",
  "fx-cross-heatmap": "FX cross rates",
  "fx-movers-bars": "FX day change %",
  "fx-trend-chart": "FX rate history",
  "gold-silver-ratio": "ounces of silver per ounce of gold",
  group: "a container — its children each render their own money",
  heading: "static heading text",
  "hero-number": "a user-typed display value",
  "holiday-calendar": "market-holiday dates",
  image: "an image",
  "image-gallery": "images",
  "inflation-pulse": "the CPI index level and change %",
  "journal-results": "journal outcomes in %",
  "journal-score": "calibration scores",
  "labor-force-flow": "participation vs unemployment %",
  "labor-market": "unemployment % and payroll job counts",
  "lightning-stats": "node/channel counts and capacity in BTC",
  "link-grid": "user-authored links",
  "liquidity-basis-bars": "spread % and basis in bps",
  "ma-multiplier": "price / moving-average ratio",
  "macro-calendar": "event dates",
  "market-hours": "exchange session clocks",
  marquee: "user-authored scrolling text",
  "mayer-multiple": "price / 200DMA ratio",
  "mempool-fee-curve": "projected fee rates in sat/vB",
  "metal-annual-returns": "calendar-year returns %",
  "metal-compare-chart": "metals indexed to 0% — relative performance",
  "metal-cot-breakdown": "CFTC positioning in contracts",
  "metal-cot-concentration": "trader-concentration shares % and trader counts",
  "metal-cot-disaggregated": "the five trader classes' positions in contracts",
  "metal-cot-gauge": "positioning percentile and contracts",
  "metal-cot-net": "net positioning in contracts",
  "metal-cot-percentile": "a positioning percentile and z-score, in contracts",
  "metal-drawdown": "drawdown %",
  "metal-performance": "total return % per horizon",
  "metal-positioning-vs-price": "a correlation coefficient",
  "metal-ratio-chart": "a metal/metal ratio",
  "metal-ratio-percentile": "a metal/metal ratio and its percentile",
  "metal-rolling-correlation": "a rolling correlation coefficient, or a beta",
  "metal-return-distribution": "monthly-return distribution %",
  "metal-seasonality": "monthly returns %",
  "metal-volatility": "realised volatility %",
  "metals-correlation": "daily-return correlations",
  "mining-pools": "pool block counts",
  "mining-pools-share": "pool share %",
  "misery-index": "unemployment + inflation, in points",
  "movers-bars": "24h change %",
  "movers-bubbles": "24h change %",
  "mvrv-zscore-chart": "a z-score",
  // The `volume` metric is base-asset traded volume, not notional — the same
  // "share volume" case `formatCompact` exists for. Its other two metrics are
  // percentages, so no square on this grid is ever a currency amount.
  "return-calendar": "daily return %, intraday range %, or base-asset volume",
  "return-distribution": "return distribution %, σ % and observation counts",
  "breadth-histogram": "cross-sectional % change, advancing share and counts",
  "funding-calendar": "daily summed funding rate %",
  "funding-distribution": "funding-rate % distribution and annualised carry %",
  "sentiment-calendar": "the Fear & Greed index, a 0-100 score",
  // APY percentages and pool counts only — the USD TVL floor is deliberately
  // not printed on the card, so no unconverted dollar figure reaches it.
  "yield-distribution": "pool APY % distribution",
  "news-feed": "headlines",
  "nft-activity-bars": "24h sales counts",
  note: "user-authored markdown",
  nupl: "net unrealized profit/loss %",
  "nupl-cycle-chart": "NUPL % history",
  "nyfed-fed-funds-band-gauge": "EFFR vs the target band, in %",
  "nyfed-sofr-term-averages-bars": "SOFR term averages %",
  "ofr-stress-category-area": "FSI category contributions, in index points",
  "ohlcv-volume-bars":
    "candle volume in the base asset (coins), which the currency layer deliberately never converts",
  "onchain-oscillator-overlay": "normalized oscillators",
  "options-flow-skew": "call/put skew",
  "options-iv": "DVOL implied-vol points",
  "options-max-pain-multi": "max-pain distance from spot, in %",
  "options-put-call": "put/call ratios and %",
  "options-vol-spread": "an implied-vol spread",
  "payrolls-bars": "monthly payroll job counts",
  "pi-cycle": "111DMA / 350DMA ratio",
  pomodoro: "a timer",
  "portfolio-movers": "holdings ranked by 24h change %",
  "puell-multiple": "the Puell ratio",
  "put-call-gauge": "a put/call ratio",
  quote: "a user-authored quote",
  "real-wages": "real earnings vs CPI, in %",
  "reserve-risk": "the reserve-risk ratio",
  "rsi-momentum": "RSI, 0–100",
  "rules-card": "user-authored rules",
  "sector-bars":
    "sector change % (its market-cap sibling is sector-performance)",
  "sentiment-gauge": "0–100 fear & greed",
  "session-progress": "a session clock",
  "short-volume": "share counts and % of reported volume",
  "short-volume-bars": "% of reported volume sold short",
  snake: "a canvas game",
  sopr: "the SOPR ratio",
  "spotify-embed": "an embed",
  stopwatch: "a timer",
  "treasury-auction-demand-scatter": "awarded rate % vs bid-to-cover",
  "treasury-auctions": "auction yields % and bid-to-cover",
  "treasury-avg-rate-bars": "average interest rates %",
  "trending-bars": "24h change %",
  "trending-bubbles": "24h change %",
  "us-gold-vaults": "fine troy ounces per vault",
  video: "an embed",
  "yield-composition-scatter": "base vs reward APY %",
  "yield-curve": "Treasury yields %",
  "yield-momentum-bars": "yield change in bps",
};

/**
 * Frames whose money is real but never lands in text this harness can read, with
 * the reason. They still get the weaker check (mounts, and shows NO currency
 * symbol at all) — so if one of them starts rendering money it fails here and
 * gets promoted into the strict group rather than sitting in a blind spot.
 *
 * Bounded below, because this list is the only place a frame can hide.
 */
const UNREADABLE_HERE: Record<string, string> = {
  "capital-structure-bars": "the mock has no SEC balance-sheet facts",
  "metal-open-interest": "the mock pairs no spot price with the OI report",
  "nyfed-reference-rate-bars":
    "default config shows the rate %, not the volume",
  "options-oi-ladder-heatmap":
    "the mock has a single expiry, so it shows empty",
  "options-vol-smile": "the mock has no vol-smile series",
  "portfolio-allocation": "behind the Binance connect gate — no credentials",
  "portfolio-holdings": "behind the Binance connect gate — no credentials",
  "portfolio-value": "behind the Binance connect gate — no credentials",
  "portfolio-value-bars": "behind the Binance connect gate — no credentials",
  "trending-coins": "its money branch needs a coin with no 24h change",
  "treasury-debt-composition-area": "the mock has no composition series",
  "volume-movers-scatter": "mock day stats carry no 24h notional volume",
  "volume-share-donut": "mock day stats carry no 24h notional volume",
};

/**
 * CONVERTS frames whose own DATA quotes a literal dollar (a Polymarket question:
 * "BTC above $100k by year end?"). Their money still must be converted, but the
 * "no `$` anywhere" assertion cannot apply.
 */
const DATA_QUOTES_USD = [
  "prediction-markets",
  "prediction-market-bars",
  "prediction-market-scatter",
  "prediction-markets-bubble",
];

/**
 * CONVERTS frames that render money through `money.magnitude` — converted but
 * deliberately symbol-less (an axis tick). Assert the numbers move, not that a
 * baht sign appears.
 */
const MAGNITUDE_ONLY = [
  "options-oi-skew",
  "home-value-chart",
  "home-value-bars",
  "home-value-scatter",
];

// ── harness ────────────────────────────────────────────────────────────────

// jsdom lacks these browser APIs the renderer + charts + canvas frames touch.
// Unlike the other smoke files this one also gives elements a NON-ZERO box and
// fires ResizeObserver once, because D3 charts/treemaps size themselves from
// `getBoundingClientRect()` / `offsetWidth` and skip every label at width 0 —
// without it 20 chart frames render a bare title and their money is invisible.
/** Descriptors this file overwrites, captured before the first patch so
 *  `afterAll` can put the originals back. Keyed by property name — every name
 *  below lives on exactly one of the patched prototypes. */
const ORIGINALS = new Map<string, PropertyDescriptor>();

beforeAll(() => {
  const remember = (target: object, ...props: string[]) => {
    for (const prop of props) {
      const descriptor = Object.getOwnPropertyDescriptor(target, prop);
      if (descriptor) ORIGINALS.set(prop, descriptor);
    }
  };
  remember(
    globalThis,
    "IntersectionObserver",
    "ResizeObserver",
    "fetch",
    "matchMedia",
  );
  remember(HTMLCanvasElement.prototype, "getContext");
  remember(
    SVGElement.prototype,
    "getTotalLength",
    "getPointAtLength",
    "getBBox",
  );
  remember(
    Element.prototype,
    "getBoundingClientRect",
    "clientWidth",
    "clientHeight",
  );
  remember(HTMLElement.prototype, "offsetWidth", "offsetHeight");

  class SizedObserver {
    constructor(private cb?: (entries: unknown[], obs: unknown) => void) {}
    observe(target?: unknown) {
      this.cb?.([{ target, contentRect: { width: 640, height: 320 } }], this);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const g = globalThis as unknown as Record<string, unknown>;
  g.IntersectionObserver = SizedObserver;
  g.ResizeObserver = SizedObserver;
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
  // Hermetic: `custom-data` fetches a user-declared URL on mount. Nothing here
  // may touch the network, so every fetch fails fast and the frame shows its own
  // error state.
  g.fetch = () => Promise.reject(new Error("offline test"));
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
  // jsdom implements no SVG geometry, and the line charts measure their own path
  // to animate the draw-in. Without this they throw and every chart frame
  // renders "Frame crashed" instead of its numbers.
  const svg = SVGElement.prototype as unknown as Record<string, unknown>;
  svg.getTotalLength = () => 0;
  svg.getPointAtLength = () => ({ x: 0, y: 0 });
  svg.getBBox = () => ({ x: 0, y: 0, width: 640, height: 320 });
  Element.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 640,
      bottom: 320,
      width: 640,
      height: 320,
      toJSON() {},
    }) as DOMRect;
  for (const [prop, value] of [
    ["clientWidth", 640],
    ["clientHeight", 320],
  ] as const) {
    Object.defineProperty(Element.prototype, prop, {
      configurable: true,
      get: () => value,
    });
  }
  for (const [prop, value] of [
    ["offsetWidth", 640],
    ["offsetHeight", 320],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get: () => value,
    });
  }
});

// Hand every patched prototype and global back. Vitest gives each file its own
// jsdom, so nothing outside this file can see them — but a sized
// `getBoundingClientRect` is exactly the kind of stub that silently changes what
// a neighbouring suite measures if that ever stops being true.
afterAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const [target, props] of [
    [g, ["IntersectionObserver", "ResizeObserver", "fetch"]],
    [HTMLCanvasElement.prototype, ["getContext"]],
    [SVGElement.prototype, ["getTotalLength", "getPointAtLength", "getBBox"]],
    [
      Element.prototype,
      ["getBoundingClientRect", "clientWidth", "clientHeight"],
    ],
    [HTMLElement.prototype, ["offsetWidth", "offsetHeight"]],
  ] as const) {
    for (const prop of props) {
      const original = ORIGINALS.get(prop);
      if (original) Object.defineProperty(target, prop, original);
      else delete (target as Record<string, unknown>)[prop];
    }
  }
});

const registry = createRegistry(allFrames);
const frameByName = new Map(allFrames.map((f) => [f.name, f]));

/**
 * The offline mock with the USD→THB rate pinned. The mock seeds unlisted
 * currencies pseudo-randomly (0.5–4.5), which is close enough to 1 that
 * `usd × rate` and `usd × rate²` can format identically — useless for the
 * double-conversion check below. Only THB is patched, so the frames that consume
 * the `fx-rates` capability themselves still see the mock's own data.
 */
class FixedRateProvider extends MockMarketDataProvider {
  override async getFxRates(
    base: string,
    symbols: string[],
  ): Promise<FxRate[]> {
    const rates = await super.getFxRates(base, symbols);
    return rates.map((r) => (r.symbol === "THB" ? { ...r, rate: RATE } : r));
  }

  /**
   * One emission, frozen. The mock wobbles its mids ±0.4% on a 1500 ms timer,
   * and the leak assertions compare a frame's USD text with its THB text
   * byte-for-byte (`journal-log`, `journal-open` both print a live mid). A board
   * normally renders in milliseconds, so the timer never fires — but one render
   * outliving it on a loaded machine would move the price between the two boards
   * and fail on timing alone. `super` emits synchronously before it arms the
   * timer, so stopping it immediately keeps the mock's own first value and drops
   * the clock.
   */
  override subscribeMids(
    onMids: (mids: Record<string, number>) => void,
    symbols?: readonly string[],
  ): () => void {
    const stop = super.subscribeMids(onMids, symbols);
    stop();
    return () => {};
  }
}

/** One shared provider — ~460 boards render against it, all offline. */
const provider = new FixedRateProvider("normal");

/** The mock's first mid for `symbol` — the same value the frames render (the
 *  provider above emits synchronously and never moves). */
function firstMid(symbol: string): number {
  let mid = 0;
  provider.subscribeMids(
    (mids) => {
      mid = mids[symbol] ?? 0;
    },
    [symbol],
  );
  return mid;
}

/**
 * Config overrides for frames whose DEFAULT config hides their money path.
 * Deliberately tiny and reasoned: an override is the alternative to parking a
 * frame in `UNREADABLE_HERE` forever, so it must open the money path up, never
 * close one down.
 */
const CONFIG_OVERRIDE: Record<
  string,
  { why: string; config: Record<string, unknown> }
> = {
  "price-compare": {
    why:
      "its default `normalize: true` rebases both series to % change, so " +
      "`money.price` is never called; raw-price mode is the one that formats " +
      "money, and the one a leak would hide in",
    config: { normalize: false },
  },
};

/** A one-frame board on `code`, with schema-valid seeded config for the frame. */
function specFor(frameName: string, code: CurrencyCode): DashboardSpec {
  const def = frameByName.get(frameName);
  if (!def) throw new Error(`no such frame: ${frameName}`);
  return DashboardSpecSchema.parse({
    title: "content smoke",
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
        config: {
          ...buildDefaultConfig(def),
          ...(CONFIG_OVERRIDE[frameName]?.config ?? {}),
        },
      },
    ],
  });
}

/** Flush the mock's resolved promises; the board's fx poll lands first, then
 *  every card re-renders through the resolved rate. */
async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

interface Rendered {
  /** Card text + every `title` tooltip, whitespace-collapsed. */
  text: string;
  /** True when the renderer showed its error card instead of the frame. */
  errored: boolean;
  /** True when the frame threw and the error boundary took over. */
  crashed: boolean;
  /** True when no card element mounted at all. */
  missing: boolean;
}

/**
 * Renders one frame on a `code` board and captures what the user can read: the
 * CARD's text (not the container's, whose text would include the renderer's
 * injected `<style>` sheet) plus every `title` attribute — several frames put
 * their money in a tooltip (`sector-treemap`, `MoverRow`), and a leak hides
 * there just as well as in the body.
 */
async function renderOnce(
  frameName: string,
  code: CurrencyCode,
): Promise<Rendered> {
  const { container } = render(
    <FramesProvider providers={[provider]}>
      <DashboardRenderer spec={specFor(frameName, code)} registry={registry} />
    </FramesProvider>,
  );
  await settle();
  const card = container.querySelector(".zf-frame, .zf-bare, .zf-group");
  const titles = Array.from(card?.querySelectorAll("[title]") ?? [])
    .map((el) => el.getAttribute("title") ?? "")
    .join(" ");
  const out: Rendered = {
    text: `${card?.textContent ?? ""} ${titles}`.replace(/\s+/g, " ").trim(),
    errored: container.querySelector(".zf-frame--error") !== null,
    crashed: card?.querySelector(".zf-error") !== null,
    missing: card === null,
  };
  cleanup();
  return out;
}

/** Every frame rendered once per board, collected up front and shared by the
 *  assertion groups below (each group would otherwise re-render all 230). */
const usdBoard = new Map<string, Rendered>();
const thbBoard = new Map<string, Rendered>();

/**
 * The journal's shared store starts with no OPEN calls (only graded examples),
 * so `journal-open` renders "no open calls" and its money — the entry→now→target
 * row — never mounts. Seed one call, in USD, the way the Log frame does: entry is
 * the price at log time, and `now` is whatever the quote stream says. Without
 * this the frame's classification would be asserting the empty state.
 */
const SEEDED_ENTRY = 60_000;
/** `logCall` derives a long's target as entry × 1.03 (journal-store). */
const SEEDED_TARGET = SEEDED_ENTRY * 1.03;

beforeAll(async () => {
  logCall({
    sym: "BTC",
    dir: "long",
    confidence: 70,
    claim: "content-smoke fixture — one open call so OpenCard mounts",
    cls: "mean-reversion",
    entry: SEEDED_ENTRY,
  });
  for (const frame of allFrames) {
    usdBoard.set(frame.name, await renderOnce(frame.name, "USD"));
    thbBoard.set(frame.name, await renderOnce(frame.name, "THB"));
  }
}, 300_000);

function usd(name: string): Rendered {
  const r = usdBoard.get(name);
  if (!r) throw new Error(`${name} was never rendered on the USD board`);
  return r;
}

function thb(name: string): Rendered {
  const r = thbBoard.get(name);
  if (!r) throw new Error(`${name} was never rendered on the THB board`);
  return r;
}

/** Asserts the frame actually rendered (so no assertion below can pass against
 *  an error card or an empty shell). */
function assertRendered(name: string, r: Rendered, code: string) {
  expect(r.missing, `${name} [${code}] mounted no card`).toBe(false);
  expect(
    r.errored,
    `${name} [${code}] rendered the renderer's error card`,
  ).toBe(false);
  // A crash fallback carries no money, so every absence assertion below would
  // pass vacuously on a thrown frame.
  expect(r.crashed, `${name} [${code}] crashed: ${r.text}`).toBe(false);
  if (!TEXTLESS.includes(name))
    expect(r.text.length, `${name} [${code}] rendered no text`).toBeGreaterThan(
      0,
    );
}

/** Frames that render no text at all by nature (a rule), so the non-empty check
 *  below does not apply to them. */
const TEXTLESS = ["divider"];

const CLASSIFIED = [
  ...Object.keys(CONVERTS),
  ...Object.keys(USD_ONLY),
  ...Object.keys(NO_MONEY),
];

// ── the classification is exhaustive and maintained ────────────────────────

describe("the currency classification covers the whole registry", () => {
  it("partitions allFrameMetas exactly — one bucket per frame, none missing", () => {
    const registered = allFrameMetas.map((m) => m.name).sort();
    // A new frame lands in neither list, so this fails until someone decides
    // whether it converts, is USD-only, or shows no money at all.
    const unclassified = registered.filter((n) => !CLASSIFIED.includes(n));
    expect(
      unclassified,
      `unclassified frames — add each to CONVERTS, USD_ONLY or ` +
        `NO_MONEY with a reason:\n${unclassified.map((n) => `  - ${n}`).join("\n")}`,
    ).toEqual([]);
    const unknown = CLASSIFIED.filter((n) => !registered.includes(n));
    expect(unknown, `classified but not registered: ${unknown}`).toEqual([]);
    // Two buckets assert opposite things, so a frame moved between them must be
    // MOVED, not copied.
    expect(new Set(CLASSIFIED).size).toBe(CLASSIFIED.length);
    expect(CLASSIFIED.length).toBe(registered.length);
  });

  it("every entry carries a reason", () => {
    for (const bucket of [CONVERTS, USD_ONLY, NO_MONEY]) {
      for (const [name, reason] of Object.entries(bucket)) {
        expect(reason.length, `${name} needs a reason`).toBeGreaterThan(3);
      }
    }
  });

  it("NO_MONEY is not a dumping ground", () => {
    // The escape from every assertion in this file is "it shows no money".
    // Ratchet: ~60% of frames legitimately show none (games, timers, notes, and
    // the large percent/count/index families). A jump means money frames are
    // being parked here instead of classified — which is how `journal-open` sat
    // here while OpenCard printed three prices. Raised 140 → 145 with the
    // FRED/FHFA house-price and credit-spread frames, which render index levels
    // and percentages — the Zillow pair beside them, being actual dollars, went
    // to CONVERTS rather than here. Raised again (145 → 151) for the index
    // level/drawdown/annual-return/VIX-regime and housing-momentum frames, all
    // percentages or unit-less levels; their three money siblings
    // (mortgage-payment, home-value-bars, home-value-scatter) went to CONVERTS.
    // Raised again (151 → 156) for the calendar-heatmap and histogram frames:
    // return/funding calendars and the return, funding, breadth and yield
    // histograms render percentages, a 0-100 sentiment score, and observation
    // counts. The one member of that batch that *does* show dollars — the
    // migrated `etf-flow-calendar`, whose day tooltip is `money.compact` — is in
    // CONVERTS, which is the check that this ratchet is still meaningful.
    // Raised once more (156 → 157) for the `group` container, which renders no
    // content of its own at all — each child card resolves its own currency, so
    // there is nothing here to classify either way.
    // Raised once more (157 → 158) for `margin-trend`, the only member of the
    // 14-frame equity deep-dive batch that shows no money: it plots gross,
    // operating and net margin, which are percentages of revenue. Everything
    // else in that batch is money and went to CONVERTS (profile, valuation,
    // ratings, the four options frames) or USD_ONLY (the statement, earnings
    // and 13F frames, all figures as reported) — the split is what keeps this
    // ratchet meaningful.
    expect(Object.keys(NO_MONEY).length).toBeLessThanOrEqual(158);
    expect(Object.keys(CONVERTS).length).toBeGreaterThanOrEqual(70);
  });

  it("the harness-blind list is bounded and only excuses money frames", () => {
    const money = new Set([...Object.keys(CONVERTS), ...Object.keys(USD_ONLY)]);
    for (const [name, why] of Object.entries(UNREADABLE_HERE)) {
      expect(money.has(name), `${name} is not a money frame`).toBe(true);
      expect(why.length, `${name} needs a reason`).toBeGreaterThan(3);
    }
    // Only a fifth of the money frames may be invisible to this harness; more
    // than that and the file stops meaning much.
    expect(Object.keys(UNREADABLE_HERE).length).toBeLessThanOrEqual(20);
    for (const name of [...DATA_QUOTES_USD, ...MAGNITUDE_ONLY]) {
      expect(name in CONVERTS, `${name} must be a CONVERTS frame`).toBe(true);
    }
  });

  it("every config override opens a money path instead of hiding one", () => {
    // An override is the escape from "the default config renders no money", so
    // it must not double as an escape from the assertions: a frame given one is
    // held to the strict group, never parked in UNREADABLE_HERE as well.
    for (const [name, { why, config }] of Object.entries(CONFIG_OVERRIDE)) {
      expect(frameByName.has(name), `${name} is not a registered frame`).toBe(
        true,
      );
      expect(why.length, `${name} needs a reason`).toBeGreaterThan(3);
      expect(Object.keys(config).length).toBeGreaterThan(0);
      expect(
        name in UNREADABLE_HERE,
        `${name} is overridden AND excused — pick one`,
      ).toBe(false);
    }
    // Bounded: overriding config until a frame goes green is exactly the abuse
    // this file exists to prevent.
    expect(Object.keys(CONFIG_OVERRIDE).length).toBeLessThanOrEqual(3);
  });
});

// ── the core assertion: does converted money reach the card? ────────────────

const READABLE_CONVERTS = Object.keys(CONVERTS).filter(
  (n) => !(n in UNREADABLE_HERE),
);
const BLIND_MONEY = Object.keys(UNREADABLE_HERE);
const READABLE_USD_ONLY = Object.keys(USD_ONLY).filter(
  (n) => !(n in UNREADABLE_HERE),
);

describe("frames that convert quote the board's currency, not dollars", () => {
  it.each(READABLE_CONVERTS)("%s converts on a THB board", (name) => {
    const onThb = thb(name);
    const onUsd = usd(name);
    assertRendered(name, onUsd, "USD");
    assertRendered(name, onThb, "THB");

    // 1. The money moved. A frame reading the same on both boards either shows
    //    no money (wrong bucket) or ignores the currency layer (a leak).
    expect(
      onThb.text,
      `${name} rendered identical text on a USD and a THB board — its money ` +
        `never went through useMoney()`,
    ).not.toBe(onUsd.text);

    // 2. No dollar sign survives. This is the leak that ships: a `$` in front of
    //    a number the user reads as baht.
    if (!DATA_QUOTES_USD.includes(name)) {
      expect(
        onThb.text,
        `${name} still printed a dollar figure on a THB board`,
      ).not.toContain("$");
    }

    // 3. The board's symbol is in front of an actual number (not stranded in a
    //    caption) — except for the axis frames that convert without a symbol.
    if (!MAGNITUDE_ONLY.includes(name)) {
      expect(
        onThb.text,
        `${name} printed no baht figure on a THB board`,
      ).toMatch(new RegExp(`${BAHT}[\\d-]`));
      // And the same figure wore a dollar sign on the USD board, which is what
      // makes the symbol the currency layer's and not a hard-coded glyph.
      expect(
        onUsd.text,
        `${name} printed no USD figure on a USD board`,
      ).toMatch(/\$[\d-]/);
    }
  });

  it.each(BLIND_MONEY)(
    "%s shows no currency symbol at all here (its money is unreadable)",
    (name) => {
      // Documented blind spot. Assert the blindness itself: if the frame starts
      // rendering money as text, this fails and it moves into the strict group.
      const onThb = thb(name);
      assertRendered(name, onThb, "THB");
      expect(
        onThb.text,
        `${name} now renders money as text — move it out of UNREADABLE_HERE ` +
          `into the strict group (${UNREADABLE_HERE[name]})`,
      ).not.toContain(BAHT);
      if (name in CONVERTS) {
        expect(
          onThb.text,
          `${name} leaked a dollar figure onto a THB board`,
        ).not.toContain("$");
      }
    },
  );
});

describe("the USD_ONLY carve-outs stay in dollars on a converted board", () => {
  it.each(READABLE_USD_ONLY)(
    "%s still quotes dollars on a THB board",
    (name) => {
      const onThb = thb(name);
      assertRendered(name, onThb, "THB");
      // Converting these is the bug: a baht national debt, or a 10-K figure
      // restated at today's FX rate, is a number nobody quotes.
      expect(onThb.text, `${name} lost its USD figures on a THB board`).toMatch(
        /\$[\d-]/,
      );
      expect(
        onThb.text,
        `${name} is USD_ONLY but rendered a baht symbol`,
      ).not.toContain(BAHT);
      // Same text on both boards — the carve-out means the currency layer does
      // not touch it at all.
      expect(onThb.text).toBe(usd(name).text);
    },
  );
});

describe("frames with no money show none on either board", () => {
  it.each(Object.keys(NO_MONEY))("%s emits no currency figure", (name) => {
    for (const [code, r] of [
      ["USD", usd(name)],
      ["THB", thb(name)],
    ] as const) {
      assertRendered(name, r, code);
      // A NO_MONEY frame that starts rendering money fails here and has to be
      // reclassified — that is what keeps the bucket from being a free pass.
      expect(
        r.text,
        `${name} [${code}] printed a dollar figure but is classified NO_MONEY ` +
          `(${NO_MONEY[name]})`,
      ).not.toMatch(/\$[\d-]/);
      expect(
        r.text,
        `${name} [${code}] printed a baht symbol but is classified NO_MONEY`,
      ).not.toContain(BAHT);
    }
  });
});

// ── the leaks ──────────────────────────────────────────────────────────────

describe("hard-coded USD leak regressions", () => {
  it("converts every MoverRow consumer, not just the one that opted in", () => {
    // The regression: MoverRow's price formatter was an optional prop defaulting
    // to the USD `formatPrice`, and only `top-movers` passed one — so on a baht
    // board its rows converted while `coin-movers` and `price-ticker` quoted
    // dollars, with the `$` living in the primitive's default where no source
    // grep could find it. The row resolves the currency itself now.
    for (const name of ["coin-movers", "price-ticker", "top-movers"]) {
      const onThb = thb(name).text;
      expect(onThb, `${name} printed no baht figure`).toMatch(
        new RegExp(`${BAHT}[\\d-]`),
      );
      expect(
        onThb,
        `${name} still printed dollars on a THB board`,
      ).not.toContain("$");
    }
  });

  it("the journal's dollar figures are provider quotes, not typed amounts", () => {
    // Why the journal frames are leaks and not USD_ONLY carve-outs: the only
    // values the user enters here are a confidence % and a note. Every figure
    // wearing a currency symbol is a market price, so it belongs to the display
    // layer exactly like price-ticker's row does. This pins that provenance —
    // the figures are the mock's own mids, not numbers someone typed.
    const btc = firstMid("BTC");
    expect(btc).toBeGreaterThan(1000);

    const open = thb("journal-open").text;
    // `now` is the live quote, converted exactly once — the × RATE² and raw-USD
    // renderings are asserted absent so "it shows baht" can't pass on a
    // double-converted or unconverted number.
    expect(open).toContain(`now ${formatMoney(btc * RATE, "THB")}`);
    expect(open).not.toContain(formatMoney(btc * RATE * RATE, "THB"));
    expect(open).not.toContain(formatMoney(btc, "USD"));
    // And the card really is the populated one — the "no open calls" empty state
    // carries no money, so every absence assertion above would pass for free.
    expect(open).not.toContain("no open calls");
    // `entry` is the mid captured at log time and `target` is derived from it,
    // so both convert as well. The STORED call stays USD — only rendering moves.
    expect(open).toContain(formatMoney(SEEDED_ENTRY * RATE, "THB"));
    expect(open).toContain(formatMoney(SEEDED_TARGET * RATE, "THB"));

    // journal-log prints the same kind of figure: the live mid of the symbol its
    // picker has selected (a HIP-3 equity by default), not a logged amount.
    const picked = firstMid("xyz:TSLA");
    expect(picked).toBeGreaterThan(0);
    expect(thb("journal-log").text).toContain(
      formatMoney(picked * RATE, "THB"),
    );
    expect(thb("journal-log").text).not.toContain(formatMoney(picked, "USD"));
  });
});

// ── the magnitude is right, not just the symbol ─────────────────────────────

describe("conversion happens exactly once", () => {
  it("a compact aggregate prints usd × rate, not usd × rate² or raw USD", async () => {
    const [top] = await provider.getCoinMarkets();
    expect(top.marketCapUsd).toBeGreaterThan(0);

    const once = formatMoneyCompact(top.marketCapUsd * RATE, "THB");
    const twice = formatMoneyCompact(top.marketCapUsd * RATE * RATE, "THB");
    const unconverted = formatMoneyCompact(top.marketCapUsd, "THB");
    // The three checks below only discriminate if the three renderings are
    // distinguishable strings at this magnitude.
    expect(new Set([once, twice, unconverted]).size).toBe(3);

    const text = thb("market-cap-treemap").text;
    expect(text).toContain(once);
    expect(text).not.toContain(twice);
    // The symbol-swap failure: a baht sign in front of an unconverted number.
    expect(text).not.toContain(unconverted);
  });

  it("a price level converts once, and its axis converts with it", async () => {
    const summary = await provider.getOptionsSummary("BTC");
    const spot = summary.underlyingPrice;
    expect(spot).toBeGreaterThan(1000);

    const text = thb("options-oi-strike").text;
    expect(text).toContain(formatMoney(spot * RATE, "THB"));
    expect(text).not.toContain(formatMoney(spot * RATE * RATE, "THB"));
    expect(text).not.toContain(formatMoney(spot, "THB"));

    // The axis: the frame draws the `strikes` nearest spot in ascending order and
    // labels the two ends through `money.magnitude` — converted, symbol-less.
    // Recompute that window so the assertions name the labels it actually
    // renders, and not just any strike in the payload.
    const def = frameByName.get("options-oi-strike")!;
    const { strikes: count } = buildDefaultConfig(def) as { strikes: number };
    const near = [...summary.nearestExpiry.strikes]
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, count)
      .sort((a, b) => a.strike - b.strike);
    const lo = near[0].strike;
    const hi = near[near.length - 1].strike;
    expect(lo).toBeGreaterThan(1000);
    expect(hi).toBeGreaterThan(lo);
    // Guard: at this magnitude a converted label and an unconverted one are
    // different strings, so both directions below discriminate.
    expect(formatMagnitude(lo)).not.toBe(formatMagnitude(lo * RATE));

    // Converted, both ends.
    expect(text).toContain(formatMagnitude(lo * RATE));
    expect(text).toContain(formatMagnitude(hi * RATE));
    // And the pre-fix output is gone: a bare `formatCompact` on the strike would
    // print the raw USD magnitude beside a baht spot — the exact mixed-unit card
    // this frame was fixed for (6a81a90).
    expect(text).not.toContain(formatMagnitude(lo));
    expect(text).not.toContain(formatMagnitude(hi));
    // Positive control on the dollar board: those raw magnitudes ARE what the
    // axis prints when no conversion is due, so the absence above is the
    // conversion, not a string that never appears.
    const onUsd = usd("options-oi-strike").text;
    expect(onUsd).toContain(formatMagnitude(lo));
    expect(onUsd).toContain(formatMagnitude(hi));
  });
});
