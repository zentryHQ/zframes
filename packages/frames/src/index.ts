export { AssetLogo, assetLogoUrl, tickerOf } from "./asset-logo";
export { allocationFrame } from "./allocation";
export { bitcoinDominanceFrame } from "./bitcoin-dominance";
export { clockFrame } from "./clock";
export { dailyAnalysisFrame } from "./daily-analysis";
export { dinoGameFrame } from "./dino-game";
export { fearGreedFrame } from "./fear-greed";
export { filingsFeedFrame } from "./filings-feed";
export { fundamentalsFrame } from "./fundamentals";
export { fundingHeatmapFrame } from "./funding-heatmap";
export { fundingRateChartFrame } from "./funding-rate-chart";
export { headingFrame } from "./heading";
export { imageFrame } from "./image";
export { inflationPulseFrame } from "./inflation-pulse";
export { marketHoursFrame } from "./market-hours";
export { noteFrame } from "./note";
export { priceChartFrame } from "./price-chart";
export { priceCompareFrame } from "./price-compare";
export { priceLivelineFrame } from "./price-liveline";
export { priceTickerFrame } from "./price-ticker";
export { ratesBoardFrame } from "./rates-board";
export { shortVolumeFrame } from "./short-volume";
export { topMoversFrame } from "./top-movers";
export { tvlTreemapFrame } from "./tvl-treemap";
export { yieldCurveFrame } from "./yield-curve";

import type { AnyFrameDefinition } from "@zframes/core";
import { allocationFrame } from "./allocation";
import { bitcoinDominanceFrame } from "./bitcoin-dominance";
import { clockFrame } from "./clock";
import { dailyAnalysisFrame } from "./daily-analysis";
import { dinoGameFrame } from "./dino-game";
import { fearGreedFrame } from "./fear-greed";
import { filingsFeedFrame } from "./filings-feed";
import { fundamentalsFrame } from "./fundamentals";
import { fundingHeatmapFrame } from "./funding-heatmap";
import { fundingRateChartFrame } from "./funding-rate-chart";
import { headingFrame } from "./heading";
import { imageFrame } from "./image";
import { inflationPulseFrame } from "./inflation-pulse";
import { marketHoursFrame } from "./market-hours";
import { noteFrame } from "./note";
import { priceChartFrame } from "./price-chart";
import { priceCompareFrame } from "./price-compare";
import { priceLivelineFrame } from "./price-liveline";
import { priceTickerFrame } from "./price-ticker";
import { ratesBoardFrame } from "./rates-board";
import { shortVolumeFrame } from "./short-volume";
import { topMoversFrame } from "./top-movers";
import { tvlTreemapFrame } from "./tvl-treemap";
import { yieldCurveFrame } from "./yield-curve";

/** Every built-in frame — hosts can register all of them in one call. */
export const allFrames: AnyFrameDefinition[] = [
  allocationFrame,
  bitcoinDominanceFrame,
  clockFrame,
  dailyAnalysisFrame,
  dinoGameFrame,
  fearGreedFrame,
  filingsFeedFrame,
  fundamentalsFrame,
  fundingHeatmapFrame,
  fundingRateChartFrame,
  headingFrame,
  imageFrame,
  inflationPulseFrame,
  marketHoursFrame,
  noteFrame,
  priceChartFrame,
  priceCompareFrame,
  priceLivelineFrame,
  priceTickerFrame,
  ratesBoardFrame,
  shortVolumeFrame,
  topMoversFrame,
  tvlTreemapFrame,
  yieldCurveFrame,
];
