import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useMoney, useNftMarket } from "@zframes/core";
import { useCallback, useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct } from "./format";
import { nftBubblesMeta } from "./schemas";

const schema = nftBubblesMeta.schema;

interface NftBubble extends BubbleNode {
  floorUsd: number;
  floorChangePct24h: number;
}

function NftBubbles({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();
  // formatTitle runs inside BubbleChart's D3 render, not as a React component,
  // so useMoney() is called here and captured in the closure below.
  const money = useMoney();

  const nodes: NftBubble[] = useMemo(
    () =>
      collections
        .filter((c) => c.marketCapUsd > 0)
        .slice(0, config.topN)
        .map((c) => ({
          id: c.name,
          label: c.name,
          value: c.marketCapUsd,
          color: changeColor(c.floorChangePct24h),
          borderColor: changeColor(c.floorChangePct24h),
          floorUsd: c.floorUsd,
          floorChangePct24h: c.floorChangePct24h,
        })),
    [collections, config.topN],
  );

  const formatTitle = useCallback(
    (n: BubbleNode) => {
      const c = n as NftBubble;
      return `${c.label} · ${money.price(c.floorUsd)} floor · ${formatChangePct(c.floorChangePct24h)}`;
    },
    [money],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading NFT floors…"
      emptyText="no NFT data"
      caption={`area by mcap · ring by 24h floor change · top ${nodes.length}`}
      formatTitle={formatTitle}
    />
  );
}

export const nftBubblesFrame = defineFrame({
  ...nftBubblesMeta,
  component: NftBubbles,
});
