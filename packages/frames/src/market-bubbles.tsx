import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useCoinMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { assetLogoUrl } from "./asset-logo";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { marketBubblesMeta } from "./schemas";

const schema = marketBubblesMeta.schema;

interface CoinBubble extends BubbleNode {
  marketCapUsd: number;
  changePct24h: number;
}

function MarketBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMarkets();

  const nodes: CoinBubble[] = useMemo(
    () =>
      entries
        .filter((e) => e.changePct24h !== undefined && e.marketCapUsd > 0)
        .slice(0, config.limit)
        .map((e) => ({
          id: e.symbol,
          label: e.symbol,
          value:
            config.sizeBy === "change"
              ? Math.max(Math.abs(e.changePct24h!), 0.05)
              : e.marketCapUsd,
          imageUrl: assetLogoUrl(e.symbol),
          color: changeColor(e.changePct24h!),
          borderColor: changeColor(e.changePct24h!),
          marketCapUsd: e.marketCapUsd,
          changePct24h: e.changePct24h!,
        })),
    [entries, config.limit, config.sizeBy],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading markets…"
      emptyText="no market data yet"
      caption={`area by ${config.sizeBy === "change" ? "24h move" : "market cap"} · ring by 24h change · top ${nodes.length}`}
      formatTitle={(n) => {
        const coin = n as CoinBubble;
        return `${coin.label} · ${formatCompactUsd(coin.marketCapUsd)} mcap · ${formatChangePct(coin.changePct24h)}`;
      }}
    />
  );
}

export const marketBubblesFrame = defineFrame({
  ...marketBubblesMeta,
  component: MarketBubbles,
});
