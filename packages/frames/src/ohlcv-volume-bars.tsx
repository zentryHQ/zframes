import { BarChart } from "@zframes/charts";
import { defineFrame, useCandles } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { DOWN_COLOR, UP_COLOR, formatCompact } from "./format";
import { ohlcvVolumeBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const INTERVALS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
} as const;

/** How many historical candles to load and roughly keep visible. */
const CANDLE_COUNT = 48;

const schema = ohlcvVolumeBarsMeta.schema;

/** Per-bar time label, scaled with the candle interval (mirrors price-chart's formatTime). */
function barTimeLabel(time: number, intervalMs: number): string {
  const d = new Date(time);
  if (intervalMs >= INTERVALS["1d"])
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (intervalMs >= INTERVALS["1h"])
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}h`;
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OhlcvVolumeBars({ config }: { config: z.output<typeof schema> }) {
  const intervalMs = INTERVALS[config.interval];
  const startTimeMs = useMemo(
    () => Date.now() - intervalMs * CANDLE_COUNT,
    [intervalMs],
  );
  const { candles, isLoading } = useCandles(
    config.symbol,
    config.interval,
    startTimeMs,
    Math.min(intervalMs, 60_000),
  );

  const data = useMemo(
    () =>
      candles.map((c) => ({
        label: barTimeLabel(c.time, intervalMs),
        value: c.volume ?? 0,
        color: c.close >= c.open ? UP_COLOR : DOWN_COLOR,
      })),
    [candles, intervalMs],
  );

  if (isLoading && candles.length === 0)
    return <FrameStatus loading>loading volume…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no candle data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        height={200}
        formatValue={formatCompact}
        showValues={false}
        maxTickLabels={6}
      />
      <div className="caption text-soft text-center">
        {tickerOf(config.symbol)} volume · {config.interval} candles
      </div>
    </div>
  );
}

export const ohlcvVolumeBarsFrame = defineFrame({
  ...ohlcvVolumeBarsMeta,
  component: OhlcvVolumeBars,
});
