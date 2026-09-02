import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useCoinMarkets, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { changeColor, formatChangePct } from "./format";
import { marketScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = marketScatterMeta.schema;

function MarketScatter({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMarkets();
  const money = useMoney();

  const data: ScatterDatum[] = useMemo(
    () =>
      entries
        .filter((e) => e.changePct24h !== undefined && e.marketCapUsd > 0)
        .slice(0, config.limit)
        .map((e) => ({
          id: e.symbol,
          label: e.symbol,
          x: e.changePct24h!,
          y: e.marketCapUsd,
          weight: e.marketCapUsd,
          color: changeColor(e.changePct24h!),
        })),
    [entries, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no market data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          zeroXLine
          formatX={formatChangePct}
          formatY={money.compact}
          maxLabels={10}
          xLabel="24h change"
          yLabel="market cap"
          // No `weightLabel`: the bubble area IS the market cap, which the y row
          // already gives, so naming it would print the same figure twice.
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        24h change (x) vs market cap (y, log) · top {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const marketScatterFrame = defineFrame({
  ...marketScatterMeta,
  component: MarketScatter,
});
