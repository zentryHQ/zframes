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
  group: { load: () => import("./group").then((m) => m.groupFrame) },
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
  "price-events": {
    load: () => import("./price-events").then((m) => m.priceEventsFrame),
    titleIcon: true,
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
  "return-calendar": {
    load: () => import("./return-calendar").then((m) => m.returnCalendarFrame),
  },
  "return-distribution": {
    load: () =>
      import("./return-distribution").then((m) => m.returnDistributionFrame),
  },
  "breadth-histogram": {
    load: () =>
      import("./breadth-histogram").then((m) => m.breadthHistogramFrame),
  },
  "funding-calendar": {
    load: () =>
      import("./funding-calendar").then((m) => m.fundingCalendarFrame),
  },
  "funding-distribution": {
    load: () =>
      import("./funding-distribution").then((m) => m.fundingDistributionFrame),
  },
  "sentiment-calendar": {
    load: () =>
      import("./sentiment-calendar").then((m) => m.sentimentCalendarFrame),
  },
  "yield-distribution": {
    load: () =>
      import("./yield-distribution").then((m) => m.yieldDistributionFrame),
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
  "options-chain-table": {
    load: () =>
      import("./options-chain-table").then((m) => m.optionsChainTableFrame),
  },
  "token-unlock-schedule": {
    load: () =>
      import("./token-unlock-schedule").then((m) => m.tokenUnlockScheduleFrame),
  },
  "crypto-profile": {
    load: () => import("./crypto-profile").then((m) => m.cryptoProfileFrame),
  },
  "crypto-dilution": {
    load: () => import("./crypto-dilution").then((m) => m.cryptoDilutionFrame),
  },
  "protocol-revenue": {
    load: () =>
      import("./protocol-revenue").then((m) => m.protocolRevenueFrame),
  },
  "protocol-multiples": {
    load: () =>
      import("./protocol-multiples").then((m) => m.protocolMultiplesFrame),
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
  "order-book-depth": {
    load: () => import("./order-book-depth").then((m) => m.orderBookDepthFrame),
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
  "oi-treemap": {
    load: () => import("./oi-treemap").then((m) => m.oiTreemapFrame),
  },
  "ohlcv-volume-bars": {
    load: () =>
      import("./ohlcv-volume-bars").then((m) => m.ohlcvVolumeBarsFrame),
  },
  "funding-spread-bars": {
    load: () =>
      import("./funding-spread-bars").then((m) => m.fundingSpreadBarsFrame),
  },
  "funding-venue-heatmap": {
    load: () =>
      import("./funding-venue-heatmap").then((m) => m.fundingVenueHeatmapFrame),
  },
  "funding-carry-area": {
    load: () =>
      import("./funding-carry-area").then((m) => m.fundingCarryAreaFrame),
  },
  "volume-share-donut": {
    load: () =>
      import("./volume-share-donut").then((m) => m.volumeShareDonutFrame),
  },
  "volume-movers-scatter": {
    load: () =>
      import("./volume-movers-scatter").then((m) => m.volumeMoversScatterFrame),
  },
  "funding-leaderboard-bars": {
    load: () =>
      import("./funding-leaderboard-bars").then(
        (m) => m.fundingLeaderboardBarsFrame,
      ),
  },
  "funding-crowding-scatter": {
    load: () =>
      import("./funding-crowding-scatter").then(
        (m) => m.fundingCrowdingScatterFrame,
      ),
  },
  "liquidity-basis-bars": {
    load: () =>
      import("./liquidity-basis-bars").then((m) => m.liquidityBasisBarsFrame),
  },
  "coin-momentum-heatmap": {
    load: () =>
      import("./coin-momentum-heatmap").then((m) => m.coinMomentumHeatmapFrame),
  },
  "coin-momentum-scatter": {
    load: () =>
      import("./coin-momentum-scatter").then((m) => m.coinMomentumScatterFrame),
  },
  "trending-bars": {
    load: () => import("./trending-bars").then((m) => m.trendingBarsFrame),
  },
  "nft-activity-bars": {
    load: () =>
      import("./nft-activity-bars").then((m) => m.nftActivityBarsFrame),
  },
  "dominance-bars": {
    load: () => import("./dominance-bars").then((m) => m.dominanceBarsFrame),
  },
  "trending-bubbles": {
    load: () =>
      import("./trending-bubbles").then((m) => m.trendingBubblesFrame),
  },
  "yield-risk-pie": {
    load: () => import("./yield-risk-pie").then((m) => m.yieldRiskPieFrame),
  },
  "dex-pool-liquidity-scatter": {
    load: () =>
      import("./dex-pool-liquidity-scatter").then(
        (m) => m.dexPoolLiquidityScatterFrame,
      ),
  },
  "protocol-fees-vs-tvl-scatter": {
    load: () =>
      import("./protocol-fees-vs-tvl-scatter").then(
        (m) => m.protocolFeesVsTvlScatterFrame,
      ),
  },
  "yield-composition-scatter": {
    load: () =>
      import("./yield-composition-scatter").then(
        (m) => m.yieldCompositionScatterFrame,
      ),
  },
  "protocol-tvl-by-category": {
    load: () =>
      import("./protocol-tvl-by-category").then(
        (m) => m.protocolTvlByCategoryFrame,
      ),
  },
  "protocol-tvl-share-area": {
    load: () =>
      import("./protocol-tvl-share-area").then(
        (m) => m.protocolTvlShareAreaFrame,
      ),
  },
  "dex-volume-share-area": {
    load: () =>
      import("./dex-volume-share-area").then((m) => m.dexVolumeShareAreaFrame),
  },
  "yield-momentum-bars": {
    load: () =>
      import("./yield-momentum-bars").then((m) => m.yieldMomentumBarsFrame),
  },
  "btc-difficulty-chart": {
    load: () =>
      import("./btc-difficulty-chart").then((m) => m.btcDifficultyChartFrame),
  },
  "btc-block-size-bars": {
    load: () =>
      import("./btc-block-size-bars").then((m) => m.btcBlockSizeBarsFrame),
  },
  "chain-price-movers": {
    load: () =>
      import("./chain-price-movers").then((m) => m.chainPriceMoversFrame),
  },
  "chain-activity-scatter": {
    load: () =>
      import("./chain-activity-scatter").then(
        (m) => m.chainActivityScatterFrame,
      ),
  },
  "mempool-fee-curve": {
    load: () =>
      import("./mempool-fee-curve").then((m) => m.mempoolFeeCurveFrame),
  },
  "mining-pools-share": {
    load: () =>
      import("./mining-pools-share").then((m) => m.miningPoolsShareFrame),
  },
  "options-max-pain": {
    load: () => import("./options-max-pain").then((m) => m.optionsMaxPainFrame),
  },
  "options-oi-skew": {
    load: () => import("./options-oi-skew").then((m) => m.optionsOiSkewFrame),
  },
  "options-vol-spread": {
    load: () =>
      import("./options-vol-spread").then((m) => m.optionsVolSpreadFrame),
  },
  "options-flow-skew": {
    load: () =>
      import("./options-flow-skew").then((m) => m.optionsFlowSkewFrame),
  },
  "options-vol-smile": {
    load: () =>
      import("./options-vol-smile").then((m) => m.optionsVolSmileFrame),
  },
  "options-oi-ladder-heatmap": {
    load: () =>
      import("./options-oi-ladder-heatmap").then(
        (m) => m.optionsOiLadderHeatmapFrame,
      ),
  },
  "options-max-pain-multi": {
    load: () =>
      import("./options-max-pain-multi").then(
        (m) => m.optionsMaxPainMultiFrame,
      ),
  },
  "mvrv-zscore-chart": {
    load: () =>
      import("./mvrv-zscore-chart").then((m) => m.mvrvZscoreChartFrame),
  },
  "nupl-cycle-chart": {
    load: () => import("./nupl-cycle-chart").then((m) => m.nuplCycleChartFrame),
  },
  "cycle-valuation-composite": {
    load: () =>
      import("./cycle-valuation-composite").then(
        (m) => m.cycleValuationCompositeFrame,
      ),
  },
  "onchain-oscillator-overlay": {
    load: () =>
      import("./onchain-oscillator-overlay").then(
        (m) => m.onchainOscillatorOverlayFrame,
      ),
  },
  "eth-issuance-impact": {
    load: () =>
      import("./eth-issuance-impact").then((m) => m.ethIssuanceImpactFrame),
  },
  "treasury-avg-rate-bars": {
    load: () =>
      import("./treasury-avg-rate-bars").then(
        (m) => m.treasuryAvgRateBarsFrame,
      ),
  },
  "treasury-auction-demand-scatter": {
    load: () =>
      import("./treasury-auction-demand-scatter").then(
        (m) => m.treasuryAuctionDemandScatterFrame,
      ),
  },
  "treasury-auction-size-bars": {
    load: () =>
      import("./treasury-auction-size-bars").then(
        (m) => m.treasuryAuctionSizeBarsFrame,
      ),
  },
  "nyfed-reference-rate-bars": {
    load: () =>
      import("./nyfed-reference-rate-bars").then(
        (m) => m.nyfedReferenceRateBarsFrame,
      ),
  },
  "nyfed-sofr-term-averages-bars": {
    load: () =>
      import("./nyfed-sofr-term-averages-bars").then(
        (m) => m.nyfedSofrTermAveragesBarsFrame,
      ),
  },
  "nyfed-fed-funds-band-gauge": {
    load: () =>
      import("./nyfed-fed-funds-band-gauge").then(
        (m) => m.nyfedFedFundsBandGaugeFrame,
      ),
  },
  "treasury-debt-composition-area": {
    load: () =>
      import("./treasury-debt-composition-area").then(
        (m) => m.treasuryDebtCompositionAreaFrame,
      ),
  },
  "ofr-stress-category-area": {
    load: () =>
      import("./ofr-stress-category-area").then(
        (m) => m.ofrStressCategoryAreaFrame,
      ),
  },
  "misery-index": {
    load: () => import("./misery-index").then((m) => m.miseryIndexFrame),
  },
  "real-wages": {
    load: () => import("./real-wages").then((m) => m.realWagesFrame),
  },
  "labor-force-flow": {
    load: () => import("./labor-force-flow").then((m) => m.laborForceFlowFrame),
  },
  "payrolls-bars": {
    load: () => import("./payrolls-bars").then((m) => m.payrollsBarsFrame),
  },
  "short-volume-bars": {
    load: () =>
      import("./short-volume-bars").then((m) => m.shortVolumeBarsFrame),
  },
  "capital-structure-bars": {
    load: () =>
      import("./capital-structure-bars").then(
        (m) => m.capitalStructureBarsFrame,
      ),
  },
  "filings-mix": {
    load: () => import("./filings-mix").then((m) => m.filingsMixFrame),
  },
  "fx-cross-heatmap": {
    load: () => import("./fx-cross-heatmap").then((m) => m.fxCrossHeatmapFrame),
  },
  "etf-issuer-treemap": {
    load: () =>
      import("./etf-issuer-treemap").then((m) => m.etfIssuerTreemapFrame),
  },
  "fx-trend-chart": {
    load: () => import("./fx-trend-chart").then((m) => m.fxTrendChartFrame),
  },
  "fear-greed-chart": {
    load: () => import("./fear-greed-chart").then((m) => m.fearGreedChartFrame),
  },
  "prediction-market-bars": {
    load: () =>
      import("./prediction-market-bars").then(
        (m) => m.predictionMarketBarsFrame,
      ),
  },
  "dxy-chart": {
    load: () => import("./dxy-chart").then((m) => m.dxyChartFrame),
  },
  "fx-movers-bars": {
    load: () => import("./fx-movers-bars").then((m) => m.fxMoversBarsFrame),
  },
  "prediction-market-scatter": {
    load: () =>
      import("./prediction-market-scatter").then(
        (m) => m.predictionMarketScatterFrame,
      ),
  },
  "etf-issuer-bars": {
    load: () => import("./etf-issuer-bars").then((m) => m.etfIssuerBarsFrame),
  },
  "portfolio-movers": {
    load: () =>
      import("./portfolio-movers").then((m) => m.portfolioMoversFrame),
  },
  "portfolio-value-bars": {
    load: () =>
      import("./portfolio-value-bars").then((m) => m.portfolioValueBarsFrame),
  },
  "etf-flow-calendar": {
    load: () =>
      import("./etf-flow-calendar").then((m) => m.etfFlowCalendarFrame),
  },
  "prediction-markets-bubble": {
    load: () =>
      import("./prediction-markets-bubble").then(
        (m) => m.predictionMarketsBubbleFrame,
      ),
  },
  "metals-board": {
    load: () => import("./metals-board").then((m) => m.metalsBoardFrame),
  },
  "metal-price": {
    load: () => import("./metal-price").then((m) => m.metalPriceFrame),
  },
  "metal-value": {
    load: () => import("./metal-value").then((m) => m.metalValueFrame),
  },
  "metal-price-chart": {
    load: () =>
      import("./metal-price-chart").then((m) => m.metalPriceChartFrame),
  },
  "metal-compare-chart": {
    load: () =>
      import("./metal-compare-chart").then((m) => m.metalCompareChartFrame),
  },
  "metal-fix-table": {
    load: () => import("./metal-fix-table").then((m) => m.metalFixTableFrame),
  },
  "metal-drawdown": {
    load: () => import("./metal-drawdown").then((m) => m.metalDrawdownFrame),
  },
  "metal-ath": {
    load: () => import("./metal-ath").then((m) => m.metalAthFrame),
  },
  "metal-milestones": {
    load: () =>
      import("./metal-milestones").then((m) => m.metalMilestonesFrame),
  },
  "metal-annual-returns": {
    load: () =>
      import("./metal-annual-returns").then((m) => m.metalAnnualReturnsFrame),
  },
  "metal-performance": {
    load: () =>
      import("./metal-performance").then((m) => m.metalPerformanceFrame),
  },
  "metal-return-distribution": {
    load: () =>
      import("./metal-return-distribution").then(
        (m) => m.metalReturnDistributionFrame,
      ),
  },
  "metal-seasonality": {
    load: () =>
      import("./metal-seasonality").then((m) => m.metalSeasonalityFrame),
  },
  "metals-correlation": {
    load: () =>
      import("./metals-correlation").then((m) => m.metalsCorrelationFrame),
  },
  "metal-volatility": {
    load: () =>
      import("./metal-volatility").then((m) => m.metalVolatilityFrame),
  },
  "gold-silver-ratio": {
    load: () =>
      import("./gold-silver-ratio").then((m) => m.goldSilverRatioFrame),
  },
  "metal-ratio-chart": {
    load: () =>
      import("./metal-ratio-chart").then((m) => m.metalRatioChartFrame),
  },
  "metal-ratio-percentile": {
    load: () =>
      import("./metal-ratio-percentile").then(
        (m) => m.metalRatioPercentileFrame,
      ),
  },
  "metal-rolling-correlation": {
    load: () =>
      import("./metal-rolling-correlation").then(
        (m) => m.metalRollingCorrelationFrame,
      ),
  },
  "btc-in-gold": {
    load: () => import("./btc-in-gold").then((m) => m.btcInGoldFrame),
  },
  "metal-cot-net": {
    load: () => import("./metal-cot-net").then((m) => m.metalCotNetFrame),
  },
  "metal-cot-breakdown": {
    load: () =>
      import("./metal-cot-breakdown").then((m) => m.metalCotBreakdownFrame),
  },
  "metal-cot-gauge": {
    load: () => import("./metal-cot-gauge").then((m) => m.metalCotGaugeFrame),
  },
  "metal-real-price": {
    load: () => import("./metal-real-price").then((m) => m.metalRealPriceFrame),
  },
  "metal-vs-macro": {
    load: () => import("./metal-vs-macro").then((m) => m.metalVsMacroFrame),
  },
  "commodity-vol-regime": {
    load: () =>
      import("./commodity-vol-regime").then((m) => m.commodityVolRegimeFrame),
  },
  "metal-cot-disaggregated": {
    load: () =>
      import("./metal-cot-disaggregated").then(
        (m) => m.metalCotDisaggregatedFrame,
      ),
  },
  "metal-cot-concentration": {
    load: () =>
      import("./metal-cot-concentration").then(
        (m) => m.metalCotConcentrationFrame,
      ),
  },
  "metal-open-interest": {
    load: () =>
      import("./metal-open-interest").then((m) => m.metalOpenInterestFrame),
  },
  "metal-cot-percentile": {
    load: () =>
      import("./metal-cot-percentile").then((m) => m.metalCotPercentileFrame),
  },
  "metal-spec-notional": {
    load: () =>
      import("./metal-spec-notional").then((m) => m.metalSpecNotionalFrame),
  },
  "metal-positioning-vs-price": {
    load: () =>
      import("./metal-positioning-vs-price").then(
        (m) => m.metalPositioningVsPriceFrame,
      ),
  },
  "us-gold-reserve": {
    load: () => import("./us-gold-reserve").then((m) => m.usGoldReserveFrame),
  },
  "us-gold-vaults": {
    load: () => import("./us-gold-vaults").then((m) => m.usGoldVaultsFrame),
  },
  "tokenized-gold": {
    load: () => import("./tokenized-gold").then((m) => m.tokenizedGoldFrame),
  },
  "index-level-chart": {
    load: () =>
      import("./index-level-chart").then((m) => m.indexLevelChartFrame),
  },
  "credit-spread-chart": {
    load: () =>
      import("./credit-spread-chart").then((m) => m.creditSpreadChartFrame),
  },
  "home-price-index": {
    load: () => import("./home-price-index").then((m) => m.homePriceIndexFrame),
  },
  "mortgage-rate-chart": {
    load: () =>
      import("./mortgage-rate-chart").then((m) => m.mortgageRateChartFrame),
  },
  "regional-home-prices": {
    load: () =>
      import("./regional-home-prices").then((m) => m.regionalHomePricesFrame),
  },
  "metro-home-values": {
    load: () =>
      import("./metro-home-values").then((m) => m.metroHomeValuesFrame),
  },
  "home-value-chart": {
    load: () => import("./home-value-chart").then((m) => m.homeValueChartFrame),
  },
  "index-level": {
    load: () => import("./index-level").then((m) => m.indexLevelFrame),
  },
  "index-drawdown": {
    load: () => import("./index-drawdown").then((m) => m.indexDrawdownFrame),
  },
  "index-annual-returns": {
    load: () =>
      import("./index-annual-returns").then((m) => m.indexAnnualReturnsFrame),
  },
  "vix-gauge": {
    load: () => import("./vix-gauge").then((m) => m.vixGaugeFrame),
  },
  "credit-quality-gap": {
    load: () =>
      import("./credit-quality-gap").then((m) => m.creditQualityGapFrame),
  },
  "mortgage-payment": {
    load: () =>
      import("./mortgage-payment").then((m) => m.mortgagePaymentFrame),
  },
  "home-value-bars": {
    load: () => import("./home-value-bars").then((m) => m.homeValueBarsFrame),
  },
  "home-value-momentum": {
    load: () =>
      import("./home-value-momentum").then((m) => m.homeValueMomentumFrame),
  },
  "home-value-scatter": {
    load: () =>
      import("./home-value-scatter").then((m) => m.homeValueScatterFrame),
  },
  "regional-home-price-bars": {
    load: () =>
      import("./regional-home-price-bars").then(
        (m) => m.regionalHomePriceBarsFrame,
      ),
  },
  "company-profile": {
    load: () => import("./company-profile").then((m) => m.companyProfileFrame),
  },
  "valuation-multiples": {
    load: () =>
      import("./valuation-multiples").then((m) => m.valuationMultiplesFrame),
  },
  "financials-trend": {
    load: () =>
      import("./financials-trend").then((m) => m.financialsTrendFrame),
  },
  "margin-trend": {
    load: () => import("./margin-trend").then((m) => m.marginTrendFrame),
  },
  "cashflow-trend": {
    load: () => import("./cashflow-trend").then((m) => m.cashflowTrendFrame),
  },
  "earnings-surprise": {
    load: () =>
      import("./earnings-surprise").then((m) => m.earningsSurpriseFrame),
  },
  "earnings-countdown": {
    load: () =>
      import("./earnings-countdown").then((m) => m.earningsCountdownFrame),
  },
  "earnings-calendar": {
    load: () =>
      import("./earnings-calendar").then((m) => m.earningsCalendarFrame),
  },
  "analyst-ratings": {
    load: () => import("./analyst-ratings").then((m) => m.analystRatingsFrame),
  },
  "institutional-ownership": {
    load: () =>
      import("./institutional-ownership").then(
        (m) => m.institutionalOwnershipFrame,
      ),
  },
  "equity-options-oi": {
    load: () =>
      import("./equity-options-oi").then((m) => m.equityOptionsOiFrame),
  },
  "equity-options-smile": {
    load: () =>
      import("./equity-options-smile").then((m) => m.equityOptionsSmileFrame),
  },
  "equity-options-max-pain": {
    load: () =>
      import("./equity-options-max-pain").then(
        (m) => m.equityOptionsMaxPainFrame,
      ),
  },
  "equity-options-greeks": {
    load: () =>
      import("./equity-options-greeks").then((m) => m.equityOptionsGreeksFrame),
  },
};
