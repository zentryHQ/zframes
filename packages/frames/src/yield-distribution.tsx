import { HistogramChart, quantile, sampleStats } from "@zframes/charts";
import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { formatCompact, formatPct } from "./format";
import { yieldDistributionMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldDistributionMeta.schema;

/** Fewer pools than this is a list, not a distribution. */
const MIN_POOLS = 12;

function formatAxisWhole(v: number) {
  return formatPct(v, 0);
}

function formatAxisDecimal(v: number) {
  return formatPct(v, 1);
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="caption text-soft truncate uppercase">{label}</div>
      <div className="body-sm truncate font-bold tabular-nums">{value}</div>
    </div>
  );
}

function YieldDistribution({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useYieldPools();

  const sample = useMemo(() => {
    const values = pools
      .filter(
        (p) =>
          p.tvlUsd >= config.minTvlUsd &&
          (!config.stablecoinOnly || p.stablecoin) &&
          Number.isFinite(p.apy) &&
          p.apy >= 0 &&
          // Dropped from the sample rather than folded into the end bar: a
          // six-figure quoted APY is a data artefact, and counting it as an
          // observation would misreport how many real pools are on offer.
          p.apy <= config.maxApy,
      )
      .map((p) => p.apy);
    const stats = sampleStats(values);
    if (!stats || values.length < MIN_POOLS) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const median = quantile(sorted, 0.5);
    return {
      values,
      stats,
      median,
      p90: quantile(sorted, 0.9),
      markers: [{ value: median, label: "median" }],
    };
  }, [pools, config.minTvlUsd, config.stablecoinOnly, config.maxApy]);

  // Only blank the card before the first pool list lands — a background refresh
  // keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !sample)
    return <FrameStatus loading>loading yield pools…</FrameStatus>;
  if (!sample) return <FrameStatus>no pools clear these filters</FrameStatus>;

  const { values, stats, median, p90, markers } = sample;
  // Precision chosen once from the whole range, not per tick: deciding per value
  // printed "0.0%" beside "10%" on the same axis. A stablecoin-only view spans a
  // few points and needs the decimal; a general view spanning 0–200% does not.
  const axisDp = stats.max >= 20 ? 0 : 1;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      {/* No negativeColor: APY is one-sided, so a diverging split would imply a
          zero crossing that cannot happen. */}
      <HistogramChart
        values={values}
        height={140}
        formatValue={axisDp === 0 ? formatAxisWhole : formatAxisDecimal}
        formatCount={formatCompact}
        markers={markers}
      />

      {/* The TVL floor is deliberately not echoed here: it is a USD figure the
          user typed into the rail, and printing it on a card that may be
          denominated in another currency would be the one unconverted "$" on
          the board. The count already says how many pools cleared it. */}
      <div className="caption text-soft text-center">
        {formatCompact(stats.count)}{" "}
        {config.stablecoinOnly ? "stablecoin " : ""}pools · APY distribution
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/[0.08] pt-1.5">
        <Stat label="median" value={formatPct(median, 1)} />
        {/* The top decile is where the yield-scanner list is drawn from — worth
            naming so a headline APY can be placed against it. */}
        <Stat label="top 10%" value={formatPct(p90, 1)} />
        <Stat label="best" value={formatPct(stats.max, 1)} />
        <Stat label="spread" value={formatPct(stats.stdev, 1)} />
      </div>
    </div>
  );
}

export const yieldDistributionFrame = defineFrame({
  ...yieldDistributionMeta,
  component: YieldDistribution,
});
