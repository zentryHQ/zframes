import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { coinMomentumHeatmapMeta } from "./schemas";
import { FrameStatus, cellLabelFits } from "./ui";

const schema = coinMomentumHeatmapMeta.schema;

const WINDOWS = ["1h", "24h", "7d", "30d"] as const;

function Cell({
  data,
  width,
  height,
}: {
  data: HeatmapCell;
  width: number;
  height: number;
}) {
  if (!cellLabelFits(width, height, 44)) return null;
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
  /** symbol → coin, so a hovered cell can name its row and its mcap rank. */
  const bySymbol = useMemo(
    () => new Map(entries.map((coin) => [coin.symbol, coin] as const)),
    [entries],
  );

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
  if (cells.length === 0)
    return <FrameStatus>no momentum data yet</FrameStatus>;

  return (
    <HeatmapChart<HeatmapCell>
      data={cells}
      CellComponent={Cell}
      gap={3}
      showLabels
      rowLabelWidth={48}
      columnLabelHeight={20}
      // Deliberately money-free: this frame is on the NO_MONEY list in
      // `frame-content-smoke` because every cell is a per-window change %.
      // Price and market cap belong to a quote card, and putting them here would
      // quietly widen the frame's contract into a currency-bearing one — the
      // rank footer gives the same "how big is this coin" context without a
      // figure that would then need converting.
      formatTooltip={(cell) => {
        const coin = bySymbol.get(cell.row);
        return {
          title: coin ? `${coin.symbol} · ${coin.name}` : cell.row,
          rows: [
            {
              label: cell.column,
              value: formatChangePct(cell.value),
              color: changeColor(cell.value),
            },
          ],
          footer: coin ? `rank #${coin.rank} by mcap` : undefined,
        };
      }}
    />
  );
}

export const coinMomentumHeatmapFrame = defineFrame({
  ...coinMomentumHeatmapMeta,
  component: CoinMomentumHeatmap,
});
