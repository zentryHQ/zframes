import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useTvlByChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { formatCompactUsd } from "./format";
import { tvlBubblesMeta } from "./schemas";

const schema = tvlBubblesMeta.schema;

function TvlBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useTvlByChain();

  const nodes: BubbleNode[] = useMemo(
    () =>
      entries
        .filter((e) => e.tvl > 0)
        .slice(0, config.topN)
        .map((e) => ({
          id: e.name,
          label: e.name,
          value: e.tvl,
        })),
    [entries, config.topN],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading TVL…"
      emptyText="no TVL data"
      caption={`area by chain TVL · top ${nodes.length}`}
      formatTitle={(n) => `${n.label} · ${formatCompactUsd(n.value)} TVL`}
    />
  );
}

export const tvlBubblesFrame = defineFrame({
  ...tvlBubblesMeta,
  component: TvlBubbles,
});
