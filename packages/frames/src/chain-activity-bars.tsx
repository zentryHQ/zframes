import { BarChart } from "@zframes/charts";
import { defineFrame, useChainActivity } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
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
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <BarChart
          data={data}
          orientation="horizontal"
          fill
          formatValue={formatCompact}
        />
      </ChartCard.Body>
      <ChartCard.Caption>transactions · last 24h</ChartCard.Caption>
    </ChartCard>
  );
}

export const chainActivityBarsFrame = defineFrame({
  ...chainActivityBarsMeta,
  component: ChainActivityBars,
});
