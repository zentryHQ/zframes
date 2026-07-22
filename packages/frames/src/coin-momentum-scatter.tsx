import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { coinMomentumScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = coinMomentumScatterMeta.schema;

function CoinMomentumScatter({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();

  const data: ScatterDatum[] = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            Number.isFinite(e.changePct["24h"]) &&
            Number.isFinite(e.changePct["7d"]) &&
            e.marketCapUsd > 0,
        )
        .sort((a, b) => a.rank - b.rank)
        .slice(0, config.limit)
        .map((e) => ({
          id: e.symbol,
          label: e.symbol,
          x: e.changePct["24h"],
          y: e.changePct["7d"],
          weight: e.marketCapUsd,
          color: changeColor(e.changePct["24h"]),
        })),
    [entries, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading momentum…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no momentum data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        height={210}
        zeroXLine
        formatX={formatChangePct}
        formatY={formatChangePct}
        maxLabels={10}
      />
      <div className="caption text-soft text-center">
        24h change (x) vs 7d change (y) · top {data.length}
      </div>
    </div>
  );
}

export const coinMomentumScatterFrame = defineFrame({
  ...coinMomentumScatterMeta,
  component: CoinMomentumScatter,
});
