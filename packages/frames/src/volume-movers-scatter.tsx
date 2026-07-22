import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { volumeMoversScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = volumeMoversScatterMeta.schema;

function VolumeMoversScatter({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useDayStatsState();

  const data: ScatterDatum[] = useMemo(
    () =>
      Object.entries(stats)
        .filter(([, s]) => (s.dayNtlVlm ?? 0) > 0)
        .sort((a, b) => (b[1].dayNtlVlm ?? 0) - (a[1].dayNtlVlm ?? 0))
        .slice(0, config.limit)
        .map(([symbol, s]) => ({
          id: symbol,
          label: tickerOf(symbol),
          x: s.changePct,
          y: s.dayNtlVlm!,
          weight: s.dayNtlVlm!,
          color: changeColor(s.changePct),
        })),
    [stats, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no volume data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        yScale="log"
        height={210}
        zeroXLine
        formatX={formatChangePct}
        formatY={formatCompactUsd}
        maxLabels={10}
      />
      <div className="caption text-soft text-center">
        24h change (x) vs 24h notional volume (y, log) · top {data.length}
      </div>
    </div>
  );
}

export const volumeMoversScatterFrame = defineFrame({
  ...volumeMoversScatterMeta,
  component: VolumeMoversScatter,
});
