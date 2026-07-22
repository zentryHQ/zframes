import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact } from "./format";
import { optionsOiLadderHeatmapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsOiLadderHeatmapMeta.schema;

interface OiCell extends HeatmapCell {
  /** Total call+put open interest bucketed into this cell (contracts). */
  oi: number;
}

function Cell({ data, width }: { data: OiCell; width: number }) {
  if (width < 44) return null;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="caption text-normal tabular-nums">
        {formatCompact(data.oi)}
      </span>
    </div>
  );
}

function OptionsOiLadderHeatmap({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  const cells: OiCell[] = useMemo(() => {
    const expiries = summary?.allExpiries;
    if (!expiries || expiries.length === 0) return [];
    // Nearest N expiries, chronological, so rows read as a term-structure
    // ladder rather than an arbitrary listing order.
    const nearest = [...expiries]
      .sort((a, b) => a.expiryMs - b.expiryMs)
      .slice(0, config.expiries);

    // One shared strike-bucket grid across every shown expiry, so a column
    // means the same price band in every row.
    const allStrikes = nearest.flatMap((e) => e.strikes.map((s) => s.strike));
    if (allStrikes.length === 0) return [];
    const min = Math.min(...allStrikes);
    const max = Math.max(...allStrikes);
    const span = Math.max(max - min, 1e-6);
    const buckets = config.buckets;
    const bucketOf = (strike: number) =>
      Math.min(buckets - 1, Math.floor(((strike - min) / span) * buckets));
    const bucketLabel = (i: number) =>
      formatCompact(min + ((i + 0.5) / buckets) * span);

    const out: OiCell[] = [];
    for (const e of nearest) {
      const sums = new Array<number>(buckets).fill(0);
      for (const s of e.strikes) sums[bucketOf(s.strike)] += s.callOi + s.putOi;
      for (let i = 0; i < buckets; i++) {
        out.push({
          id: `${e.expiry}-${i}`,
          row: e.expiry,
          column: bucketLabel(i),
          value: sums[i],
          oi: sums[i],
        });
      }
    }
    return out;
  }, [summary, config.expiries, config.buckets]);

  if (isLoading) return <FrameStatus loading>loading OI ladder…</FrameStatus>;
  if (cells.length === 0) return <FrameStatus>no options data yet</FrameStatus>;

  return (
    <HeatmapChart<OiCell>
      data={cells}
      CellComponent={Cell}
      gap={3}
      showLabels
      rowLabelWidth={64}
      columnLabelHeight={20}
    />
  );
}

export const optionsOiLadderHeatmapFrame = defineFrame({
  ...optionsOiLadderHeatmapMeta,
  component: OptionsOiLadderHeatmap,
});
