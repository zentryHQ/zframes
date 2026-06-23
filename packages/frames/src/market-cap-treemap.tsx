import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useCoinMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct, formatCompactUsd } from "./format";
import { marketCapTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = marketCapTreemapMeta.schema;

interface CoinNode extends TreeNode {
  marketCapUsd: number;
  changePct24h: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: CoinNode;
}) {
  const value = formatCompactUsd(data.marketCapUsd);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={value}
      title={`${data.id} · ${value} mcap · ${formatChangePct(data.changePct24h)}`}
    />
  );
}

function MarketCapTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMarkets();

  const data: CoinNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.symbol,
        value: entry.marketCapUsd,
        marketCapUsd: entry.marketCapUsd,
        changePct24h: entry.changePct24h ?? 0,
      })),
    [entries, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading market caps…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no market data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct24h}
    />
  );
}

export const marketCapTreemapFrame = defineFrame({
  ...marketCapTreemapMeta,
  component: MarketCapTreemap,
});
