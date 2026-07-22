import { BarChart } from "@zframes/charts";
import { defineFrame, useChainActivity } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { chainPriceMoversMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = chainPriceMoversMeta.schema;

function ChainPriceMovers({ config }: { config: z.output<typeof schema> }) {
  const { chains, isLoading } = useChainActivity();

  const data = useMemo(
    () =>
      [...chains]
        .sort(
          (a, b) =>
            Math.abs(b.priceChangePct24h) - Math.abs(a.priceChangePct24h),
        )
        .slice(0, config.limit)
        .sort((a, b) => b.priceChangePct24h - a.priceChangePct24h)
        .map((c) => ({ label: c.label, value: c.priceChangePct24h })),
    [chains, config.limit],
  );

  if (isLoading)
    return <FrameStatus loading>loading chain movers…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no chain data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 24, 96)}
        formatValue={formatChangePct}
      />
    </div>
  );
}

export const chainPriceMoversFrame = defineFrame({
  ...chainPriceMoversMeta,
  component: ChainPriceMovers,
});
