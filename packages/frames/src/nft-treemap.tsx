import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useNftMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
import { nftTreemapMeta } from "./schemas";
import { treemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = nftTreemapMeta.schema;

interface NftNode extends TreeNode {
  floorUsd: number;
  floorChangePct24h: number;
}

const Leaf = treemapLeaf<NftNode>(
  (d) => d.id,
  (d, money) => money.price(d.floorUsd),
);

function NftTreemap({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();
  const money = useMoney();

  const data: NftNode[] = useMemo(
    () =>
      collections
        .filter((c) => c.marketCapUsd > 0)
        .slice(0, config.topN)
        .map((c) => ({
          id: c.name,
          value: c.marketCapUsd,
          floorUsd: c.floorUsd,
          floorChangePct24h: c.floorChangePct24h,
        })),
    [collections, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading NFT floors…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no NFT data</FrameStatus>;

  const shownMcap = data.reduce((sum, node) => sum + node.value, 0);

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.floorChangePct24h}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "mcap", value: money.compact(node.value) },
          { label: "floor", value: money.price(node.floorUsd) },
          {
            label: "24h",
            value: formatChangePct(node.floorChangePct24h),
            color: changeColor(node.floorChangePct24h),
          },
        ],
        footer:
          shownMcap > 0
            ? `${formatPct((node.value / shownMcap) * 100, 1)} of shown mcap`
            : undefined,
      })}
    />
  );
}

export const nftTreemapFrame = defineFrame({
  ...nftTreemapMeta,
  component: NftTreemap,
});
