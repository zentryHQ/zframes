import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { yieldCompositionScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldCompositionScatterMeta.schema;

function YieldCompositionScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { pools, isLoading } = useYieldPools();

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
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        height={210}
        formatX={(v) => formatPct(v, 1)}
        formatY={(v) => formatPct(v, 1)}
        maxLabels={8}
      />
      <div className="caption text-soft text-center">
        base APY (x) vs reward APY (y) · bubble = TVL · top {data.length}
      </div>
    </div>
  );
}

export const yieldCompositionScatterFrame = defineFrame({
  ...yieldCompositionScatterMeta,
  component: YieldCompositionScatter,
});
