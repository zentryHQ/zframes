import { BarChart } from "@zframes/charts";
import { defineFrame, useTvlByChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { tvlBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = tvlBarsMeta.schema;

function TvlBars({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useTvlByChain();

  const data = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, config.limit)
        .map((e) => ({ label: e.name, value: e.tvl })),
    [entries, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no TVL data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 26, 96)}
        formatValue={formatCompactUsd}
      />
      <div className="caption text-soft text-center">
        total value locked · by chain
      </div>
    </div>
  );
}

export const tvlBarsFrame = defineFrame({
  ...tvlBarsMeta,
  component: TvlBars,
});
