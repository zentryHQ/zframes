import { BACKGROUND_SCENES } from "@zframes/spec";

// Curated dashboards for the gallery (Phase 2). Plain data — imported by both the
// server gallery page and the client preview. Built only from frame types verified
// to render cleanly. Each spec is a minimal-but-complete envelope; DashboardSpecSchema
// fills grid/theme/typography/appearance/background defaults on parse.
//
// NOTE: this static set is the Phase-2 stand-in for what becomes the Neon-backed
// store in Phase 3 (each entry → a `dashboards` row with a jsonb spec).

type Frame = {
  id: string;
  frame: string;
  title?: string;
  position: { x: number; y: number; w: number; h: number };
  config?: Record<string, unknown>;
};

// A per-board cosmetic identity — colour + type + card surface. Mirrors the
// THEME_PRESETS in @zframes/spec (kept inline as plain data so this file stays
// React/Node-free). Each showcase board gets a DISTINCT look so the landing reads
// as three different terminals, not three clones — the `--zf-*` vars the embedded
// DashboardRenderer paints from differ per board.
type Cosmetics = {
  theme?: {
    accentHue: number;
    accentSat: number;
    baseHue: number;
    baseSat: number;
  };
  typography?: {
    fontFamily: "sans" | "mono" | "serif";
    numericStyle: "proportional" | "tabular";
  };
  appearance?: {
    radius: number;
    borderStrength: number;
    surfaceOpacity: number;
    density: number;
    elevation: number;
  };
};

// Each showcase board also declares its OWN Unicorn scene (background.type =
// "unicorn"), paired so the scene's authored hue ≈ the board's accent hue — the
// embed backdrop then renders essentially as authored (0° hue-rotate) and the
// five landing cards each carry a visibly different living scene. Tuned for the
// iframed preview: opacity above the runtime's subtle 0.16 default so the scene
// reads inside a card-sized frame, and scale 0.9 + dpi 1.25 so each scene
// renders at roughly half the default (1 × 1.5) pixel cost — lower aliases the
// scenes' grain/dither texture into visible blocks.
type SceneBackground = {
  type: "unicorn";
  projectId: string;
  opacity: number;
  scale: number;
  dpi: number;
};

function sceneBg(key: string): SceneBackground {
  const scene = BACKGROUND_SCENES.find((s) => s.key === key);
  if (!scene) throw new Error(`unknown background scene: ${key}`);
  return {
    type: "unicorn",
    projectId: scene.projectId,
    opacity: 0.5,
    scale: 0.9,
    dpi: 1.25,
  };
}

// Phosphor-green monospace, sharp dense flat cards — a quant trading terminal.
const LOOK_TERMINAL: Cosmetics = {
  theme: { accentHue: 145, accentSat: 85, baseHue: 150, baseSat: 16 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 4,
    borderStrength: 0.34,
    surfaceOpacity: 1,
    density: 0.85,
    elevation: 0.4,
  },
};

// Hot magenta on violet-black, glassy lifted cards — a vivid crypto desk.
const LOOK_SYNTHWAVE: Cosmetics = {
  theme: { accentHue: 320, accentSat: 88, baseHue: 280, baseSat: 26 },
  typography: { fontFamily: "sans", numericStyle: "proportional" },
  appearance: {
    radius: 20,
    borderStrength: 0.3,
    surfaceOpacity: 0.9,
    density: 1,
    elevation: 1.7,
  },
};

// Warm serif on charcoal-brown, roomy gentle-lift cards — a macro broadsheet.
const LOOK_EDITORIAL: Cosmetics = {
  theme: { accentHue: 22, accentSat: 60, baseHue: 28, baseSat: 12 },
  typography: { fontFamily: "serif", numericStyle: "proportional" },
  appearance: {
    radius: 10,
    borderStrength: 0.18,
    surfaceOpacity: 1,
    density: 1.15,
    elevation: 0.8,
  },
};

