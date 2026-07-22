import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useFundingComparison } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { fundingVenueHeatmapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundingVenueHeatmapMeta.schema;

interface VenueCell extends HeatmapCell {
  annualizedPct: number;
}

function Cell({ data, width }: { data: VenueCell; width: number }) {
  if (width < 44) return null;
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
    />
  );
}

export const fundingVenueHeatmapFrame = defineFrame({
  ...fundingVenueHeatmapMeta,
  component: FundingVenueHeatmap,
});
