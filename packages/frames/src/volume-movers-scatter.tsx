import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useDayStatsState, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { ChartCard } from "./chart-card";
import { changeColor, formatChangePct } from "./format";
import { volumeMoversScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = volumeMoversScatterMeta.schema;

function VolumeMoversScatter({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useDayStatsState();
  const money = useMoney();

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
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          zeroXLine
          formatX={formatChangePct}
          formatY={money.compact}
          maxLabels={10}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        24h change (x) vs 24h notional volume (y, log) · top {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const volumeMoversScatterFrame = defineFrame({
  ...volumeMoversScatterMeta,
  component: VolumeMoversScatter,
});