// Cool teal on deep blue-black, crisp tabular cards — an on-chain flow desk.
const LOOK_TIDE: Cosmetics = {
  theme: { accentHue: 190, accentSat: 72, baseHue: 202, baseSat: 20 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 12,
    borderStrength: 0.26,
    surfaceOpacity: 0.96,
    density: 0.95,
    elevation: 0.9,
  },
};

// Deep violet glass, lifted glossy cards — a derivatives / vol desk.
const LOOK_NEBULA: Cosmetics = {
  theme: { accentHue: 268, accentSat: 80, baseHue: 258, baseSat: 24 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 16,
    borderStrength: 0.28,
    surfaceOpacity: 0.92,
    density: 1,
    elevation: 1.3,
  },
};

// Signature indigo on cool slate — soft-cornered, borderless, roomy and flat.
// This is what a board looks like straight out of `zframes init`, which is why
// the newest board wears it. It sits closest in HUE to Nebula (242 vs 268), so
// the separation is carried by the SURFACE instead: opaque and flat where
// Nebula is glassy and lifted, and the roundest, airiest, least-bordered cards
// of the six.
const LOOK_AURORA: Cosmetics = {
  theme: { accentHue: 242, accentSat: 72, baseHue: 224, baseSat: 18 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 22,
    borderStrength: 0.14,
    surfaceOpacity: 1,
    density: 1.2,
    elevation: 0.5,
  },
};

// Warm gold on a brown-black vault, serif with tabular figures — a bullion
// ledger. Serif like LOOK_EDITORIAL, and its scene doubles up with that board
// (Ember is the only warm one of the six), so the separation is carried by hue
// and surface: 43 gold against 22 ember, and harder, tighter, denser cards
// against the broadsheet's roomy low-border ones.
const LOOK_BULLION: Cosmetics = {
  theme: { accentHue: 43, accentSat: 90, baseHue: 32, baseSat: 20 },
  typography: { fontFamily: "serif", numericStyle: "tabular" },
  appearance: {
    radius: 6,
    borderStrength: 0.36,
    surfaceOpacity: 1,
    density: 0.95,
    elevation: 0.5,
  },
};

// Steel blue on ink, flat monospaced tabular cards — an interbank dealing board,
// where every card is a rate and nothing is decorative. Shares the Tide scene
// with On-chain & DeFi (212 against its 190), separated by type and surface:
// monospaced and hard-cornered against that board's sans and softer cards.
const LOOK_INTERBANK: Cosmetics = {
  theme: { accentHue: 212, accentSat: 76, baseHue: 220, baseSat: 18 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 6,
    borderStrength: 0.3,
    surfaceOpacity: 1,
    density: 0.9,
    elevation: 0.5,
  },
};

export type CuratedDashboard = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  spec: {
    version: string;
    title: string;
    author: string;
    background: { type: "none" } | SceneBackground;
    theme?: Cosmetics["theme"];
    typography?: Cosmetics["typography"];
    appearance?: Cosmetics["appearance"];
    frames: Frame[];
  };
};

function spec(
  title: string,
  frames: Frame[],
  look: Cosmetics = {},
  background: CuratedDashboard["spec"]["background"] = { type: "none" },
): CuratedDashboard["spec"] {
  return {
    version: "1.0.0",
    title,
    author: "zframes",
    background,
    ...look,
    frames,
  };
}

