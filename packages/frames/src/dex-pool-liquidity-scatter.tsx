import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useDexPools, useMoney } from "@zframes/core";
import { useCallback, useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { changeColor, formatCompact } from "./format";
import { dexPoolLiquidityScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dexPoolLiquidityScatterMeta.schema;

function DexPoolLiquidityScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { pools, isLoading } = useDexPools(config.network);
  const money = useMoney();

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

  const formatX = useCallback((v: number) => money.compact(10 ** v), [money]);

  if (isLoading) return <FrameStatus loading>loading pools…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no pool data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          formatX={formatX}
          formatY={money.compact}
          maxLabels={8}
          // The names the caption already uses; trades are a count, so the
          // compact magnitude rather than a money formatter.
          xLabel="liquidity"
          yLabel="24h volume"
          weightLabel="trades"
          formatWeight={formatCompact}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        {config.network} · liquidity (x, log) vs 24h volume (y, log) · bubble =
        trades
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const dexPoolLiquidityScatterFrame = defineFrame({
  ...dexPoolLiquidityScatterMeta,
  component: DexPoolLiquidityScatter,
});
