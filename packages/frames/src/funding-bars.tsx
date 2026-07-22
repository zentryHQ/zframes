import { BarChart } from "@zframes/charts";
import { defineFrame, useFundingComparison } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatFundingPct } from "./format";
import { fundingBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundingBarsMeta.schema;

function FundingBars({ config }: { config: z.output<typeof schema> }) {
  const { comparison, isLoading } = useFundingComparison();
  const coin = config.coin.trim().toUpperCase();

  const entry = useMemo(
    () => comparison.find((c) => c.coin.toUpperCase() === coin),
    [comparison, coin],
  );
  const data = useMemo(
    () =>
      (entry?.venues ?? []).map((v) => ({
        label: v.venue,
        value: v.annualizedPct,
      })),
    [entry],
  );

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no cross-venue funding for {coin}</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 28, 84)}
        formatValue={(v) => formatFundingPct(v)}
      />
      <div className="caption text-soft text-center">
        {coin} funding, annualized · spread{" "}
        {formatFundingPct(entry?.spreadPct ?? 0)}
      </div>
    </div>
  );
}

export const fundingBarsFrame = defineFrame({
  ...fundingBarsMeta,
  component: FundingBars,
});
