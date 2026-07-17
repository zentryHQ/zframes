import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useNftMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct, formatPrice } from "./format";
import { nftTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = nftTreemapMeta.schema;

interface NftNode extends TreeNode {
  floorUsd: number;
  floorChangePct24h: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: NftNode;
}) {
  const floor = formatPrice(data.floorUsd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={floor}
      title={`${data.id} · ${floor} floor · ${formatChangePct(data.floorChangePct24h)}`}
    />
  );
}

function NftTreemap({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();

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

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.floorChangePct24h}
    />
  );
}

export const nftTreemapFrame = defineFrame({
  ...nftTreemapMeta,
  component: NftTreemap,
});
