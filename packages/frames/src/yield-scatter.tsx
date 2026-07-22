import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useYieldPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd, formatPct, prettySlug } from "./format";
import { yieldScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldScatterMeta.schema;

function YieldScatter({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useYieldPools();

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
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        yScale="log"
        height={210}
        formatX={(v) => formatPct(v, 0)}
        formatY={formatCompactUsd}
        maxLabels={8}
      />
      <div className="caption text-soft text-center">
        DeFi yields · APY (x) vs TVL (y, log) · top {data.length}
      </div>
    </div>
  );
}

export const yieldScatterFrame = defineFrame({
  ...yieldScatterMeta,
  component: YieldScatter,
});
