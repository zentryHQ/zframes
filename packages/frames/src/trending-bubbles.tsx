import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useTrendingCoins } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct } from "./format";
import { trendingBubblesMeta } from "./schemas";

const schema = trendingBubblesMeta.schema;

interface TrendingBubble extends BubbleNode {
  changePct24h: number;
}

function TrendingBubbles({ config }: { config: z.output<typeof schema> }) {
  const { coins, isLoading } = useTrendingCoins();

  const nodes: TrendingBubble[] = useMemo(
    () =>
      coins
        .filter(
          (c) => c.changePct24h !== null && Number.isFinite(c.changePct24h),
        )
        .slice(0, config.limit)
        .map((c) => ({
          id: c.id,
          label: c.symbol,
          value: Math.max(Math.abs(c.changePct24h!), 0.05),
          color: changeColor(c.changePct24h!),
          borderColor: changeColor(c.changePct24h!),
          changePct24h: c.changePct24h!,
        })),
    [coins, config.limit],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading trending…"
      emptyText="no trending data yet"
      caption={`area by |24h change| · top ${nodes.length} trending`}
      formatTitle={(n) => {
        const coin = n as TrendingBubble;
        return `${coin.label} · ${formatChangePct(coin.changePct24h)}`;
      }}
    />
  );
}

export const trendingBubblesFrame = defineFrame({
  ...trendingBubblesMeta,
  component: TrendingBubbles,
});
