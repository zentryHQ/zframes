import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useMoney, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatPct, prettySlug } from "./format";
import { yieldScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldScatterMeta.schema;

function formatApy(v: number) {
  return formatPct(v, 0);
}

function YieldScatter({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useYieldPools();
  const money = useMoney();

  const data: ScatterDatum[] = useMemo(
    () =>
      pools
        .filter(
          (p) =>
            Number.isFinite(p.apy) &&
            p.apy > 0 &&
            p.apy <= config.maxApy &&
            p.tvlUsd > 0 &&
            (!config.stablecoinOnly || p.stablecoin),
        )
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, config.limit)
        .map((p) => ({
          id: p.pool,
          label: prettySlug(p.project),
          x: p.apy,
          y: p.tvlUsd,
          weight: p.tvlUsd,
        })),
    [pools, config.limit, config.maxApy, config.stablecoinOnly],
  );

  if (isLoading) return <FrameStatus loading>loading yields…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no yield data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          formatX={formatApy}
          formatY={money.compact}
          maxLabels={8}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        DeFi yields · APY (x) vs TVL (y, log) · top {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const yieldScatterFrame = defineFrame({
  ...yieldScatterMeta,
  component: YieldScatter,
});
