import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useDayStatsState, useOpenInterest } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { ChartCard } from "./chart-card";
import { changeColor, formatChangePct, formatFundingPct } from "./format";
import { fundingCrowdingScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundingCrowdingScatterMeta.schema;

function FundingCrowdingScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { stats, isLoading: statsLoading } = useDayStatsState();
  const { entries: oiEntries, isLoading: oiLoading } = useOpenInterest();
  const isLoading = statsLoading || oiLoading;

  const oiBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of oiEntries) map.set(e.symbol, e.openInterestUsd);
    return map;
  }, [oiEntries]);

  const data: ScatterDatum[] = useMemo(
    () =>
      Object.entries(stats)
        .filter(([, s]) => s.funding !== undefined)
        .map(([symbol, s]) => ({
          id: symbol,
          label: tickerOf(symbol),
          x: s.changePct,
          y: s.funding! * 100,
          weight: oiBySymbol.get(symbol) ?? 0,
          color: changeColor(s.changePct),
        }))
        .filter((d) => d.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, config.limit),
    [stats, oiBySymbol, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no funding data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          zeroXLine
          fill
          formatX={formatChangePct}
          formatY={formatFundingPct}
          maxLabels={10}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        24h change (x) vs funding rate (y) · bubble = open interest · top{" "}
        {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const fundingCrowdingScatterFrame = defineFrame({
  ...fundingCrowdingScatterMeta,
  component: FundingCrowdingScatter,
});
