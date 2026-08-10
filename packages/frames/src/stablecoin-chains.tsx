import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMoney, useStablecoinSupply } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
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
  const money = useMoney();
  const value = money.compact(data.usd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
    />
  );
}

function StablecoinChains({ config }: { config: z.output<typeof schema> }) {
  const { supply, isLoading } = useStablecoinSupply();
  // The tooltip resolver is not a component, so the frame holds the hook and the
  // inline arrow below closes over it.
  const money = useMoney();
  const totalUsd = supply?.totalUsd ?? 0;

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

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={() => 0}
      formatTooltip={(chain) => ({
        title: chain.id,
        rows: [
          { label: "stablecoins", value: money.compact(chain.usd) },
          ...(totalUsd > 0
            ? [
                {
                  label: "share",
                  value: formatPct((chain.usd / totalUsd) * 100),
                },
              ]
            : []),
        ],
        footer:
          totalUsd > 0
            ? `of ${money.compact(totalUsd)} across all chains`
            : undefined,
      })}
    />
  );
}

export const stablecoinChainsFrame = defineFrame({
  ...stablecoinChainsMeta,
  component: StablecoinChains,
});
