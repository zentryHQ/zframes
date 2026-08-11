import { BarChart } from "@zframes/charts";
import { defineFrame, useMoney, usePredictionMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { predictionMarketBarsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = predictionMarketBarsMeta.schema;

/** Trim a long market question so it fits a chart-label column. */
function truncateLabel(text: string, max = 28): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function PredictionMarketBars({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  // The hook already asks the provider for the top-`limit` markets by
  // volume, pre-sorted descending — no client-side re-sort needed.
  const { markets, isLoading } = usePredictionMarkets(config.limit);

  const data = useMemo(
    () =>
      markets.map((m) => ({
        label: truncateLabel(m.question),
        value: m.volume24h,
      })),
    [markets],
  );

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no markets yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      {/* Scrolls rather than shrinks: the height is a COUNT of bars, each
          needing its own row to stay readable, so a card shorter than the
          list should let you reach the rest rather than squash every bar. */}
      <div className={scrollAreaClass}>
        <BarChart
          data={data}
          orientation="horizontal"
          height={Math.max(data.length * 26, 96)}
          formatValue={money.compact}
        />
      </div>
      <div className="caption text-soft shrink-0 text-center">
        prediction markets · 24h volume
      </div>
    </div>
  );
}

export const predictionMarketBarsFrame = defineFrame({
  ...predictionMarketBarsMeta,
  component: PredictionMarketBars,
});
