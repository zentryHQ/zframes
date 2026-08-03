import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useCandles, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { priceEventsMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

// Candle interval per window, sized so each lookback lands around 100–200
// points: dense enough that a marker sits on a real move, cheap enough to poll.
const LOOKBACKS = {
  "7D": {
    ms: 7 * 24 * 60 * 60 * 1000,
    interval: "1h",
    timeframe: ChartTimeframe["7D"],
  },
  "1M": {
    ms: 30 * 24 * 60 * 60 * 1000,
    interval: "4h",
    timeframe: ChartTimeframe["1M"],
  },
  "3M": {
    ms: 90 * 24 * 60 * 60 * 1000,
    interval: "1d",
    timeframe: ChartTimeframe["3M"],
  },
  "1Y": {
    ms: 365 * 24 * 60 * 60 * 1000,
    interval: "1d",
    timeframe: ChartTimeframe["1Y"],
  },
} as const;

/** A history chart, not a live tape — poll slowly. */
const REFRESH_MS = 5 * 60_000;

const schema = priceEventsMeta.schema;

const LOOKBACK_OPTIONS = ["7D", "1M", "3M", "1Y"] as const;

function PriceEvents({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  const { ms, interval, timeframe } = LOOKBACKS[lookback];
  // Stable start time: recompute only when the window changes, so the polling
  // effect doesn't re-run every render.
  const startTimeMs = useMemo(() => Date.now() - ms, [ms]);
  const { candles, isLoading } = useCandles(
    config.symbol,
    interval,
    startTimeMs,
    REFRESH_MS,
    config.source,
  );

  const series: MultiSeriesData[] = useMemo(
    () => [
      {
        id: config.symbol,
        name: tickerOf(config.symbol),
        color: CHART_COLORS_MULTI_SERIES[0],
        data: candles.map((candle) => ({
          date: new Date(candle.time).toISOString(),
          value: candle.close,
        })),
      },
    ],
    [config.symbol, candles],
  );

  if (isLoading && candles.length === 0)
    return <FrameStatus loading>loading price history…</FrameStatus>;
  if (candles.length === 0) return <FrameStatus>no price data yet</FrameStatus>;

  // Event markers arrive from the board through TimeSeriesChart — nothing to
  // pass here; the card narrows or extends them via its spec fields.
  return (
    <TimeSeriesChart
      series={series}
      timeframe={timeframe}
      height={240}
      formatValue={money.price}
      control={
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="price & events history window"
        />
      }
    />
  );
}

/** Ticker instead of the generic frame label, like the other single-symbol cards. */
function PriceEventsTitle({ config }: { config: z.output<typeof schema> }) {
  return <>{tickerOf(config.symbol)}</>;
}

export const priceEventsFrame = defineFrame({
  ...priceEventsMeta,
  component: PriceEvents,
  titleIcon: ({ config }) => <AssetLogo symbol={config.symbol} size={14} />,
  titleContent: PriceEventsTitle,
});
