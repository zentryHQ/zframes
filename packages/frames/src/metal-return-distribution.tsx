import { HistogramChart, sampleStats } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import {
  DOWN_COLOR,
  UP_COLOR,
  changeColor,
  formatChangePct,
  formatCompact,
  formatPct,
} from "./format";
import {
  metalName,
  monthlyReturns,
  simpleReturns,
  sliceYears,
} from "./metals-shared";
import { metalReturnDistributionMeta } from "./schemas";
import { Stat } from "./stat";
import { FrameStatus } from "./ui";

const schema = metalReturnDistributionMeta.schema;

/**
 * Share of the sample trimmed off each tail before the axis is sized.
 *
 * Metal returns are fat-tailed — one 1980-style day stretches a min→max axis so
 * far that every other observation piles into two bars, which is a histogram of
 * nothing. `HistogramChart` folds the trimmed tails into the end bars and marks
 * them « », and the true extremes are still reported in the stat row below, so
 * nothing is hidden. Tighter than the shorter-window frames use because a
 * 58-year daily history has thousands of observations to spare.
 */
const TAIL_TRIM = 0.005;

function MetalReturnDistribution({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);

  const sample = useMemo(() => {
    const windowed = sliceYears(histories[0]?.points ?? [], config.years);
    const values =
      config.period === "daily"
        ? simpleReturns(windowed)
        : monthlyReturns(windowed).map((m) => m.pct);
    const stats = sampleStats(values);
    if (!stats) return null;

    return {
      values,
      stats,
      // The years actually covered — shorter than `config.years` whenever the
      // fix history is (platinum and palladium only start in 1990), so the
      // caption never claims a window the data can't back.
      span: `${new Date(windowed[0].time).getUTCFullYear()}–${new Date(
        windowed[windowed.length - 1].time,
      ).getUTCFullYear()}`,
    };
  }, [histories, config.period, config.years]);

  // Only blank the card before the first fix history lands — a background
  // refresh keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !sample)
    return <FrameStatus loading>loading return history…</FrameStatus>;
  if (!sample) return <FrameStatus>not enough fix history yet</FrameStatus>;

  const { values, stats, span } = sample;

  return (
    <ChartCard align="center" gap={1.5} className="text-normal">
      <ChartCard.Body>
        <HistogramChart
          values={values}
          fill
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          tailTrim={TAIL_TRIM}
          formatValue={formatChangePct}
          formatCount={formatCompact}
          markers={[{ value: stats.mean, label: "mean" }]}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        {metalName(config.symbol)} · {formatCompact(stats.count)}{" "}
        {config.period} returns · {span}
      </ChartCard.Caption>
      <Stat.Strip
        cols={4}
        gap={2}
        className="border-t border-white/[0.08] pt-1.5"
      >
        <Stat>
          <Stat.Label>mean</Stat.Label>
          <Stat.Value tint={changeColor(stats.mean)}>
            {formatChangePct(stats.mean)}
          </Stat.Value>
        </Stat>
        <Stat>
          <Stat.Label>std dev</Stat.Label>
          <Stat.Value>{formatPct(stats.stdev)}</Stat.Value>
        </Stat>
        <Stat>
          <Stat.Label>best</Stat.Label>
          <Stat.Value tint={UP_COLOR}>{formatChangePct(stats.max)}</Stat.Value>
        </Stat>
        <Stat>
          <Stat.Label>worst</Stat.Label>
          <Stat.Value tint={DOWN_COLOR}>
            {formatChangePct(stats.min)}
          </Stat.Value>
        </Stat>
      </Stat.Strip>
    </ChartCard>
  );
}

export const metalReturnDistributionFrame = defineFrame({
  ...metalReturnDistributionMeta,
  component: MetalReturnDistribution,
});
