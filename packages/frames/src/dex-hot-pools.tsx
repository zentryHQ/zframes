import { defineFrame, useDexPools } from "@zframes/core";
import type { z } from "zod";
import {
  changeColor,
  formatChangePct,
  formatCompactUsd,
  formatPrice,
} from "./format";
import { MetricRow } from "./metric-row";
import { dexHotPoolsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = dexHotPoolsMeta.schema;

function DexHotPools({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useDexPools(config.network);

  if (isLoading) return <FrameStatus loading>loading hot pools…</FrameStatus>;
  if (pools.length === 0) return <FrameStatus>no pool data</FrameStatus>;

  return (
    <div className={scrollAreaClass}>
      {pools.slice(0, config.count).map((p, i) => (
        <MetricRow
          key={`${p.name}-${i}`}
          label={p.name}
          meta={`${formatPrice(p.priceUsd)} · ${formatCompactUsd(p.volume24hUsd)} vol`}
          value={
            <span style={{ color: changeColor(p.changePct24h) }}>
              {formatChangePct(p.changePct24h)}
            </span>
          }
        />
      ))}
    </div>
  );
}

export const dexHotPoolsFrame = defineFrame({
  ...dexHotPoolsMeta,
  component: DexHotPools,
});
