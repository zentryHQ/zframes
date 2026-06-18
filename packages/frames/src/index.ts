export { bitcoinDominanceFrame } from "./bitcoin-dominance";
export { dailyAnalysisFrame } from "./daily-analysis";
export { dinoGameFrame } from "./dino-game";
export { fearGreedFrame } from "./fear-greed";
export { fundingHeatmapFrame } from "./funding-heatmap";
export { fundingRateChartFrame } from "./funding-rate-chart";
export { headingFrame } from "./heading";
export { imageFrame } from "./image";
export { noteFrame } from "./note";
export { priceChartFrame } from "./price-chart";
export { priceTickerFrame } from "./price-ticker";
export { topMoversFrame } from "./top-movers";
export { tvlTreemapFrame } from "./tvl-treemap";

import type { AnyFrameDefinition } from "@zframes/core";
import { bitcoinDominanceFrame } from "./bitcoin-dominance";
import { dailyAnalysisFrame } from "./daily-analysis";
import { dinoGameFrame } from "./dino-game";
import { fearGreedFrame } from "./fear-greed";
import { fundingHeatmapFrame } from "./funding-heatmap";
import { fundingRateChartFrame } from "./funding-rate-chart";
import { headingFrame } from "./heading";
import { imageFrame } from "./image";
import { noteFrame } from "./note";
import { priceChartFrame } from "./price-chart";
import { priceTickerFrame } from "./price-ticker";
import { topMoversFrame } from "./top-movers";
import { tvlTreemapFrame } from "./tvl-treemap";

/** Every built-in frame — hosts can register all of them in one call. */
export const allFrames: AnyFrameDefinition[] = [
  bitcoinDominanceFrame,
  dailyAnalysisFrame,
  dinoGameFrame,
  fearGreedFrame,
  fundingHeatmapFrame,
  fundingRateChartFrame,
  headingFrame,
  imageFrame,
  noteFrame,
  priceChartFrame,
  priceTickerFrame,
  topMoversFrame,
  tvlTreemapFrame,
];
