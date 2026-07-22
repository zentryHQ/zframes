import { BarChart } from "@zframes/charts";
import { defineFrame, useEtfFlows } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompactUsd } from "./format";
import { etfIssuerBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = etfIssuerBarsMeta.schema;

function EtfIssuerBars({ config }: { config: z.output<typeof schema> }) {
  const { flows, isLoading } = useEtfFlows(config.asset);

  const data = useMemo(
    () =>
      [...(flows?.issuers ?? [])]
        .sort((a, b) => Math.abs(b.dailyNetInflow) - Math.abs(a.dailyNetInflow))
        .slice(0, config.limit)
        .sort((a, b) => b.dailyNetInflow - a.dailyNetInflow)
        .map((is) => ({ label: is.ticker, value: is.dailyNetInflow })),
    [flows, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={formatCompactUsd}
      />
      <div className="caption text-soft text-center">
        {config.asset.toUpperCase()} spot-ETF issuers · today's net flow
      </div>
    </div>
  );
}

export const etfIssuerBarsFrame = defineFrame({
  ...etfIssuerBarsMeta,
  component: EtfIssuerBars,
});
