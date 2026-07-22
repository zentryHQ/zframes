import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useDexPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatCompactUsd } from "./format";
import { dexPoolLiquidityScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dexPoolLiquidityScatterMeta.schema;

function DexPoolLiquidityScatter({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useDexPools(config.network);

  const data: ScatterDatum[] = useMemo(
    () =>
      pools
        .filter((p) => p.reserveUsd > 0 && p.volume24hUsd > 0)
        .slice(0, config.count)
        .map((p) => ({
          id: p.name,
          label: p.name,
          // ScatterChart only exposes a log *y* scale; pool reserves span just
          // as many orders of magnitude as volume, so x is pre-log10'd here
          // and un-transformed in formatX for a log-log liquidity/volume view.
          x: Math.log10(p.reserveUsd),
          y: p.volume24hUsd,
          weight: p.txns24h,
          color: changeColor(p.changePct24h),
        })),
    [pools, config.count],
  );

  if (isLoading) return <FrameStatus loading>loading pools…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no pool data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        yScale="log"
        height={210}
        formatX={(v) => formatCompactUsd(10 ** v)}
        formatY={formatCompactUsd}
        maxLabels={8}
      />
      <div className="caption text-soft text-center">
        {config.network} · liquidity (x, log) vs 24h volume (y, log) · bubble = trades
      </div>
    </div>
  );
}

export const dexPoolLiquidityScatterFrame = defineFrame({
  ...dexPoolLiquidityScatterMeta,
  component: DexPoolLiquidityScatter,
});
