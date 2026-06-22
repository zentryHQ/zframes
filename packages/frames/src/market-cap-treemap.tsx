import { parseMarketData, TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useCoinMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { marketCapTreemapMeta } from "./schemas";
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
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  const change = data.changePct24h;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={`${data.id} · $${parseMarketData(data.marketCapUsd)} mcap · ${
        change >= 0 ? "+" : ""
      }${change.toFixed(2)}%`}
    >
      <span className="body-sm truncate font-bold text-white">{data.id}</span>
      {!compact && (
        <span className="caption text-white/80">
          {change >= 0 ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      )}
    </div>
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
