import { defineFrame, useCandles, useDailyCloseHistory } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { MetricGauge, ZONE_NEUTRAL, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { rsi, tail, windowDays } from "./indicators";
import { rsiMomentumMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = rsiMomentumMeta.schema;

const WINDOW_OPTIONS = ["90D", "180D", "1Y", "2Y"] as const;

const DAY_MS = 24 * 60 * 60_000;
/**
 * Candles to request on the symbol path: the widest selectable window (2Y)
 * plus room for the RSI warm-up, so moving the toggle never re-fetches.
 */
const CANDLE_HISTORY_DAYS = 365 * 2 + 120;

/**
 * Quantised to the start of a UTC day rather than `Date.now() - window`. The
 * start time is part of the provider's cache key, so a drifting value mints a
 * fresh entry on every mount and the cache never hits — the failure mode that
 * grew localStorage until writes started throwing and persistence stopped with
 * no symptom. One key per day is the point.
 */
function candleStartMs(): number {
  return (
    Math.floor((Date.now() - CANDLE_HISTORY_DAYS * DAY_MS) / DAY_MS) * DAY_MS
  );
}

function RsiMomentum({ config }: { config: z.output<typeof schema> }) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);

  // Two sources, one indicator: BTC's deep published series, or any symbol's
  // daily candles. Hooks can't be called conditionally, so both run every
  // render and the unused one is switched off at its own call site — the BTC
  // hook takes `enabled`, and `useCandles` already skips an empty symbol.
  // Without that gating a stock card would quietly download years of BTC
  // closes it never draws.
  const symbol = config.symbol?.trim() ?? "";
  const usingSymbol = symbol.length > 0;

  const { history: btcHistory, isLoading: btcLoading } = useDailyCloseHistory(
    "btc",
    undefined,
    !usingSymbol,
  );
  const startMs = useMemo(candleStartMs, []);
  const { candles, isLoading: candlesLoading } = useCandles(
    usingSymbol ? symbol : "",
    "1d",
    startMs,
    undefined,
    config.source,
  );

  const closes = useMemo<SeriesPoint[]>(
    () =>
      usingSymbol
        ? candles.map((c) => ({ time: c.time, value: c.close }))
        : btcHistory,
    [usingSymbol, candles, btcHistory],
  );

  const series = useMemo<SeriesPoint[]>(() => {
    const values = rsi(
      closes.map((p) => p.value),
      config.period,
    );
    const out: SeriesPoint[] = [];
    for (let i = 0; i < closes.length; i++) {
      const v = values[i];
      if (v !== null) out.push({ time: closes[i].time, value: v });
    }
    return out;
  }, [closes, config.period]);

  const isLoading = usingSymbol ? candlesLoading : btcLoading;
  const label = usingSymbol ? tickerOf(symbol) : "BTC";

  if (isLoading) return <FrameStatus loading>loading RSI…</FrameStatus>;
  if (series.length === 0)
    return (
      <FrameStatus>not enough daily history for “{label}” yet</FrameStatus>
    );

  const latest = series[series.length - 1].value;
  const zone = zoneOf(
    latest,
    [
      { upTo: 30, zone: { label: "Oversold", color: UP_COLOR } },
      { upTo: 45, zone: { label: "Risk-off", color: DOWN_COLOR } },
      { upTo: 55, zone: { label: "Neutral", color: ZONE_NEUTRAL } },
      { upTo: 80, zone: { label: "Risk-on", color: UP_COLOR } },
    ],
    { label: "Overbought", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption={`${label} · RSI ${config.period} · daily`}
      headline={latest.toFixed(0)}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(series, windowDays(chartWindow))}
      sparkColor={zone.color}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="RSI Momentum history window"
        />
      }
    />
  );
}

export const rsiMomentumFrame = defineFrame({
  ...rsiMomentumMeta,
  component: RsiMomentum,
});
