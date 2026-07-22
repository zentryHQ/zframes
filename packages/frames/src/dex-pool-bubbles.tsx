import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useDexPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { dexPoolBubblesMeta } from "./schemas";

const schema = dexPoolBubblesMeta.schema;

interface PoolBubble extends BubbleNode {
  changePct24h: number;
}

function DexPoolBubbles({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useDexPools(config.network);

  const nodes: PoolBubble[] = useMemo(
    () =>
      pools
        .filter((p) => p.volume24hUsd > 0)
        .slice(0, config.count)
        .map((p) => ({
          id: p.name,
          label: p.name,
          value: p.volume24hUsd,
          color: changeColor(p.changePct24h),
          borderColor: changeColor(p.changePct24h),
          changePct24h: p.changePct24h,
        })),
    [pools, config.count],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading hot pools…"
      emptyText="no pool data"
      caption={`${config.network} · area by 24h volume · ring by 24h change`}
      formatTitle={(n) =>
        `${n.label} · ${formatCompactUsd(n.value)} vol · ${formatChangePct((n as PoolBubble).changePct24h)}`
      }
    />
  );
}

export const dexPoolBubblesFrame = defineFrame({
  ...dexPoolBubblesMeta,
  component: DexPoolBubbles,
});
