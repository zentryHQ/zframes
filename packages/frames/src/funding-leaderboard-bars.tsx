import { BarChart } from "@zframes/charts";
import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { DOWN_COLOR, UP_COLOR, formatFundingPct } from "./format";
import { fundingLeaderboardBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundingLeaderboardBarsMeta.schema;

// The "xyz:*" wildcard returns that dex's entire HIP-3 equity universe;
// merged with the default (crypto) dex this covers the WHOLE Hyperliquid perp
// book, matching the project's stocks-first + crypto-alongside stance.
const EQUITY_DEX_WILDCARDS = ["xyz:*"] as const;

function FundingLeaderboardBars({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const crypto = useDayStatsState(undefined, 60_000);
  const equity = useDayStatsState(EQUITY_DEX_WILDCARDS, 60_000);
  const isLoading = crypto.isLoading || equity.isLoading;

  const data = useMemo(
    () =>
      Object.entries({ ...crypto.stats, ...equity.stats })
        .filter(([, s]) => s.funding !== undefined)
        .map(([symbol, s]) => ({
          label: tickerOf(symbol),
          value: s.funding! * 100,
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, config.limit)
        .sort((a, b) => b.value - a.value),
    [crypto.stats, equity.stats, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no funding data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={formatFundingPct}
      />
    </div>
  );
}

export const fundingLeaderboardBarsFrame = defineFrame({
  ...fundingLeaderboardBarsMeta,
  component: FundingLeaderboardBars,
});
