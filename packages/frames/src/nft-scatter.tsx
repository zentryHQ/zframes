import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useNftMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { nftScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nftScatterMeta.schema;

/** Keep bubble labels short so long collection names don't collide. */
function shortName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

function NftScatter({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();

  const data: ScatterDatum[] = useMemo(
    () =>
      collections
        .filter(
          (c) =>
            Number.isFinite(c.floorChangePct24h) && c.volume24hUsd > 0,
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
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        yScale="log"
        height={210}
        zeroXLine
        formatX={formatChangePct}
        formatY={formatCompactUsd}
        maxLabels={10}
      />
      <div className="caption text-soft text-center">
        24h floor change (x) vs 24h volume (y, log)
      </div>
    </div>
  );
}

export const nftScatterFrame = defineFrame({
  ...nftScatterMeta,
  component: NftScatter,
});
