import { HistogramChart, quantile, sampleStats } from "@zframes/charts";
import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatCompact, formatPct } from "./format";
import { yieldDistributionMeta } from "./schemas";
import { Stat } from "./stat";
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
    <ChartCard align="center" gap={1.5} className="text-normal">
      <ChartCard.Body>
        {/* No negativeColor: APY is one-sided, so a diverging split would imply
            a zero crossing that cannot happen. */}
        <HistogramChart
          values={values}
          fill
          formatValue={axisDp === 0 ? formatAxisWhole : formatAxisDecimal}
          formatCount={formatCompact}
          markers={markers}
        />
      </ChartCard.Body>

      {/* The TVL floor is deliberately not echoed here: it is a USD figure the
          user typed into the rail, and printing it on a card that may be
          denominated in another currency would be the one unconverted "$" on
          the board. The count already says how many pools cleared it. */}
      <ChartCard.Caption>
        {formatCompact(stats.count)}{" "}
        {config.stablecoinOnly ? "stablecoin " : ""}pools · APY distribution
      </ChartCard.Caption>

      <Stat.Strip
        cols={4}
        gap={2}
        className="border-t border-white/[0.08] pt-1.5"
      >
        <Stat>
          <Stat.Label>median</Stat.Label>
          <Stat.Value>{formatPct(median, 1)}</Stat.Value>
        </Stat>
        {/* The top decile is where the yield-scanner list is drawn from — worth
            naming so a headline APY can be placed against it. */}
        <Stat>
          <Stat.Label>top 10%</Stat.Label>
          <Stat.Value>{formatPct(p90, 1)}</Stat.Value>
        </Stat>
        <Stat>
          <Stat.Label>best</Stat.Label>
          <Stat.Value>{formatPct(stats.max, 1)}</Stat.Value>
        </Stat>
        <Stat>
          <Stat.Label>spread</Stat.Label>
          <Stat.Value>{formatPct(stats.stdev, 1)}</Stat.Value>
        </Stat>
      </Stat.Strip>
    </ChartCard>
  );
}

export const yieldDistributionFrame = defineFrame({
  ...yieldDistributionMeta,
  component: YieldDistribution,
});