export const CURATED: CuratedDashboard[] = [
  {
    id: "stocks-macro",
    title: "Stocks & Macro",
    description:
      "Crypto majors alongside official US macro and the equity indices — the same mix used to prove the proxy end-to-end.",
    tags: ["markets", "macro", "equities"],
    spec: spec(
      "Stocks & Macro",
      [
        {
          id: "hd-markets",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Markets",
            subtitle: "Live crypto — browser-direct",
          },
        },
        {
          id: "chart-btc",
          frame: "price-chart",
          title: "BTC",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: { symbol: "BTC" },
        },
        {
          id: "ticker-1",
          frame: "price-ticker",
          title: "Watchlist",
          position: { x: 6, y: 1, w: 3, h: 3 },
          config: { symbols: ["BTC", "ETH", "SOL", "xyz:TSLA", "xyz:NVDA"] },
        },
        {
          id: "feargreed-1",
          frame: "fear-greed",
          position: { x: 9, y: 1, w: 3, h: 3 },
          config: {},
        },
        {
          id: "mcap-treemap",
          frame: "market-cap-treemap",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: {},
        },
        {
          id: "tvl-treemap",
          frame: "tvl-treemap",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: {},
        },
        // ── Indices & volatility ──────────────────────────────────────────
        // The equity half this board was named for but never had: it showed
        // crypto, rates and short volume, and nothing that says what the market
        // itself did. All four cards read one FRED capability (`index-level`),
        // so the section costs one request per series, not per card.
        {
          id: "hd-indices",
          frame: "heading",
          position: { x: 0, y: 8, w: 12, h: 1 },
          config: {
            title: "Indices & Volatility",
            subtitle:
              "S&P 500, Nasdaq and the VIX — read off FRED's own published CSV, still no key",
          },
        },
        {
          id: "spx-chart",
          frame: "index-level-chart",
          title: "S&P 500",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: { series: "SP500", years: 10 },
        },
        {
          // Nasdaq, not the S&P: FRED licences SP500 with a ~10-year rolling
          // window, which cannot contain the drawdown worth showing.
          // NASDAQCOM runs to 1971, so the dot-com trough is actually in frame.
          id: "ndx-drawdown",
          frame: "index-drawdown",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: { series: "NASDAQCOM", years: 30 },
        },
        {
          id: "spx-years",
          frame: "index-annual-returns",
          position: { x: 0, y: 13, w: 6, h: 4 },
          config: { series: "SP500", years: 20 },
        },
        {
          id: "ndx-level",
          frame: "index-level",
          title: "Nasdaq Composite",
          position: { x: 6, y: 13, w: 3, h: 4 },
          config: { series: "NASDAQCOM", trendDays: 180 },
        },
        {
          id: "vix-1",
          frame: "vix-gauge",
          position: { x: 9, y: 13, w: 3, h: 4 },
          config: { max: 50 },
        },
        {
          id: "hd-macro",
          frame: "heading",
          position: { x: 0, y: 17, w: 12, h: 1 },
          config: {
            title: "Macro & Equities",
            subtitle: "Official data via /__zframes/proxy",
          },
        },
        {
          id: "yieldcurve-1",
          frame: "yield-curve",
          position: { x: 0, y: 18, w: 4, h: 3 },
          config: {},
        },
        {
          id: "finstress-1",
          frame: "financial-stress",
          position: { x: 4, y: 18, w: 4, h: 3 },
          config: {},
        },
        {
          id: "shortvol-1",
          frame: "short-volume",
          position: { x: 8, y: 18, w: 4, h: 4 },
          config: { symbols: ["TSLA", "NVDA", "AAPL", "AMD"] },
        },
      ],
      LOOK_TERMINAL,
      sceneBg("verdant"), // green light ≈ the terminal's phosphor accent (145)
    ),
  },
  {
    id: "crypto-desk",
    title: "Crypto Desk",
    description:
      "A crypto-first board — BTC/ETH charts, a majors watchlist, sentiment, and the market-cap + TVL landscape.",
    tags: ["crypto", "markets"],
    spec: spec(
      "Crypto Desk",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Crypto Desk",
            subtitle: "Majors, sentiment, and on-chain",
          },
        },
        {
          id: "btc",
          frame: "price-chart",
          title: "BTC",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: { symbol: "BTC" },
        },
        {
          id: "eth",
          frame: "price-chart",
          title: "ETH",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: { symbol: "ETH" },
        },
        {
          id: "watch",
          frame: "price-ticker",
          title: "Majors",
          position: { x: 0, y: 4, w: 4, h: 3 },
          config: { symbols: ["BTC", "ETH", "SOL", "AVAX", "LINK"] },
        },
        {
          id: "fg",
          frame: "fear-greed",
          position: { x: 4, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "mcap",
          frame: "market-cap-treemap",
          position: { x: 8, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "tvl",
          frame: "tvl-treemap",
          position: { x: 0, y: 7, w: 12, h: 4 },
          config: {},
        },
      ],
      LOOK_SYNTHWAVE,
      sceneBg("dusk"), // magenta-pink glow ≈ the synthwave accent (320)
    ),
  },
  {
    // The board for the newest keyless sources — FRED, Zillow and the FHFA.
    // Deliberately NOT folded into "Macro & Rates": that board is the rates
    // story, and this one answers a different question — what a house costs and
    // what the market charges to lend against it. Its centrepiece is Mortgage
    // Payment, the only frame in the catalogue that needs TWO providers to say
    // anything (Zillow's home value × FRED's live 30-year rate); the index
    // sources alone can only tell you prices rose, never whether a buyer can pay.
    //
    // Cost note: the ZHVI table is one uncompressed ~4.4 MB CSV, and the board's
    // three Zillow cards share a single download (the provider caches the parsed
    // TABLE under a constant key). It is paid only when a visitor scrolls this
    // board into the focus band — the embed iframe mounts lazily.
    id: "housing-credit",
    title: "Housing & Credit",
    description:
      "What a home costs, what it costs to borrow, and what the credit market charges for risk — Zillow, the FHFA and the Fed's own series, all keyless.",
    tags: ["housing", "credit", "macro"],
    spec: spec(
      "Housing & Credit",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Housing & Credit",
            subtitle: "Zillow, FHFA and FRED — no keys, no signup",
          },
        },
        // The level, in actual money rather than index points.
        {
          id: "zhvi-chart",
          frame: "home-value-chart",
          position: { x: 0, y: 1, w: 6, h: 4 },
          config: {
            regions: ["United States", "Austin, TX", "Miami, FL"],
            years: 25,
          },
        },
        // The rate that decides whether that level is affordable.
        {
          id: "mortgage-rate",
          frame: "mortgage-rate-chart",
          position: { x: 6, y: 1, w: 6, h: 4 },
          config: { years: 25 },
        },
        // ★ The cross-provider card: value × rate → the monthly payment.
        {
          id: "payment",
          frame: "mortgage-payment",
          position: { x: 0, y: 5, w: 4, h: 4 },
          config: { region: "Austin, TX", downPaymentPct: 20, termYears: 30 },
        },
        {
          id: "case-shiller",
          frame: "home-price-index",
          position: { x: 4, y: 5, w: 4, h: 4 },
          config: { years: 25 },
        },
        {
          id: "credit",
          frame: "credit-spread-chart",
          position: { x: 8, y: 5, w: 4, h: 4 },
          config: {},
        },
        // State level (~190 KB), not metro (~4 MB) — the divergence a single
        // national index averages away, at a download an embed can afford.
        {
          id: "fhfa-states",
          frame: "regional-home-prices",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: {
            level: "state",
            regions: ["CA", "TX", "FL", "NY", "WA"],
            years: 20,
          },
        },
        {
          id: "zhvi-metros",
          frame: "metro-home-values",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: {},
        },

        // ── Divergence ────────────────────────────────────────────────────
        // The rows above answer "what does it cost"; these answer "where is it
        // still moving", which a national index averages away entirely. Every
        // Zillow card here rides the SAME ~4.4 MB table the section above
        // already downloaded (the provider caches the parsed table under a
        // constant key), so the whole row is free in bandwidth terms.
        {
          id: "hd-divergence",
          frame: "heading",
          position: { x: 0, y: 13, w: 12, h: 1 },
          config: {
            title: "Divergence",
            subtitle:
              "Which markets are still appreciating, and what credit charges for quality",
          },
        },
        {
          id: "zhvi-momentum",
          frame: "home-value-momentum",
          position: { x: 0, y: 14, w: 4, h: 4 },
          config: {},
        },
        {
          id: "zhvi-bars",
          frame: "home-value-bars",
          position: { x: 4, y: 14, w: 4, h: 4 },
          config: {},
        },
        {
          id: "fhfa-bars",
          frame: "regional-home-price-bars",
          position: { x: 8, y: 14, w: 4, h: 4 },
          config: { level: "state" },
        },
        {
          // The quadrant view: expensive-and-cooling separates from
          // cheap-and-heating, which neither a ranked list nor a single chart
          // shows.
          id: "zhvi-quadrants",
          frame: "home-value-scatter",
          position: { x: 0, y: 18, w: 6, h: 4 },
          config: {},
        },
        {
          // The pair above plots both spreads; this isolates the GAP between
          // them, which strips out the level of rates and leaves only credit's
          // appetite for risk.
          id: "credit-gap",
          frame: "credit-quality-gap",
          position: { x: 6, y: 18, w: 6, h: 4 },
          config: { years: 3 },
        },
      ],
      LOOK_AURORA,
      sceneBg("aurora"), // the signature indigo ≈ the board's accent (242)
    ),
  },
  {
    id: "macro-rates",
    title: "Macro & Rates",
    description:
      "The official-data board — Treasury yield curve, OFR financial stress, FINRA short volume, and equity perps.",
    tags: ["macro", "equities"],
    spec: spec(
      "Macro & Rates",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Macro & Rates",
            subtitle: "Official US data via the same-origin proxy",
          },
        },
        {
          id: "yc",
          frame: "yield-curve",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "fs",
          frame: "financial-stress",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "sv",
          frame: "short-volume",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: { symbols: ["TSLA", "NVDA", "AAPL", "AMD", "MSFT"] },
        },
        {
          id: "eq",
          frame: "price-ticker",
          title: "Equity perps",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: { symbols: ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL", "xyz:AMD"] },
        },
      ],
      LOOK_EDITORIAL,
      sceneBg("ember"), // warm ember tones ≈ the editorial accent (22)
    ),
  },
  {
    id: "onchain-defi",
    title: "On-chain & DeFi",
    description:
      "The chain-level view — stablecoin supply, cross-chain activity, hot DEX pools, protocol fees, and the best live yields.",
    tags: ["defi", "on-chain"],
    spec: spec(
      "On-chain & DeFi",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "On-chain & DeFi",
            subtitle: "Stablecoins, chains, pools, and yields",
          },
        },
        {
          id: "stables",
          frame: "stablecoin-supply",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "chains",
          frame: "chain-activity",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "pools",
          frame: "dex-hot-pools",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: {},
        },
        {
          id: "fees",
          frame: "protocol-fees-treemap",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: {},
        },
        {
          id: "yields",
          frame: "yield-scanner",
          position: { x: 0, y: 8, w: 12, h: 3 },
          config: {},
        },
      ],
      LOOK_TIDE,
      sceneBg("tide"), // teal currents ≈ the on-chain accent (190)
    ),
  },
  {
    id: "derivatives-desk",
    title: "Derivatives Desk",
    description:
      "Funding, open interest, and the BTC options surface — put/call ratio, DVOL, and open interest by strike from Deribit.",
    tags: ["derivatives", "options"],
    spec: spec(
      "Derivatives Desk",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Derivatives Desk",
            subtitle: "Funding, open interest, and options",
          },
        },
        {
          id: "funding",
          frame: "funding-rate-chart",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: { symbols: ["BTC", "ETH"] },
        },
        {
          id: "oi",
          frame: "open-interest",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: { symbols: ["BTC", "ETH", "SOL", "xyz:TSLA"] },
        },
        {
          id: "pcr",
          frame: "options-put-call",
          position: { x: 0, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "iv",
          frame: "options-iv",
          position: { x: 4, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "strikes",
          frame: "options-oi-strike",
          position: { x: 8, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "carry",
          frame: "funding-comparison",
          position: { x: 0, y: 7, w: 12, h: 3 },
          config: {},
        },
      ],
      LOOK_NEBULA,
      sceneBg("nebula"), // violet nebula ≈ the derivatives accent (268)
    ),
  },
  {
    // Gold end to end, from one provider with an unusually long memory: the
    // LBMA publishes its daily London fix back to 1968, which is what makes the
    // seasonality, milestone and drawdown cards here possible at all — no other
    // source in the fleet reaches that far. Spot is a separate keyless quote, so
    // the top of the board is live while the history warms up behind it.
    //
    // Cost note: history is ~150 KB gzipped per metal on a 6h TTL and is NOT
    // persisted, and every card below shares one download per metal. The
    // Metals Board lists only the precious four — copper is quoted but has no
    // London fix, so its change column would sit permanently blank on a board
    // whose whole premise is the fix.
    id: "gold-desk",
    title: "Gold Desk",
    description:
      "Bullion end to end — live spot, the LBMA London fix back to 1968, CFTC positioning, and the vaults the US Treasury reports every month.",
    tags: ["metals", "gold", "macro"],
    spec: spec(
      "Gold Desk",
      [
        {
          id: "hd-spot",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Gold Desk",
            subtitle:
              "Live spot, and the London fix the physical market settles against",
          },
        },
        {
          id: "complex",
          frame: "metals-board",
          position: { x: 0, y: 1, w: 3, h: 4 },
          config: { symbols: ["XAU", "XAG", "XPT", "XPD"], showChange: true },
        },
        {
          id: "gold-chart",
          frame: "metal-price-chart",
          title: "Gold — London fix",
          position: { x: 3, y: 1, w: 6, h: 4 },
          config: {
            symbols: ["XAU"],
            currency: "USD",
            years: 20,
            logScale: false,
          },
        },
        {
          id: "gold-spot",
          frame: "metal-price",
          position: { x: 9, y: 1, w: 3, h: 2 },
          config: { symbol: "XAU", unit: "ounce", showFix: true },
        },
        {
          id: "gold-ath",
          frame: "metal-ath",
          position: { x: 9, y: 3, w: 3, h: 2 },
          config: { symbol: "XAU" },
        },
        {
          id: "gold-perf",
          frame: "metal-performance",
          position: { x: 0, y: 5, w: 4, h: 4 },
          config: { symbol: "XAU", mode: "cumulative" },
        },
        {
          // h:3, its meta's natural height — the chart frames either side take
          // h:4 because a fixed-height plot needs it, but this card is
          // content-driven and at h:4 it left ~310px of dead space.
          id: "gsr",
          frame: "gold-silver-ratio",
          position: { x: 4, y: 5, w: 4, h: 3 },
          config: { years: 20, showPercentile: true },
        },
        {
          id: "us-reserve",
          frame: "us-gold-reserve",
          position: { x: 8, y: 5, w: 4, h: 4 },
          config: { showMarketValue: true },
        },
        {
          id: "gold-underwater",
          frame: "metal-drawdown",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: { symbol: "XAU", years: 45 },
        },
        {
          id: "gold-years",
          frame: "metal-annual-returns",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: { symbol: "XAU", years: 25 },
        },

        // ── Positioning & vaults ──────────────────────────────────────────
        {
          id: "hd-positioning",
          frame: "heading",
          position: { x: 0, y: 13, w: 12, h: 1 },
          config: {
            title: "Positioning & Vaults",
            subtitle:
              "Who is long the paper, where the physical sits, and what the tokenized version costs",
          },
        },
        {
          id: "cot-net",
          frame: "metal-cot-net",
          position: { x: 0, y: 14, w: 5, h: 4 },
          config: { symbol: "XAU", years: 5, showOpenInterest: false },
        },
        {
          id: "cot-classes",
          frame: "metal-cot-breakdown",
          position: { x: 5, y: 14, w: 4, h: 4 },
          config: { symbol: "XAU" },
        },
        {
          id: "cot-gauge",
          frame: "metal-cot-gauge",
          position: { x: 9, y: 14, w: 3, h: 4 },
          config: { symbol: "XAU" },
        },
        {
          id: "vaults",
          frame: "us-gold-vaults",
          position: { x: 0, y: 18, w: 4, h: 4 },
          config: { mode: "treemap" },
        },
        {
          id: "paxg",
          frame: "tokenized-gold",
          position: { x: 4, y: 18, w: 4, h: 4 },
          config: { showPremium: true },
        },
        {
          id: "fixes",
          frame: "metal-fix-table",
          position: { x: 8, y: 18, w: 4, h: 4 },
          config: { symbol: "XAU", currency: "USD", rows: 12 },
        },

        // ── The long record ───────────────────────────────────────────────
        // The three cards only six decades of daily fixes can answer.
        {
          id: "hd-record",
          frame: "heading",
          position: { x: 0, y: 22, w: 12, h: 1 },
          config: {
            title: "The Long Record",
            subtitle: "Six decades of daily London fixes, LBMA's own files",
          },
        },
        {
          id: "seasonality",
          frame: "metal-seasonality",
          position: { x: 0, y: 23, w: 5, h: 4 },
          config: { symbol: "XAU", years: 25 },
        },
        {
          id: "btc-gold",
          frame: "btc-in-gold",
          position: { x: 5, y: 23, w: 4, h: 4 },
          config: { years: 12, logScale: true },
        },
        {
          id: "milestones",
          frame: "metal-milestones",
          position: { x: 9, y: 23, w: 3, h: 4 },
          config: { symbol: "XAU", newestFirst: true },
        },
      ],
      LOOK_BULLION,
      // Ember is the only warm scene of the six, so this board shares it with
      // Macro & Rates. They sit three apart in the stack and 21° apart in
      // accent, and LOOK_BULLION's harder surface carries the rest.
      sceneBg("ember"),
    ),
  },
  {
    // Foreign exchange, which is the one data family on the front door that
    // needs neither a key NOR the proxy: provider-fx resolves the ECB's daily
    // reference fixings through four keyless CORS-open upstreams in order, so
    // this board is also the honest demonstration that a zframes dashboard
    // keeps working when an upstream goes down.
    //
    // Every card reads the same fixing snapshot, so the crosses are internally
    // consistent by construction rather than by luck — which is exactly why the
    // note at the bottom spells out that these are fixings, not tradable
    // quotes. It is the single most common misreading of ECB rates.
    id: "fx-desk",
    title: "FX Desk",
    description:
      "The dollar and its counterparties — daily reference fixings, the full cross matrix, the day's movers, and DXY. Keyless, no proxy, four fallback sources deep.",
    tags: ["fx", "macro", "currencies"],
    spec: spec(
      "FX Desk",
      [
        {
          id: "hd-majors",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "FX Desk",
            subtitle:
              "ECB daily reference rates — no key, no proxy, four keyless sources deep",
          },
        },
        {
          id: "majors",
          frame: "fx-board",
          title: "Majors vs USD",
          position: { x: 0, y: 1, w: 4, h: 4 },
          config: {
            base: "USD",
            symbols: ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK"],
            showSparkline: true,
          },
        },
        {
          id: "majors-trend",
          frame: "fx-trend-chart",
          position: { x: 4, y: 1, w: 5, h: 4 },
          config: { base: "USD", symbols: ["EUR", "GBP", "JPY", "CHF"] },
        },
        {
          // h:3 for the same reason as the ratio card on Gold Desk: a headline
          // number plus a sparkline does not fill h:4, and the void reads as a
          // broken card rather than as air.
          id: "dxy-now",
          frame: "dxy",
          position: { x: 9, y: 1, w: 3, h: 3 },
          config: {},
        },
        {
          // Every cell is derived from the same day's fixing against a common
          // pivot, so the matrix cannot disagree with the board above it.
          id: "crosses",
          frame: "fx-cross-heatmap",
          position: { x: 0, y: 5, w: 6, h: 4 },
          config: { symbols: ["USD", "EUR", "GBP", "JPY", "CHF", "CAD"] },
        },
        {
          id: "dxy-history",
          frame: "dxy-chart",
          position: { x: 6, y: 5, w: 6, h: 4 },
          config: {},
        },

        // ── Beyond the majors ─────────────────────────────────────────────
        {
          id: "hd-wider",
          frame: "heading",
          position: { x: 0, y: 9, w: 12, h: 1 },
          config: {
            title: "Beyond the Majors",
            subtitle:
              "Asia, Latin America and the Nordics — same feed, same day's fixing",
          },
        },
        {
          id: "wider",
          frame: "fx-board",
          title: "Asia & LatAm vs USD",
          position: { x: 0, y: 10, w: 4, h: 4 },
          config: {
            base: "USD",
            symbols: ["THB", "SGD", "KRW", "INR", "CNY", "MXN", "BRL", "ZAR"],
            showSparkline: true,
          },
        },
        {
          id: "movers",
          frame: "fx-movers-bars",
          position: { x: 4, y: 10, w: 4, h: 4 },
          config: {
            base: "USD",
            symbols: [
              "EUR",
              "GBP",
              "JPY",
              "CHF",
              "CAD",
              "AUD",
              "NZD",
              "SEK",
              "NOK",
              "PLN",
            ],
          },
        },
        {
          // Base EUR, deliberately: the same currencies read differently from
          // the other side of the world's second reserve currency, and it shows
          // the board is not hard-wired to the dollar.
          id: "eur-trend",
          frame: "fx-trend-chart",
          title: "Trend vs EUR",
          position: { x: 8, y: 10, w: 4, h: 4 },
          config: { base: "EUR", symbols: ["USD", "GBP", "CHF", "SEK"] },
        },
        {
          id: "clock-tokyo",
          frame: "clock",
          position: { x: 0, y: 14, w: 3, h: 2 },
          config: { timezone: "Asia/Tokyo", label: "Tokyo", showSeconds: true },
        },
        {
          id: "clock-london",
          frame: "clock",
          position: { x: 3, y: 14, w: 3, h: 2 },
          config: {
            timezone: "Europe/London",
            label: "London",
            showSeconds: true,
          },
        },
        {
          id: "clock-ny",
          frame: "clock",
          position: { x: 6, y: 14, w: 3, h: 2 },
          config: {
            timezone: "America/New_York",
            label: "New York",
            showSeconds: true,
          },
        },
        {
          id: "clock-utc",
          frame: "clock",
          position: { x: 9, y: 14, w: 3, h: 2 },
          config: { timezone: "UTC", label: "UTC", showSeconds: true },
        },
        {
          id: "fixing-note",
          frame: "note",
          position: { x: 0, y: 16, w: 12, h: 3 },
          config: {
            text: "**These are reference fixings, not tradable quotes.** The ECB publishes one set of rates each working day around 16:00 CET, and every cross on this board is derived from that same snapshot — so a weekend or a holiday shows the last working day's fixing rather than a stale tick.\n\nzframes resolves them through four keyless sources in order — Frankfurter/ECB, FXRatesAPI, currency-api and the ECB Data Portal — so one upstream going down does not blank the board.",
            align: "left",
          },
        },
      ],
      LOOK_INTERBANK,
      // Tide, not Aurora: Aurora is cast as the out-of-the-box look on
      // Housing & Credit, and taking it here would undercut that. 212 against
      // Tide's authored 190 is a 22° rotate — still cool, still steel.
      sceneBg("tide"),
    ),
  },
];

export function curatedById(id: string): CuratedDashboard | undefined {
  return CURATED.find((d) => d.id === id);
}
