import { defineFrame, useMoney, usePredictionMarkets } from "@zframes/core";
import type { z } from "zod";
import { UP_COLOR, formatPct } from "./format";
import { MetricRow } from "./metric-row";
import { predictionMarketsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = predictionMarketsMeta.schema;

function PredictionMarkets({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { markets, isLoading } = usePredictionMarkets(config.limit);

  // A market can come back with an empty `outcomes` array, and the whole row is
  // its leading outcome — so a market without one is dropped here rather than
  // read off the end of the sorted list, which threw and replaced the entire
  // card with "Frame crashed". (`prediction-market-scatter` guards the same
  // way.) Rows, not markets, decide the empty state: every market lacking an
  // outcome is the same nothing-to-show as no markets at all.
  const rows = markets.flatMap((m) => {
    const [top] = [...m.outcomes].sort((a, b) => b.prob - a.prob);
    return top ? [{ market: m, top }] : [];
  });

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (rows.length === 0) return <FrameStatus>no markets yet</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {rows.map(({ market, top }, i) => (
        <MetricRow
          key={i}
          label={market.question}
          meta={`${top.label} · vol ${money.compact(market.volume24h)}`}
          value={
            <span style={{ color: UP_COLOR }}>
              {formatPct(top.prob * 100, 0)}
            </span>
          }
        />
      ))}
    </div>
  );
}

export const predictionMarketsFrame = defineFrame({
  ...predictionMarketsMeta,
  component: PredictionMarkets,
});
