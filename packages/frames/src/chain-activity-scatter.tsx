import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useChainActivity } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompact } from "./format";
import { chainActivityScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = chainActivityScatterMeta.schema;

function ChainActivityScatter(_props: { config: z.output<typeof schema> }) {
  const { chains, isLoading } = useChainActivity();

  const data: ScatterDatum[] = useMemo(
    () =>
      chains
        .filter((c) => c.transactions24h > 0)
        .map((c) => ({
          id: c.chain,
          label: c.label,
          x: c.priceChangePct24h,
          y: c.transactions24h,
          weight: c.mempoolTxns,
          color: changeColor(c.priceChangePct24h),
        })),
    [chains],
  );

  if (isLoading)
    return <FrameStatus loading>loading chain activity…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no chain data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        yScale="log"
        height={210}
        zeroXLine
        formatX={formatChangePct}
        formatY={formatCompact}
        maxLabels={10}
      />
      <div className="caption text-soft text-center">
        24h price change (x) vs 24h transactions (y, log) · bubble = mempool
        backlog
      </div>
    </div>
  );
}

export const chainActivityScatterFrame = defineFrame({
  ...chainActivityScatterMeta,
  component: ChainActivityScatter,
});
