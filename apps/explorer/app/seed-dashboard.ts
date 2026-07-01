// Phase-1 seed dashboard for the live-preview page. Deliberately mixes:
//  • BROWSER-DIRECT crypto frames (Hyperliquid WS, CoinGecko, DefiLlama,
//    alternative.me) — these light up with no server, and
//  • PROXIED macro/equities frames (yield-curve → Treasury, financial-stress →
//    OFR, short-volume → FINRA) — these only render if the /__zframes/proxy
//    Route Handler is mounted, so they double as the proxy's acceptance test.
// Configs are minimal (required fields only); every other field falls to its
// schema default. Parsed through DashboardSpecSchema before rendering.
export const seedDashboard = {
  version: "1.0.0",
  title: "Phase 1 Preview",
  author: "zframes",
  grid: { mode: "flow-vertical", columns: 12, rowHeight: 96, gap: 12 },
  background: { type: "none" },
  theme: {
    accentHue: 242,
    accentSat: 90,
    baseHue: 233,
    baseSat: 20,
    upColor: "#3fd08f",
    downColor: "#ff6b81",
  },
  typography: { fontFamily: "sans", numericStyle: "tabular", scale: 1 },
  appearance: {
    radius: 18,
    borderStrength: 0.22,
    surfaceOpacity: 1,
    density: 1,
    elevation: 1,
  },
  frames: [
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
  ],
};
