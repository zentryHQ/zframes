import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct } from "./format";
import { coinMomentumHeatmapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = coinMomentumHeatmapMeta.schema;

const WINDOWS = ["1h", "24h", "7d", "30d"] as const;

function Cell({ data, width }: { data: HeatmapCell; width: number }) {
  if (width < 44) return null;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="caption text-normal tabular-nums">
        {formatChangePct(data.value)}
      </span>
    </div>
  );
}

function CoinMomentumHeatmap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();

  const cells: HeatmapCell[] = useMemo(() => {
    const ranked = [...entries]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, config.limit);
    const out: HeatmapCell[] = [];
    for (const coin of ranked) {
      for (const window of WINDOWS) {
        const value = coin.changePct[window];
        if (!Number.isFinite(value)) continue;
        out.push({
          id: `${coin.symbol}-${window}`,
          row: coin.symbol,
          column: window,
          value,
        });
      }
    }
    return out;
  }, [entries, config.limit]);

  if (isLoading) return <FrameStatus loading>loading momentum…</FrameStatus>;
  if (cells.length === 0) return <FrameStatus>no momentum data yet</FrameStatus>;

  return (
    <HeatmapChart<HeatmapCell>
      data={cells}
      CellComponent={Cell}
      gap={3}
      showLabels
      rowLabelWidth={48}
      columnLabelHeight={20}
    />
  );
}

export const coinMomentumHeatmapFrame = defineFrame({
  ...coinMomentumHeatmapMeta,
  component: CoinMomentumHeatmap,
});
