import { BarChart } from "@zframes/charts";
import { defineFrame, useFundingComparison } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { fundingSpreadBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundingSpreadBarsMeta.schema;

function FundingSpreadBars({ config }: { config: z.output<typeof schema> }) {
  const { comparison, isLoading } = useFundingComparison();

  const data = useMemo(
    () =>
      [...comparison]
        .sort((a, b) => b.spreadPct - a.spreadPct)
        .slice(0, config.limit)
        .map((c) => ({ label: c.coin, value: c.spreadPct })),
    [comparison, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no funding data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 26, 96)}
        formatValue={(v) => formatPct(v, 1)}
      />
      <div className="caption text-soft text-center">
        cross-venue funding spread, annualized · top {data.length}
      </div>
    </div>
  );
}

export const fundingSpreadBarsFrame = defineFrame({
  ...fundingSpreadBarsMeta,
  component: FundingSpreadBars,
});
