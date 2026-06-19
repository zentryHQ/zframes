import { defineFrame, useCandles, useMids } from "@zframes/core";
import { Liveline, type CandlePoint, type LivelinePoint } from "liveline";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { AssetLogo } from "./asset-logo";
import { formatPrice } from "./format";
import { priceChartMeta } from "./schemas";
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
const CANDLE_COUNT = 60;
const PRICE_CHART_PADDING = { top: 12, right: 56, bottom: 28, left: 12 };

const schema = priceChartMeta.schema;

function PriceChart({ config }: { config: z.output<typeof schema> }) {
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
  const mids = useMids([config.symbol]);
  const mid = mids[config.symbol];

  // Accumulate live ticks for the line layer / live dot.
  const [ticks, setTicks] = useState<LivelinePoint[]>([]);
  useEffect(() => {
    if (mid === undefined) return;
    setTicks((prev) => {
      const next = [...prev, { time: Date.now() / 1000, value: mid }];
      return next.length > 900 ? next.slice(-600) : next;
    });
  }, [mid]);
  // New symbol = new tape.
  useEffect(() => setTicks([]), [config.symbol]);

  const candlePoints: CandlePoint[] = useMemo(
    () =>
      candles.slice(0, -1).map((candle) => ({
        time: candle.time / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );

  // The snapshot's last candle is the forming one; keep it live off the
  // mid stream between candle polls.
  const last = candles[candles.length - 1];
  const liveCandle: CandlePoint | undefined = useMemo(() => {
    if (!last) return undefined;
    const close = mid ?? last.close;
    return {
      time: last.time / 1000,
      open: last.open,
      high: Math.max(last.high, close),
      low: Math.min(last.low, close),
      close,
    };
  }, [last, mid]);

  const value = mid ?? last?.close ?? 0;

  // liveline's default time format is HH:MM:SS — meaningless for hourly or
  // daily candles spanning days. Scale the format with the interval.
  const formatTime = useMemo(() => {
    if (intervalMs >= INTERVALS["1d"])
      return (t: number) =>
        new Date(t * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
    if (intervalMs >= INTERVALS["1h"])
      return (t: number) => {
        const d = new Date(t * 1000);
        return `${d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} ${String(d.getHours()).padStart(2, "0")}h`;
      };
    return (t: number) =>
      new Date(t * 1000).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
  }, [intervalMs]);
  // Candle closes seed the tape's history; live ticks extend it. Switching
  // wholesale to ticks would collapse the line to the last few seconds.
  const lineData: LivelinePoint[] = useMemo(() => {
    const seed = candles.map((candle) => ({
      time: candle.time / 1000,
      value: candle.close,
    }));
    if (ticks.length === 0) return seed;
    const firstTick = ticks[0].time;
    return [...seed.filter((point) => point.time < firstTick), ...ticks];
  }, [candles, ticks]);

  if (isLoading && candles.length === 0)
    return <FrameStatus loading>loading chart...</FrameStatus>;

  return (
    <div className="h-full min-h-0">
      <Liveline
        mode={config.mode}
        data={lineData}
        value={value}
        candles={candlePoints}
        candleWidth={intervalMs / 1000}
        liveCandle={liveCandle}
        window={(intervalMs / 1000) * CANDLE_COUNT}
        color={config.color}
        theme="dark"
        loading={isLoading}
        formatValue={(v) => formatPrice(v)}
        formatTime={formatTime}
        padding={PRICE_CHART_PADDING}
        showValue={true}
        // The reference look: a soft gradient area glowing under the line
        // (line mode) and a pulsing halo on the live value dot. `fill` is a
        // no-op in candle mode, so it's safe to leave on for both.
        fill={true}
        pulse={true}
      />
    </div>
  );
}

export const priceChartFrame = defineFrame({
  ...priceChartMeta,
  component: PriceChart,
  // The asset logo rides in the card title (this is a single-symbol frame), so
  // the chart body stays clean for liveline's own value/axis overlays.
  titleIcon: ({ config }) => <AssetLogo symbol={config.symbol} size={14} />,
});
