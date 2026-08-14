import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useMoney, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatPct } from "./format";
import { optionsOiLadderHeatmapMeta } from "./schemas";
import { FrameStatus, cellLabelFits } from "./ui";

const schema = optionsOiLadderHeatmapMeta.schema;

interface OiCell extends HeatmapCell {
  /** Total call+put open interest bucketed into this cell (contracts). */
  oi: number;
}

function Cell({
  data,
  width,
  height,
}: {
  data: OiCell;
  width: number;
  height: number;
}) {
  if (!cellLabelFits(width, height, 44)) return null;
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
  const money = useMoney();
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
      money.magnitude(min + ((i + 0.5) / buckets) * span);

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
  }, [summary, config.expiries, config.buckets, money]);

  // Denominator for a cell's share of the whole shown ladder — the reading the
  // shade only hints at ("is this band actually where positioning sits?").
  const totalOi = cells.reduce((sum, c) => sum + c.oi, 0);

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
      formatTooltip={(cell) => ({
        title: `${cell.row} · ${cell.column}`,
        rows: [
          { label: "OI", value: `${formatCompact(cell.oi)} contracts` },
          // Spot is what makes the strike band readable as ITM/OTM; omitted
          // rather than shown as zero if the snapshot carries no underlying.
          ...(summary?.underlyingPrice
            ? [{ label: "spot", value: money.price(summary.underlyingPrice) }]
            : []),
        ],
        footer:
          totalOi > 0
            ? `${formatPct((cell.oi / totalOi) * 100, 1)} of shown OI`
            : undefined,
      })}
    />
  );
}

export const optionsOiLadderHeatmapFrame = defineFrame({
  ...optionsOiLadderHeatmapMeta,
  component: OptionsOiLadderHeatmap,
  titleContent: ({ config }) => <>{config.currency} · OI Ladder</>,
});
