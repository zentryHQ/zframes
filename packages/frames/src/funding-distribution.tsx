import { HistogramChart, sampleStats } from "@zframes/charts";
import { defineFrame, useFundingHistory } from "@zframes/core";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  DOWN_COLOR,
  UP_COLOR,
  changeColor,
  formatCompact,
  formatFundingPct,
  formatPct,
} from "./format";
import { fundingDistributionMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = fundingDistributionMeta.schema;

const LOOKBACK_DAYS = { "7D": 7, "1M": 31, "3M": 92 } as const;
const LOOKBACK_OPTIONS = ["7D", "1M", "3M"] as const;

/** Hourly prints, so a year of carry is the mean rate over this many hours. */
const HOURS_PER_YEAR = 24 * 365;

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

function FundingDistribution({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  // Memoised on the window: `startTimeMs` is a fetch dependency, so a fresh
  // `Date.now()` each render would refetch continuously.
  const startTimeMs = useMemo(
    () => Date.now() - LOOKBACK_DAYS[lookback] * 86_400_000,
    [lookback],
  );
  const { history, isLoading } = useFundingHistory(
    [config.symbol],
    startTimeMs,
  );

  const sample = useMemo(() => {
    const points = history[config.symbol] ?? [];
    const values = points.map((p) => p.fundingRate * 100);
    const stats = sampleStats(values);
    if (!stats) return null;
    return {
      values,
      stats,
      last: values[values.length - 1],
      // Simple (not compounded) annualisation of the mean hourly print — the
      // carry a short would have earned holding across the whole window.
      annualisedPct: stats.mean * HOURS_PER_YEAR,
    };
  }, [history, config.symbol]);

  // Only blank the card before the first history lands — a background refresh
  // keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !sample)
    return <FrameStatus loading>loading funding history…</FrameStatus>;
  if (!sample) return <FrameStatus>no funding history yet</FrameStatus>;

  const { values, stats, last, annualisedPct } = sample;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      <HistogramChart
        values={values}
        height={140}
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        formatValue={formatFundingPct}
        formatCount={formatCompact}
        markers={[
          { value: stats.mean, label: "mean" },
          { value: last, label: "last", color: changeColor(last) },
        ]}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="caption text-soft min-w-0 truncate">
          {tickerOf(config.symbol)} · {formatCompact(stats.count)} hourly prints
        </span>
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="funding distribution lookback"
        />
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/[0.08] pt-1.5">
        <Stat
          label="mean"
          value={formatFundingPct(stats.mean)}
          color={changeColor(stats.mean)}
        />
        {/* The headline number for a carry trade: what the mean print is worth
            held for a year, which no single funding reading tells you. */}
        <Stat
          label="annualised"
          value={formatPct(annualisedPct, 1)}
          color={changeColor(annualisedPct)}
        />
        <Stat label="longs pay" value={formatPct(stats.positivePct, 0)} />
        <Stat
          label="last"
          value={formatFundingPct(last)}
          color={changeColor(last)}
        />
      </div>
    </div>
  );
}

export const fundingDistributionFrame = defineFrame({
  ...fundingDistributionMeta,
  component: FundingDistribution,
});
