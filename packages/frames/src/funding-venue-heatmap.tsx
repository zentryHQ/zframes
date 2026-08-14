import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useFundingComparison } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatFundingPct, formatPct } from "./format";
import { fundingVenueHeatmapMeta } from "./schemas";
import { FrameStatus, cellLabelFits } from "./ui";

const schema = fundingVenueHeatmapMeta.schema;

interface VenueCell extends HeatmapCell {
  annualizedPct: number;
  /** Raw rate for the venue's own funding interval, decimal. */
  rawRate: number;
  /** That interval in hours — 1h on Hyperliquid, 8h on Binance/Bybit. */
  intervalHours: number;
  /** The coin's max−min annualized funding across venues, percentage points. */
  spreadPct: number;
}

function Cell({
  data,
  width,
  height,
}: {
  data: VenueCell;
  width: number;
  height: number;
}) {
  if (!cellLabelFits(width, height, 44)) return null;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="caption text-normal tabular-nums">
        {formatPct(data.annualizedPct, 1)}
      </span>
    </div>
  );
}

function FundingVenueHeatmap({ config }: { config: z.output<typeof schema> }) {
  const { comparison, isLoading } = useFundingComparison();

  const cells: VenueCell[] = useMemo(() => {
    const top = [...comparison]
      .sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct))
      .slice(0, config.limit);
    const out: VenueCell[] = [];
    for (const entry of top) {
      for (const venue of entry.venues) {
        out.push({
          id: `${entry.coin}-${venue.venue}`,
          row: entry.coin,
          column: venue.venue,
          value: venue.annualizedPct,
          annualizedPct: venue.annualizedPct,
          rawRate: venue.rawRate,
          intervalHours: venue.intervalHours,
          spreadPct: entry.spreadPct,
        });
      }
    }
    return out;
  }, [comparison, config.limit]);

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (cells.length === 0) return <FrameStatus>no funding data</FrameStatus>;

  return (
    <HeatmapChart<VenueCell>
      data={cells}
      CellComponent={Cell}
      gap={3}
      showLabels
      rowLabelWidth={48}
      columnLabelHeight={20}
      formatTooltip={(cell) => ({
        title: `${cell.row} · ${cell.column}`,
        rows: [
          {
            label: "annualized",
            value: formatPct(cell.annualizedPct, 1),
            color: changeColor(cell.annualizedPct),
          },
          {
            label: `${cell.intervalHours}h rate`,
            value: formatFundingPct(cell.rawRate * 100),
          },
        ],
        footer: `cross-venue spread ${formatPct(cell.spreadPct, 1)}`,
      })}
    />
  );
}

export const fundingVenueHeatmapFrame = defineFrame({
  ...fundingVenueHeatmapMeta,
  component: FundingVenueHeatmap,
});
