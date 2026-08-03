import { HistogramChart, sampleStats } from "@zframes/charts";
import { defineFrame, useCandles } from "@zframes/core";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  DOWN_COLOR,
  UP_COLOR,
  changeColor,
  formatChangePct,
  formatCompact,
  formatPct,
} from "./format";
import {
  monthlyReturns,
  percentileRank,
  simpleReturns,
  weeklyReturns,
} from "./metals-shared";
import { returnDistributionMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = returnDistributionMeta.schema;

const LOOKBACK_DAYS = { "6M": 183, "1Y": 366, "2Y": 731, "5Y": 1827 } as const;
const LOOKBACK_OPTIONS = ["6M", "1Y", "2Y", "5Y"] as const;

/**
 * Below this a histogram is a bar chart of noise — the bins are mostly empty and
 * the "distribution" is whichever handful of moves happened to occur.
 */
const MIN_OBSERVATIONS = 12;

/**
 * Trim per tail before the axis is sized. Wider than the metals frame's 0.5%
 * because these windows are far shorter: on 250 daily returns a 0.5% trim is a
 * single observation, which barely reins in an outlier.
 */
const TAIL_TRIM = 0.01;

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="caption text-soft truncate uppercase">{label}</div>
      <div
        className="body-sm truncate font-bold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function ReturnDistribution({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  // Memoised on the window: `startTimeMs` is a fetch dependency, so a fresh
  // `Date.now()` each render would refetch continuously.
  const startTimeMs = useMemo(
    () => Date.now() - LOOKBACK_DAYS[lookback] * 86_400_000,
    [lookback],
  );
  const { candles, isLoading } = useCandles(
    config.symbol,
    "1d",
    startTimeMs,
    undefined,
    config.source,
  );

  const sample = useMemo(() => {
    const closes = candles.map((c) => ({ time: c.time, value: c.close }));
    // The shared definitions of a period return, not a local restatement.
    const values =
      config.period === "daily"
        ? simpleReturns(closes)
        : config.period === "weekly"
          ? weeklyReturns(closes)
          : monthlyReturns(closes).map((m) => m.pct);
    if (values.length < MIN_OBSERVATIONS) return null;

    const stats = sampleStats(values);
    if (!stats) return null;
    const last = values[values.length - 1];
    return {
      values,
      stats,
      last,
      // Where the most recent move sits in its own history — the read that turns
      // a static distribution into "is today actually unusual?".
      lastPercentile: percentileRank(values, last),
    };
  }, [candles, config.period]);

  // Only blank the card before the first candles land — a background refresh
  // keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !sample)
    return <FrameStatus loading>loading return history…</FrameStatus>;
  if (!sample)
    return (
      <FrameStatus>
        not enough {config.period} returns in this window
      </FrameStatus>
    );

  const { values, stats, last, lastPercentile } = sample;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      <HistogramChart
        values={values}
        height={140}
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        tailTrim={TAIL_TRIM}
        formatValue={formatChangePct}
        formatCount={formatCompact}
        showNormalCurve={config.showNormalCurve}
        markers={[
          { value: stats.mean, label: "mean" },
          { value: last, label: "last", color: changeColor(last) },
        ]}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="caption text-soft min-w-0 truncate">
          {tickerOf(config.symbol)} · {formatCompact(stats.count)}{" "}
          {config.period} returns
        </span>
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="return distribution lookback"
        />
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/[0.08] pt-1.5">
        <Stat
          label="mean"
          value={formatChangePct(stats.mean)}
          color={changeColor(stats.mean)}
        />
        <Stat label="std dev" value={formatPct(stats.stdev)} />
        <Stat label="positive" value={formatPct(stats.positivePct, 0)} />
        {/* The latest move plus its rank: "+1.2%" alone doesn't say whether that
            is a normal day for this symbol, which is the whole question. */}
        <Stat
          label={`last · p${lastPercentile.toFixed(0)}`}
          value={formatChangePct(last)}
          color={changeColor(last)}
        />
      </div>
    </div>
  );
}

export const returnDistributionFrame = defineFrame({
  ...returnDistributionMeta,
  component: ReturnDistribution,
});
