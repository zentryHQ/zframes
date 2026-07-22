import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useCoinMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { marketScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = marketScatterMeta.schema;

function MarketScatter({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMarkets();

  const data: ScatterDatum[] = useMemo(
    () =>
      entries
        .filter(
          (e) => e.changePct24h !== undefined && e.marketCapUsd > 0,
        )
        .slice(0, config.limit)
        .map((e) => ({
          id: e.symbol,
          label: e.symbol,
          x: e.changePct24h!,
          y: e.marketCapUsd,
          weight: e.marketCapUsd,
          color: changeColor(e.changePct24h!),
        })),
    [entries, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading markets…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no market data yet</FrameStatus>;

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
        24h change (x) vs market cap (y, log) · top {data.length}
      </div>
    </div>
  );
}

export const marketScatterFrame = defineFrame({
  ...marketScatterMeta,
  component: MarketScatter,
});
