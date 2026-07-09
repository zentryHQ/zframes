import { defineFrame, usePredictionMarkets } from "@zframes/core";
import type { z } from "zod";
import { UP_COLOR, formatCompactUsd, formatPct } from "./format";
import { MetricRow } from "./metric-row";
import { predictionMarketsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = predictionMarketsMeta.schema;

function PredictionMarkets({ config }: { config: z.output<typeof schema> }) {
  const { markets, isLoading } = usePredictionMarkets(config.limit);

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (markets.length === 0) return <FrameStatus>no markets yet</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {markets.map((m, i) => {
        const top = [...m.outcomes].sort((a, b) => b.prob - a.prob)[0];
        return (
          <MetricRow
            key={i}
            label={m.question}
            meta={`${top.label} · vol ${formatCompactUsd(m.volume24h)}`}
            value={
              <span style={{ color: UP_COLOR }}>
                {formatPct(top.prob * 100, 0)}
              </span>
            }
          />
        );
      })}
    </div>
  );
}

export const predictionMarketsFrame = defineFrame({
  ...predictionMarketsMeta,
  component: PredictionMarkets,
});
