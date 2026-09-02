import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useCoinMovers, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { changeColor, formatChangePct } from "./format";
import { coinMomentumScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = coinMomentumScatterMeta.schema;

function CoinMomentumScatter({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();
  // Only for the tooltip's weight row: a market cap is money, so it converts.
  const money = useMoney();

  const data: ScatterDatum[] = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            Number.isFinite(e.changePct["24h"]) &&
            Number.isFinite(e.changePct["7d"]) &&
            e.marketCapUsd > 0,
        )
        .sort((a, b) => a.rank - b.rank)
        .slice(0, config.limit)
        .map((e) => ({
          id: e.symbol,
          label: e.symbol,
          x: e.changePct["24h"],
          y: e.changePct["7d"],
          weight: e.marketCapUsd,
          color: changeColor(e.changePct["24h"]),
        })),
    [entries, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading momentum…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no momentum data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          fill
          zeroXLine
          formatX={formatChangePct}
          formatY={formatChangePct}
          maxLabels={10}
          // The names the caption already uses: "x: +1.2%" on its own is not a
          // reading, and the bubble's third dimension went unnamed entirely.
          xLabel="24h change"
          yLabel="7d change"
          weightLabel="market cap"
          formatWeight={money.compact}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        24h change (x) vs 7d change (y) · top {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const coinMomentumScatterFrame = defineFrame({
  ...coinMomentumScatterMeta,
  component: CoinMomentumScatter,
});
