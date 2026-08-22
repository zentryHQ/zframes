import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useCoinMarkets, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
import { marketCapTreemapMeta } from "./schemas";
import { treemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = marketCapTreemapMeta.schema;

interface CoinNode extends TreeNode {
  marketCapUsd: number;
  changePct24h: number;
}

const Leaf = treemapLeaf<CoinNode>(
  (d) => d.id,
  (d, money) => money.compact(d.marketCapUsd),
);

function MarketCapTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMarkets();
  const money = useMoney();

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

  // Denominator for the tile's share-of-board footer: the shown coins only, so
  // the shares add up to the treemap the cursor is actually over.
  const shownCapUsd = useMemo(
    () => data.reduce((sum, node) => sum + node.marketCapUsd, 0),
    [data],
  );

  if (isLoading) return <FrameStatus loading>loading market caps…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no market data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct24h}
      formatTooltip={(node) => ({
        title: node.id,
        rows: [
          { label: "mcap", value: money.compact(node.marketCapUsd) },
          {
            label: "24h",
            value: formatChangePct(node.changePct24h),
            color: changeColor(node.changePct24h),
          },
        ],
        footer:
          shownCapUsd > 0
            ? `${formatPct((node.marketCapUsd / shownCapUsd) * 100, 1)} of top ${data.length}`
            : undefined,
      })}
    />
  );
}

export const marketCapTreemapFrame = defineFrame({
  ...marketCapTreemapMeta,
  component: MarketCapTreemap,
});
