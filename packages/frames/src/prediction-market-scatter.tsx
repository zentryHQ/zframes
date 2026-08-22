import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useMoney, usePredictionMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import { predictionMarketScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = predictionMarketScatterMeta.schema;

/** Trim a long market question so it fits beside a scatter dot. */
function truncateLabel(text: string, max = 20): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Stable reference (not an inline arrow) so the chart's D3 effect doesn't
 *  re-run its draw every render. */
const formatProbPct = (v: number) => formatPct(v, 0);

function PredictionMarketScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const money = useMoney();
  const { markets, isLoading } = usePredictionMarkets(config.limit);

  const data: ScatterDatum[] = useMemo(
    () =>
      markets
        // The y-axis is log-scaled, which needs strictly positive values.
        .filter((m) => m.outcomes.length > 0 && m.volume24h > 0)
        .map((m) => {
          const top = [...m.outcomes].sort((a, b) => b.prob - a.prob)[0];
          return {
            id: m.question,
            label: truncateLabel(m.question),
            x: top.prob * 100,
            y: m.volume24h,
            weight: m.volume24h,
          };
        }),
    [markets],
  );

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no markets yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          formatX={formatProbPct}
          formatY={money.compact}
          maxLabels={10}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        top-outcome probability (x) vs 24h volume (y, log) · top {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const predictionMarketScatterFrame = defineFrame({
  ...predictionMarketScatterMeta,
  component: PredictionMarketScatter,
});
