import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useMoney, useNftMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { changeColor, formatChangePct } from "./format";
import { nftScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nftScatterMeta.schema;

/** Keep bubble labels short so long collection names don't collide. */
function shortName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

function NftScatter({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();
  const money = useMoney();

  const data: ScatterDatum[] = useMemo(
    () =>
      collections
        .filter(
          (c) => Number.isFinite(c.floorChangePct24h) && c.volume24hUsd > 0,
        )
        .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
        .slice(0, config.limit)
        .map((c) => ({
          id: c.id,
          label: shortName(c.name),
          x: c.floorChangePct24h,
          y: c.volume24hUsd,
          weight: c.marketCapUsd,
          color: changeColor(c.floorChangePct24h),
        })),
    [collections, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading NFTs…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no NFT data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          yScale="log"
          fill
          zeroXLine
          formatX={formatChangePct}
          formatY={money.compact}
          maxLabels={10}
          // The names the caption already uses, plus the bubble's own
          // dimension, which the caption never mentioned at all.
          xLabel="24h floor change"
          yLabel="24h volume"
          weightLabel="market cap"
          formatWeight={money.compact}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        24h floor change (x) vs 24h volume (y, log)
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const nftScatterFrame = defineFrame({
  ...nftScatterMeta,
  component: NftScatter,
});
