import { BarChart } from "@zframes/charts";
import { defineFrame, useChainActivity } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact } from "./format";
import { chainActivityBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = chainActivityBarsMeta.schema;

function ChainActivityBars({ config }: { config: z.output<typeof schema> }) {
  const { chains, isLoading } = useChainActivity();

  const data = useMemo(
    () =>
      [...chains]
        .sort((a, b) => b.transactions24h - a.transactions24h)
        .slice(0, config.limit)
        .map((c) => ({ label: c.label, value: c.transactions24h })),
    [chains, config.limit],
  );

  if (isLoading)
    return <FrameStatus loading>loading chain activity…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no chain data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      <div className="min-h-0 flex-1">
        <BarChart
          data={data}
          orientation="horizontal"
          fill
          formatValue={formatCompact}
        />
      </div>
      <div className="caption text-soft text-center">
        transactions · last 24h
      </div>
    </div>
  );
}

export const chainActivityBarsFrame = defineFrame({
  ...chainActivityBarsMeta,
  component: ChainActivityBars,
});
