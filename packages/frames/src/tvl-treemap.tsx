import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useTvlByChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { tvlTreemapMeta } from "./schemas";
import { treemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = tvlTreemapMeta.schema;

interface TvlNode extends TreeNode {
  tvl: number;
}

const Leaf = treemapLeaf<TvlNode>(
  (d) => d.id,
  (d, money) => money.compact(d.tvl),
);

function TvlTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useTvlByChain();
  // Also called here (the Leaf has its own copy) so the tooltip arrow — which is
  // not a component and cannot call hooks — closes over the card's currency.
  const money = useMoney();

  const data: TvlNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.tvl,
        tvl: entry.tvl,
      })),
    [entries, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no TVL data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.tvl}
      formatTooltip={(node) => {
        const shown = data.reduce((sum, entry) => sum + entry.tvl, 0);
        const rank = data.findIndex((entry) => entry.id === node.id) + 1;
        return {
          title: node.id,
          rows: [
            { label: "TVL", value: money.compact(node.tvl) },
            ...(rank > 0 ? [{ label: "rank", value: `#${rank}` }] : []),
          ],
          footer:
            shown > 0
              ? `${formatPct((node.tvl / shown) * 100, 1)} of top ${data.length}`
              : undefined,
        };
      }}
    />
  );
}

export const tvlTreemapFrame = defineFrame({
  ...tvlTreemapMeta,
  component: TvlTreemap,
});
