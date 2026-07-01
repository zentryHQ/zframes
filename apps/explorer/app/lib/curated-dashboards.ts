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

export type CuratedDashboard = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  spec: {
    version: string;
    title: string;
    author: string;
    background: { type: "none" };
    frames: Frame[];
  };
};

function spec(title: string, frames: Frame[]): CuratedDashboard["spec"] {
  return {
    version: "1.0.0",
    title,
    author: "zframes",
    background: { type: "none" },
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
    spec: spec("Stocks & Macro", [
      {
        id: "hd-markets",
        frame: "heading",
        position: { x: 0, y: 0, w: 12, h: 1 },
        config: { title: "Markets", subtitle: "Live crypto — browser-direct" },
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
    ]),
  },
  {
    id: "crypto-desk",
    title: "Crypto Desk",
    description:
      "A crypto-first board — BTC/ETH charts, a majors watchlist, sentiment, and the market-cap + TVL landscape.",
    tags: ["crypto", "markets"],
    spec: spec("Crypto Desk", [
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
    ]),
  },
  {
    id: "macro-rates",
    title: "Macro & Rates",
    description:
      "The official-data board — Treasury yield curve, OFR financial stress, FINRA short volume, and equity perps.",
    tags: ["macro", "equities"],
    spec: spec("Macro & Rates", [
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
    ]),
  },
];

export function curatedById(id: string): CuratedDashboard | undefined {
  return CURATED.find((d) => d.id === id);
}
