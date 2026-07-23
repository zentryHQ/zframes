import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useProtocolFees, useProtocolTvl } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
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

  const isLoading = tvlLoading || feesLoading;
  if (isLoading) return <FrameStatus loading>loading protocols…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no matching protocol data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        yScale="log"
        height={210}
        formatX={(v) => formatCompactUsd(10 ** v)}
        formatY={formatCompactUsd}
        maxLabels={10}
      />
      <div className="caption text-soft text-center">
        TVL (x, log) vs 24h fees (y, log) · top {data.length} by fees
      </div>
    </div>
  );
}

export const protocolFeesVsTvlScatterFrame = defineFrame({
  ...protocolFeesVsTvlScatterMeta,
  component: ProtocolFeesVsTvlScatter,
});
