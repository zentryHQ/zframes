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
      "Crypto majors alongside official US macro — the same mix used to prove the proxy end-to-end.",
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
        {
          id: "hd-macro",
          frame: "heading",
          position: { x: 0, y: 8, w: 12, h: 1 },
          config: {
            title: "Macro & Equities",
            subtitle: "Official data via /__zframes/proxy",
          },
        },
        {
          id: "yieldcurve-1",
          frame: "yield-curve",
          position: { x: 0, y: 9, w: 4, h: 3 },
          config: {},
        },
        {
          id: "finstress-1",
          frame: "financial-stress",
          position: { x: 4, y: 9, w: 4, h: 3 },
          config: {},
        },
        {
          id: "shortvol-1",
          frame: "short-volume",
          position: { x: 8, y: 9, w: 4, h: 4 },
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
];

export function curatedById(id: string): CuratedDashboard | undefined {
  return CURATED.find((d) => d.id === id);
}
