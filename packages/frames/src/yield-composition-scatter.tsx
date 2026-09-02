import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useMoney, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import { yieldCompositionScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldCompositionScatterMeta.schema;

function formatAxisPct(v: number) {
  return formatPct(v, 1);
}

function YieldCompositionScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { pools, isLoading } = useYieldPools();
  // Only for the tooltip's weight row: a pool's TVL is money, so it converts.
  const money = useMoney();

  const data: ScatterDatum[] = useMemo(
    () =>
      pools
        .filter(
          (p) =>
            p.apyBase !== null &&
            p.apyReward !== null &&
            p.tvlUsd > 0 &&
            (!config.stablecoinOnly || p.stablecoin),
        )
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, config.limit)
        .map((p) => ({
          id: p.pool,
          label: p.symbol,
          x: p.apyBase as number,
          y: p.apyReward as number,
          weight: p.tvlUsd,
        })),
    [pools, config.limit, config.stablecoinOnly],
  );

  if (isLoading) return <FrameStatus loading>loading yields…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no yield data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          fill
          formatX={formatAxisPct}
          formatY={formatAxisPct}
          maxLabels={8}
          // The names the caption already uses.
          xLabel="base APY"
          yLabel="reward APY"
          weightLabel="TVL"
          formatWeight={money.compact}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        base APY (x) vs reward APY (y) · bubble = TVL · top {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const yieldCompositionScatterFrame = defineFrame({
  ...yieldCompositionScatterMeta,
  component: YieldCompositionScatter,
});
