import { BarChart } from "@zframes/charts";
import { defineFrame, useEtfFlows } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompactUsd } from "./format";
import { etfFlowBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACK_MS = {
  "1M": 30 * 86_400_000,
  "3M": 90 * 86_400_000,
  "6M": 180 * 86_400_000,
} as const;

const schema = etfFlowBarsMeta.schema;

function dayLabel(time: number): string {
  const d = new Date(time);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function EtfFlowBars({ config }: { config: z.output<typeof schema> }) {
  const cutoff = useMemo(
    () => Date.now() - LOOKBACK_MS[config.lookback],
    [config.lookback],
  );
  const { flows, isLoading } = useEtfFlows(config.asset);

  const data = useMemo(
    () =>
      (flows?.history ?? [])
        .filter((p) => p.time >= cutoff)
        .map((p) => ({ label: dayLabel(p.time), value: p.value })),
    [flows, cutoff],
  );

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={200}
        formatValue={formatCompactUsd}
        showValues={false}
        maxTickLabels={6}
      />
      <div className="caption text-soft text-center">
        {config.asset.toUpperCase()} spot-ETF daily net flow · latest{" "}
        {formatCompactUsd(flows?.dailyTotalNetInflow ?? 0)}
      </div>
    </div>
  );
}

export const etfFlowBarsFrame = defineFrame({
  ...etfFlowBarsMeta,
  component: EtfFlowBars,
});
