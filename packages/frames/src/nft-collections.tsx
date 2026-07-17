import { defineFrame, useNftMarket } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompactUsd, formatPrice } from "./format";
import { MetricRow } from "./metric-row";
import { nftCollectionsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = nftCollectionsMeta.schema;

function NftCollections({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();

  if (isLoading) return <FrameStatus loading>loading NFT floors…</FrameStatus>;
  if (collections.length === 0) return <FrameStatus>no NFT data</FrameStatus>;

  return (
    <div className={scrollAreaClass}>
      {collections.slice(0, config.topN).map((c) => (
        <MetricRow
          key={c.id}
          label={c.name}
          meta={
            <span>
              {formatCompactUsd(c.volume24hUsd)} vol{" · "}
              <span style={{ color: changeColor(c.floorChangePct24h) }}>
                {formatChangePct(c.floorChangePct24h)}
              </span>
            </span>
          }
          value={formatPrice(c.floorUsd)}
        />
      ))}
    </div>
  );
}

export const nftCollectionsFrame = defineFrame({
  ...nftCollectionsMeta,
  component: NftCollections,
});
