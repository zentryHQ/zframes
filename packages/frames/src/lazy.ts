import type { AnyFrameDefinition } from "@zframes/core";

/**
 * Per-frame lazy loaders — the code-split source of truth for the runtime.
 *
 * Each value dynamically imports exactly one frame module, so the bundler
 * emits one chunk per frame instead of folding all of them into the entry
 * bundle (as the eager `allFrames` array in ./index does). The runtime builds
 * its registry from these + the React-free `frameMetas`, so a dashboard only
 * downloads the component code for the frames actually placed on it.
 *
 * This module must contain ONLY dynamic imports of frame modules — a single
 * static `import` of any frame here would pull it back into the entry chunk
 * and defeat the split. Keyed by frame name (== module basename == meta.name).
 *
 * `titleIcon: true` / `titleContent: true` mark the frames whose module also
 * exports a title-icon / dynamic-title component, so the registry can reserve
 * those title slots without loading the chunk first.
 */
export interface FrameLoader {
  load: () => Promise<AnyFrameDefinition>;
  /** The frame renders a leading title-icon (lives in the same lazy module). */
  titleIcon?: boolean;
  /** The frame renders a dynamic title (lives in the same lazy module). */
  titleContent?: boolean;
}

export const frameLoaders: Record<string, FrameLoader> = {
  "portfolio-value": {
    load: () => import("./portfolio-value").then((m) => m.portfolioValueFrame),
  },
  "portfolio-allocation": {
    load: () =>
      import("./portfolio-allocation").then((m) => m.portfolioAllocationFrame),
  },
  "portfolio-holdings": {
    load: () =>
      import("./portfolio-holdings").then((m) => m.portfolioHoldingsFrame),
  },
  "bitcoin-dominance": {
    load: () =>
      import("./bitcoin-dominance").then((m) => m.bitcoinDominanceFrame),
  },
  clock: { load: () => import("./clock").then((m) => m.clockFrame) },
  "custom-data": {
    load: () => import("./custom-data").then((m) => m.customDataFrame),
  },
  "daily-analysis": {
    load: () => import("./daily-analysis").then((m) => m.dailyAnalysisFrame),
  },
  "journal-log": {
    load: () => import("./journal-log").then((m) => m.journalLogFrame),
  },
  "journal-open": {
    load: () => import("./journal-open").then((m) => m.journalOpenFrame),
  },
  "journal-results": {
    load: () => import("./journal-results").then((m) => m.journalResultsFrame),
  },
  "journal-score": {
    load: () => import("./journal-score").then((m) => m.journalScoreFrame),
  },
  "dino-game": {
    load: () => import("./dino-game").then((m) => m.dinoGameFrame),
  },
  "fear-greed": {
    load: () => import("./fear-greed").then((m) => m.fearGreedFrame),
  },
  "filings-feed": {
    load: () => import("./filings-feed").then((m) => m.filingsFeedFrame),
  },
  fundamentals: {
    load: () => import("./fundamentals").then((m) => m.fundamentalsFrame),
  },
  "financial-stress": {
    load: () =>
      import("./financial-stress").then((m) => m.financialStressFrame),
  },
  "labor-market": {
    load: () => import("./labor-market").then((m) => m.laborMarketFrame),
  },
  "national-debt": {
    load: () => import("./national-debt").then((m) => m.nationalDebtFrame),
  },
  "treasury-auctions": {
    load: () =>
      import("./treasury-auctions").then((m) => m.treasuryAuctionsFrame),
  },
  "funding-heatmap": {
    load: () => import("./funding-heatmap").then((m) => m.fundingHeatmapFrame),
  },
  "funding-rate-chart": {
    load: () =>
      import("./funding-rate-chart").then((m) => m.fundingRateChartFrame),
  },
  heading: { load: () => import("./heading").then((m) => m.headingFrame) },
  "hero-number": {
    load: () => import("./hero-number").then((m) => m.heroNumberFrame),
  },
  image: { load: () => import("./image").then((m) => m.imageFrame) },
  "image-gallery": {
    load: () => import("./image-gallery").then((m) => m.imageGalleryFrame),
  },
  "inflation-pulse": {
    load: () => import("./inflation-pulse").then((m) => m.inflationPulseFrame),
  },
  "market-hours": {
    load: () => import("./market-hours").then((m) => m.marketHoursFrame),
    titleIcon: true,
  },
  "news-feed": {
    load: () => import("./news-feed").then((m) => m.newsFeedFrame),
  },
  note: { load: () => import("./note").then((m) => m.noteFrame) },
  "price-chart": {
    load: () => import("./price-chart").then((m) => m.priceChartFrame),
    titleIcon: true,
    titleContent: true,
  },
  "price-compare": {
    load: () => import("./price-compare").then((m) => m.priceCompareFrame),
    titleContent: true,
  },
  "price-liveline": {
    load: () => import("./price-liveline").then((m) => m.priceLivelineFrame),
  },
  "price-ticker": {
    load: () => import("./price-ticker").then((m) => m.priceTickerFrame),
  },
  "rates-board": {
    load: () => import("./rates-board").then((m) => m.ratesBoardFrame),
  },
  "fx-board": { load: () => import("./fx-board").then((m) => m.fxBoardFrame) },
  "short-volume": {
    load: () => import("./short-volume").then((m) => m.shortVolumeFrame),
  },
  "top-movers": {
    load: () => import("./top-movers").then((m) => m.topMoversFrame),
  },
  "tvl-treemap": {
    load: () => import("./tvl-treemap").then((m) => m.tvlTreemapFrame),
  },
  "yield-curve": {
    load: () => import("./yield-curve").then((m) => m.yieldCurveFrame),
  },
  "dex-volume-treemap": {
    load: () =>
      import("./dex-volume-treemap").then((m) => m.dexVolumeTreemapFrame),
  },
  "dex-volume-chart": {
    load: () => import("./dex-volume-chart").then((m) => m.dexVolumeChartFrame),
  },
  "protocol-tvl-treemap": {
    load: () =>
      import("./protocol-tvl-treemap").then((m) => m.protocolTvlTreemapFrame),
  },
  "protocol-tvl-chart": {
    load: () =>
      import("./protocol-tvl-chart").then((m) => m.protocolTvlChartFrame),
  },
  "protocol-fees-treemap": {
    load: () =>
      import("./protocol-fees-treemap").then((m) => m.protocolFeesTreemapFrame),
  },
  "market-cap-treemap": {
    load: () =>
      import("./market-cap-treemap").then((m) => m.marketCapTreemapFrame),
  },
  "open-interest": {
    load: () => import("./open-interest").then((m) => m.openInterestFrame),
  },
  snake: { load: () => import("./snake").then((m) => m.snakeFrame) },
  "flappy-bird": {
    load: () => import("./flappy-bird").then((m) => m.flappyBirdFrame),
  },
  video: { load: () => import("./video").then((m) => m.videoFrame) },
  drawdy: { load: () => import("./drawdy").then((m) => m.drawdyFrame) },
  countdown: {
    load: () => import("./countdown").then((m) => m.countdownFrame),
  },
  "link-grid": {
    load: () => import("./link-grid").then((m) => m.linkGridFrame),
  },
  calculator: {
    load: () => import("./calculator").then((m) => m.calculatorFrame),
  },
  quote: { load: () => import("./quote").then((m) => m.quoteFrame) },
  divider: { load: () => import("./divider").then((m) => m.dividerFrame) },
  marquee: { load: () => import("./marquee").then((m) => m.marqueeFrame) },
  dice: { load: () => import("./dice").then((m) => m.diceFrame) },
  "risk-reward": {
    load: () => import("./risk-reward").then((m) => m.riskRewardFrame),
  },
  stopwatch: {
    load: () => import("./stopwatch").then((m) => m.stopwatchFrame),
  },
  "session-progress": {
    load: () =>
      import("./session-progress").then((m) => m.sessionProgressFrame),
  },
  "btc-fees": { load: () => import("./btc-fees").then((m) => m.btcFeesFrame) },
  "btc-mempool": {
    load: () => import("./btc-mempool").then((m) => m.btcMempoolFrame),
  },
  "btc-blocks": {
    load: () => import("./btc-blocks").then((m) => m.btcBlocksFrame),
  },
  "btc-hashrate": {
    load: () => import("./btc-hashrate").then((m) => m.btcHashrateFrame),
  },
  "btc-difficulty": {
    load: () => import("./btc-difficulty").then((m) => m.btcDifficultyFrame),
  },
  "mining-pools": {
    load: () => import("./mining-pools").then((m) => m.miningPoolsFrame),
  },
  "lightning-stats": {
    load: () => import("./lightning-stats").then((m) => m.lightningStatsFrame),
  },
  "options-put-call": {
    load: () => import("./options-put-call").then((m) => m.optionsPutCallFrame),
  },
  "options-iv": {
    load: () => import("./options-iv").then((m) => m.optionsIvFrame),
  },
  "options-oi-strike": {
    load: () =>
      import("./options-oi-strike").then((m) => m.optionsOiStrikeFrame),
  },
  "coin-movers": {
    load: () => import("./coin-movers").then((m) => m.coinMoversFrame),
  },
  mvrv: {
    load: () => import("./mvrv").then((m) => m.mvrvFrame),
  },
  nupl: {
    load: () => import("./nupl").then((m) => m.nuplFrame),
  },
  sopr: {
    load: () => import("./sopr").then((m) => m.soprFrame),
  },
  "puell-multiple": {
    load: () => import("./puell-multiple").then((m) => m.puellMultipleFrame),
  },
  "mayer-multiple": {
    load: () => import("./mayer-multiple").then((m) => m.mayerMultipleFrame),
  },
  "pi-cycle": {
    load: () => import("./pi-cycle").then((m) => m.piCycleFrame),
  },
  "ma-multiplier": {
    load: () => import("./ma-multiplier").then((m) => m.maMultiplierFrame),
  },
  "rsi-momentum": {
    load: () => import("./rsi-momentum").then((m) => m.rsiMomentumFrame),
  },
  "volume-profile": {
    load: () => import("./volume-profile").then((m) => m.volumeProfileFrame),
  },
  dxy: {
    load: () => import("./dxy").then((m) => m.dxyFrame),
  },
  "cycle-signals": {
    load: () => import("./cycle-signals").then((m) => m.cycleSignalsFrame),
  },
  "stablecoin-supply": {
    load: () =>
      import("./stablecoin-supply").then((m) => m.stablecoinSupplyFrame),
  },
  "yield-scanner": {
    load: () => import("./yield-scanner").then((m) => m.yieldScannerFrame),
  },
  "defi-revenue": {
    load: () => import("./defi-revenue").then((m) => m.defiRevenueFrame),
  },
  "funding-comparison": {
    load: () =>
      import("./funding-comparison").then((m) => m.fundingComparisonFrame),
  },
  "eth-supply": {
    load: () => import("./eth-supply").then((m) => m.ethSupplyFrame),
  },
  "eth-staking": {
    load: () => import("./eth-staking").then((m) => m.ethStakingFrame),
  },
  "prediction-markets": {
    load: () =>
      import("./prediction-markets").then((m) => m.predictionMarketsFrame),
  },
  "etf-flows": {
    load: () => import("./etf-flows").then((m) => m.etfFlowsFrame),
  },
  "trending-coins": {
    load: () => import("./trending-coins").then((m) => m.trendingCoinsFrame),
  },
  "sector-performance": {
    load: () =>
      import("./sector-performance").then((m) => m.sectorPerformanceFrame),
  },
  "macro-calendar": {
    load: () => import("./macro-calendar").then((m) => m.macroCalendarFrame),
  },
  "stablecoin-chains": {
    load: () =>
      import("./stablecoin-chains").then((m) => m.stablecoinChainsFrame),
  },
  "sector-treemap": {
    load: () => import("./sector-treemap").then((m) => m.sectorTreemapFrame),
  },
  "etf-flows-chart": {
    load: () => import("./etf-flows-chart").then((m) => m.etfFlowsChartFrame),
  },
  "realized-price": {
    load: () => import("./realized-price").then((m) => m.realizedPriceFrame),
  },
  "reserve-risk": {
    load: () => import("./reserve-risk").then((m) => m.reserveRiskFrame),
  },
  "holiday-calendar": {
    load: () =>
      import("./holiday-calendar").then((m) => m.holidayCalendarFrame),
  },
  "day-meter": {
    load: () => import("./day-meter").then((m) => m.dayMeterFrame),
  },
  "returns-projector": {
    load: () =>
      import("./returns-projector").then((m) => m.returnsProjectorFrame),
  },
  breakeven: {
    load: () => import("./breakeven").then((m) => m.breakevenFrame),
  },
  checklist: {
    load: () => import("./checklist").then((m) => m.checklistFrame),
  },
  pomodoro: { load: () => import("./pomodoro").then((m) => m.pomodoroFrame) },
  "rules-card": {
    load: () => import("./rules-card").then((m) => m.rulesCardFrame),
  },
  breathing: {
    load: () => import("./breathing").then((m) => m.breathingFrame),
  },
  "spotify-embed": {
    load: () => import("./spotify-embed").then((m) => m.spotifyEmbedFrame),
  },
  "nft-collections": {
    load: () => import("./nft-collections").then((m) => m.nftCollectionsFrame),
  },
  "dex-hot-pools": {
    load: () => import("./dex-hot-pools").then((m) => m.dexHotPoolsFrame),
  },
  "chain-activity": {
    load: () => import("./chain-activity").then((m) => m.chainActivityFrame),
  },
  "nft-treemap": {
    load: () => import("./nft-treemap").then((m) => m.nftTreemapFrame),
  },
  "dex-pool-treemap": {
    load: () => import("./dex-pool-treemap").then((m) => m.dexPoolTreemapFrame),
  },
  "sector-bars": {
    load: () => import("./sector-bars").then((m) => m.sectorBarsFrame),
  },
  "funding-bars": {
    load: () => import("./funding-bars").then((m) => m.fundingBarsFrame),
  },
  "etf-flow-bars": {
    load: () => import("./etf-flow-bars").then((m) => m.etfFlowBarsFrame),
  },
  "chain-activity-bars": {
    load: () =>
      import("./chain-activity-bars").then((m) => m.chainActivityBarsFrame),
  },
  "market-scatter": {
    load: () => import("./market-scatter").then((m) => m.marketScatterFrame),
  },
  "market-bubbles": {
    load: () => import("./market-bubbles").then((m) => m.marketBubblesFrame),
  },
  "tvl-bubbles": {
    load: () => import("./tvl-bubbles").then((m) => m.tvlBubblesFrame),
  },
  "protocol-tvl-bubbles": {
    load: () =>
      import("./protocol-tvl-bubbles").then((m) => m.protocolTvlBubblesFrame),
  },
  "dex-volume-bubbles": {
    load: () =>
      import("./dex-volume-bubbles").then((m) => m.dexVolumeBubblesFrame),
  },
  "protocol-fees-bubbles": {
    load: () =>
      import("./protocol-fees-bubbles").then((m) => m.protocolFeesBubblesFrame),
  },
  "sector-bubbles": {
    load: () => import("./sector-bubbles").then((m) => m.sectorBubblesFrame),
  },
  "nft-bubbles": {
    load: () => import("./nft-bubbles").then((m) => m.nftBubblesFrame),
  },
  "dex-pool-bubbles": {
    load: () => import("./dex-pool-bubbles").then((m) => m.dexPoolBubblesFrame),
  },
  "movers-bubbles": {
    load: () => import("./movers-bubbles").then((m) => m.moversBubblesFrame),
  },
  "sentiment-gauge": {
    load: () => import("./sentiment-gauge").then((m) => m.sentimentGaugeFrame),
  },
  "movers-bars": {
    load: () => import("./movers-bars").then((m) => m.moversBarsFrame),
  },
  "tvl-bars": {
    load: () => import("./tvl-bars").then((m) => m.tvlBarsFrame),
  },
  "yield-scatter": {
    load: () => import("./yield-scatter").then((m) => m.yieldScatterFrame),
  },
  "nft-scatter": {
    load: () => import("./nft-scatter").then((m) => m.nftScatterFrame),
  },
  "dominance-gauge": {
    load: () => import("./dominance-gauge").then((m) => m.dominanceGaugeFrame),
  },
  "put-call-gauge": {
    load: () => import("./put-call-gauge").then((m) => m.putCallGaugeFrame),
  },
};
