import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useDexPools, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import {
  changeColor,
  formatChangePct,
  formatPct,
  networkLabel,
} from "./format";
import { dexPoolTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = dexPoolTreemapMeta.schema;

interface PoolNode extends TreeNode {
  volume24hUsd: number;
  changePct24h: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: PoolNode;
}) {
  const money = useMoney();
  const vol = money.compact(data.volume24hUsd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={vol}
    />
  );
}

function DexPoolTreemap({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useDexPools(config.network);
  const money = useMoney();

  const data: PoolNode[] = useMemo(
    () =>
      pools
        .filter((p) => p.volume24hUsd > 0)
        .slice(0, config.count)
        .map((p) => ({
          id: p.name,
          value: p.volume24hUsd,
          volume24hUsd: p.volume24hUsd,
          changePct24h: p.changePct24h,
        })),
    [pools, config.count],
  );

  if (isLoading) return <FrameStatus loading>loading hot pools…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no pool data</FrameStatus>;

  const totalVolume = data.reduce((sum, node) => sum + node.volume24hUsd, 0);

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct24h}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "volume", value: money.compact(node.volume24hUsd) },
          {
            label: "24h",
            value: formatChangePct(node.changePct24h),
            color: changeColor(node.changePct24h),
          },
        ],
        footer: totalVolume
          ? `${formatPct((node.volume24hUsd / totalVolume) * 100)} of shown volume`
          : undefined,
      })}
    />
  );
}

export const dexPoolTreemapFrame = defineFrame({
  ...dexPoolTreemapMeta,
  component: DexPoolTreemap,
  titleContent: ({ config }) => (
    <>{networkLabel(config.network)} · Pool Treemap</>
  ),
});
