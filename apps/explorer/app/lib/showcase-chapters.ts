// Shared, directive-free data module: the showcase's chapter/specimen casting.
// Split out of FramesShowcase.tsx (a "use client" module) so the SERVER
// landing page can enumerate the specimens too — it derives each slot's
// minimum height from the React-free frame metas (frame-slot.ts) and passes
// the numbers down, keeping the ~285-meta schemas chunk out of the client
// bundle entirely.

export type Specimen = {
  frame: string;
  /** Extra config merged over schema defaults. */
  config?: Record<string, unknown>;
  title?: string;
  /** Tailwind sizing for the collage slot. */
  className: string;
  /** Parallax drift distance — vary per specimen for layered depth. */
  drift: number;
  /** Collage tilt, degrees. Subtle: the cards are real UI, not stickers. */
  tilt?: number;
};

export type Chapter = {
  key: string;
  label: string;
  headline: string;
  blurb: string;
  specimens: Specimen[];
};

// Casting notes: keyless sources, browser-direct wherever possible (Hyperliquid,
// CoinGecko, DeFiLlama, mempool.space, Deribit, alternative.me, Frankfurter,
// Zillow) so every specimen streams for every visitor; sized/tilted for collage
// rhythm. The proxied official sources (FRED, Treasury, FHFA) are fine here too
// — the explorer ships the relay at /api/zframes-proxy, edge-cached per host.
//
// One cost worth knowing before adding a specimen: Zillow publishes ZHVI as a
// single uncompressed ~4.4 MB CSV with no per-region endpoint, so the FIRST
// ZHVI card on the page pays that download and every later one is free (the
// provider caches the parsed table under a constant key). Cast Zillow freely,
// but know the first one is not cheap.
export const CHAPTERS: Chapter[] = [
  {
    key: "markets",
    label: "Prices & Markets",
    headline: "Equities and crypto on one tape.",
    blurb:
      "TSLA and NVDA candles as equity perps, the session clock beside them, and the whole crypto universe on the same live tape. Charts, volume profiles, tickers: the pulse of the tape.",
    specimens: [
      {
        frame: "price-chart",
        className: "w-[min(28rem,80vw)] h-72",
        drift: 22,
        tilt: -1.2,
      },
      {
        frame: "volume-profile",
        className: "w-60 h-72 hidden sm:block",
        drift: 64,
        tilt: 1.6,
      },
      {
        frame: "market-hours",
        className: "w-72 h-60 hidden sm:block",
        drift: 96,
        tilt: 1.2,
      },
      {
        frame: "price-ticker",
        className: "w-[min(26rem,80vw)] h-24 hidden md:block",
        drift: 44,
        tilt: -0.8,
      },
    ],
  },
  {
    key: "macro",
    label: "Macro & Rates",
    headline: "The official numbers, unofficial speed.",
    blurb:
      "The Treasury yield curve, corporate credit spreads, the composition of the federal debt, the FX cross grid, and who actually showed up to the last auction. Official figures, rendered like a terminal, not a press release.",
    specimens: [
      {
        frame: "yield-curve",
        className: "w-[min(28rem,80vw)] h-64",
        drift: 22,
        tilt: -1.2,
      },
      {
        frame: "credit-spread-chart",
        className: "w-80 h-56 hidden sm:block",
        drift: 64,
        tilt: 1.4,
      },
      {
        frame: "treasury-debt-composition-area",
        className: "w-72 h-64 hidden sm:block",
        drift: 96,
        tilt: 1.8,
      },
      {
        frame: "fx-cross-heatmap",
        className: "w-72 h-56 hidden md:block",
        drift: 46,
        tilt: -1.2,
      },
      {
        frame: "treasury-auction-demand-scatter",
        className: "w-64 h-56 hidden lg:block",
        drift: 78,
        tilt: 1,
      },
    ],
  },
  {
    key: "equities",
    label: "Equities & Filings",
    headline: "On the record.",
    blurb:
      "What a company actually filed and how the street is positioned against it — eighteen years of reported revenue stitched across the tags issuers quietly switch mid-history, its filings feed, and daily reported short-sale volume. Public records, read at terminal speed.",
    // `financials-trend` is the deep-dive lead (fundamentals-history), and
    // `filings-feed`/`filings-mix` read EDGAR's submissions JSON (CORS-open,
    // small). Still no `fundamentals`/`capital-structure-bars` here: those read
    // the companyfacts XBRL blob, tens of megabytes for a large-cap, past the
    // proxy's front-page cap. Fine on a board someone chose to build; not here.
    specimens: [
      {
        // The former spotlight lead: revenue stitched across the tag NVIDIA
        // switched to after FY2022 — a naive series just stops there.
        frame: "financials-trend",
        config: { symbol: "NVDA", metric: "revenue", cadence: "annual" },
        className: "w-[min(28rem,80vw)] h-72",
        drift: 24,
        tilt: 1.2,
      },
      {
        frame: "filings-feed",
        className: "w-72 h-64 hidden sm:block",
        drift: 68,
        tilt: -1.4,
      },
      {
        frame: "short-volume-bars",
        className: "w-80 h-56 hidden sm:block",
        drift: 98,
        tilt: -1.8,
      },
      {
        frame: "filings-mix",
        className: "w-60 h-56 hidden md:block",
        drift: 44,
        tilt: 1.4,
      },
    ],
  },
  {
    key: "metals",
    label: "Metals & Commodities",
    headline: "Gold, back to 1968.",
    blurb:
      "Daily London fixes back to 1968 — the deepest price history in the fleet — plus live spot, month-by-year seasonality, weekly futures positioning split by trader class, and gold's own implied-vol regime. Half a century of prints, no key, no signup.",
    // Two of these pull LBMA fix history (~150 KB gzipped per metal, 6 h TTL and
    // deliberately not persisted), so the chapter costs about one image. Keep it
    // to two history-backed cards.
    specimens: [
      {
        frame: "metal-price-chart",
        className: "w-[min(28rem,80vw)] h-64",
        drift: 22,
        tilt: -1.4,
      },
      {
        // The disaggregated report, not the legacy one: the familiar COT lumps
        // miner hedging in with swap-dealer bank shorts — opposite stories.
        frame: "metal-cot-disaggregated",
        className: "w-[24rem] h-[22rem] hidden sm:block",
        drift: 66,
        tilt: 1.4,
      },
      {
        frame: "metal-seasonality",
        className: "w-72 h-56 hidden sm:block",
        drift: 98,
        tilt: 1.8,
      },
      {
        frame: "metals-board",
        className: "w-64 h-48 hidden md:block",
        drift: 44,
        tilt: -1,
      },
      {
        // A commodity has no earnings — "expensive" is answered by where its
        // implied vol sits against its own history, not by a P/E.
        frame: "commodity-vol-regime",
        className: "w-[22rem] h-[22rem] hidden lg:block",
        drift: 78,
        tilt: -1.2,
      },
    ],
  },
  {
    key: "crypto",
    label: "Crypto & On-chain",
    headline: "The whole chain economy, mapped.",
    blurb:
      "Market caps as living treemaps, TVL across every protocol, a token's supply overhang against its FDV, and what a protocol actually keeps of its fees.",
    specimens: [
      {
        frame: "market-cap-treemap",
        className: "w-[min(28rem,80vw)] h-72",
        drift: 26,
        tilt: 1.2,
      },
      {
        frame: "trending-coins",
        className: "w-60 h-72 hidden sm:block",
        drift: 70,
        tilt: -1.4,
      },
      {
        frame: "bitcoin-dominance",
        className: "w-64 h-48 hidden sm:block",
        drift: 98,
        tilt: -1.8,
      },
      {
        frame: "protocol-tvl-chart",
        className: "w-80 h-56 hidden md:block",
        drift: 48,
        tilt: 1.6,
      },
      {
        // The gap between market cap and fully diluted value — for a recent
        // listing that gap is the investment case, and no price chart shows it.
        frame: "crypto-dilution",
        config: { symbol: "ARB" },
        className: "w-[22rem] h-[20rem] hidden md:block",
        drift: 76,
        tilt: -1.2,
      },
      {
        // Fees vs revenue — what users paid against what the protocol kept; a
        // multiple built on the first number flatters a pass-through DEX ~28×.
        frame: "protocol-revenue",
        className: "w-[24rem] h-[20rem] hidden lg:block",
        drift: 30,
        tilt: 1.4,
      },
    ],
  },
  {
    key: "bitcoin",
    label: "Bitcoin Network",
    headline: "Chain health, block by block.",
    blurb:
      "Hashrate, mempool depth, the live fee curve, fresh blocks, difficulty epochs, Lightning — the whole network wired straight into cards.",
    specimens: [
      {
        frame: "btc-hashrate",
        className: "w-[min(26rem,80vw)] h-64",
        drift: 22,
        tilt: -1.4,
      },
      {
        frame: "mempool-fee-curve",
        className: "w-72 h-56 hidden sm:block",
        drift: 68,
        tilt: 1.4,
      },
      {
        frame: "btc-fees",
        className: "w-56 h-44 hidden sm:block",
        drift: 100,
        tilt: 1.8,
      },
      {
        frame: "btc-blocks",
        className: "w-80 h-48 hidden md:block",
        drift: 46,
        tilt: -1,
      },
    ],
  },
  {
    key: "derivatives",
    label: "Derivatives & Options",
    headline: "Where leverage lives.",
    blurb:
      "Funding rates across venues, open interest, strike ladders, put/call positioning and volatility — the positioning picture under the price.",
    specimens: [
      {
        frame: "funding-rate-chart",
        className: "w-[min(28rem,80vw)] h-64",
        drift: 24,
        tilt: 1.2,
      },
      {
        frame: "options-oi-strike",
        className: "w-80 h-56 hidden sm:block",
        drift: 66,
        tilt: -1.4,
      },
      {
        frame: "put-call-gauge",
        className: "w-56 h-48 hidden sm:block",
        drift: 98,
        tilt: -1.6,
      },
      {
        frame: "open-interest",
        className: "w-64 h-28 hidden md:block",
        drift: 44,
        tilt: 1.6,
      },
    ],
  },
  {
    key: "sentiment",
    label: "Sentiment & News",
    headline: "What the crowd is feeling.",
    blurb:
      "Fear & greed over time, mood gauges, rolling headlines — the mood ring for the tape.",
    specimens: [
      {
        frame: "fear-greed-chart",
        className: "w-[min(26rem,80vw)] h-64",
        drift: 24,
        tilt: 1.4,
      },
      {
        frame: "news-feed",
        className: "w-72 h-80 hidden sm:block",
        drift: 66,
        tilt: -1.4,
      },
      {
        frame: "sentiment-gauge",
        className: "w-56 h-48 hidden sm:block",
        drift: 96,
        tilt: 1.8,
      },
    ],
  },
];
