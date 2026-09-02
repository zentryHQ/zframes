import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import {
  defineFrame,
  useMoney,
  useProtocolFees,
  useProtocolTvl,
} from "@zframes/core";
import { useCallback, useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { protocolFeesVsTvlScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = protocolFeesVsTvlScatterMeta.schema;

function ProtocolFeesVsTvlScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { entries: tvlEntries, isLoading: tvlLoading } = useProtocolTvl();
  const { entries: feeEntries, isLoading: feesLoading } = useProtocolFees();
  const money = useMoney();

  const data: ScatterDatum[] = useMemo(() => {
    const tvlByName = new Map<string, number>();
    for (const e of tvlEntries) tvlByName.set(e.name, e.tvl);
    return feeEntries
      .flatMap((f) => {
        const tvl = tvlByName.get(f.name);
        return tvl && tvl > 0 && f.fees24h > 0
          ? [{ name: f.name, tvl, fees24h: f.fees24h }]
          : [];
      })
      .sort((a, b) => b.fees24h - a.fees24h)
      .slice(0, config.limit)
      .map((d) => ({
        id: d.name,
        label: d.name,
        // ScatterChart only exposes a log *y* scale; TVL spans just as many
        // orders of magnitude as fees, so x is pre-log10'd here and
        // un-transformed in formatX for a log-log fees-vs-TVL view.
        x: Math.log10(d.tvl),
        y: d.fees24h,
        weight: d.fees24h,
      }));
  }, [tvlEntries, feeEntries, config.limit]);

  const formatX = useCallback((v: number) => money.compact(10 ** v), [money]);

  const isLoading = tvlLoading || feesLoading;
  if (isLoading) return <FrameStatus loading>loading protocols…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no matching protocol data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          formatX={formatX}
          formatY={money.compact}
          maxLabels={10}
          xLabel="TVL"
          yLabel="24h fees"
          // No `weightLabel`: the bubble area IS the 24h fees, already in the y
          // row, so naming it would print the same figure twice.
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        TVL (x, log) vs 24h fees (y, log) · top {data.length} by fees
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const protocolFeesVsTvlScatterFrame = defineFrame({
  ...protocolFeesVsTvlScatterMeta,
  component: ProtocolFeesVsTvlScatter,
});
