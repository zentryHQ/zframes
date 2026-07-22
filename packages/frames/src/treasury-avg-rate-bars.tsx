import { BarChart } from "@zframes/charts";
import { defineFrame, useTreasuryAverageRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { treasuryAvgRateBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = treasuryAvgRateBarsMeta.schema;

function TreasuryAvgRateBars({ config }: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useTreasuryAverageRates();

  const data = useMemo(
    () =>
      [...rates]
        .sort((a, b) => b.rate - a.rate)
        .slice(0, config.limit)
        .map((r) => ({ label: r.security, value: r.rate })),
    [rates, config.limit],
  );

  if (isLoading)
    return <FrameStatus loading>loading average rates…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no average-rate data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 24, 96)}
        formatValue={formatPct}
      />
    </div>
  );
}

export const treasuryAvgRateBarsFrame = defineFrame({
  ...treasuryAvgRateBarsMeta,
  component: TreasuryAvgRateBars,
});
