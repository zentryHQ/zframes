import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useStablecoinSupply } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { stablecoinChainsMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = stablecoinChainsMeta.schema;

interface ChainNode extends TreeNode {
  usd: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: ChainNode;
}) {
  const value = formatCompactUsd(data.usd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value} stablecoins`}
    />
  );
}

function StablecoinChains({ config }: { config: z.output<typeof schema> }) {
  const { supply, isLoading } = useStablecoinSupply();

  const data: ChainNode[] = useMemo(
    () =>
      (supply?.topChains ?? []).slice(0, config.limit).map((c) => ({
        id: c.name,
        value: c.usd,
        usd: c.usd,
      })),
    [supply, config.limit],
  );

  if (isLoading)
    return <FrameStatus loading>loading stablecoin chains…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no stablecoin data yet</FrameStatus>;

  return <TreeChart data={data} LeafComponent={Leaf} getColorValue={() => 0} />;
}

export const stablecoinChainsFrame = defineFrame({
  ...stablecoinChainsMeta,
  component: StablecoinChains,
});
