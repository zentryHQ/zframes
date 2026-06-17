import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useFundingHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { fundingHeatmapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fundingHeatmapMeta.schema;

const BUCKET_MS = 4 * 60 * 60 * 1000; // 4h buckets over a 3-day window
const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

interface FundingCell extends HeatmapCell {
  /** Average funding rate for the bucket, as a decimal fraction. */
  rate: number;
}

function Cell({ data, width }: { data: FundingCell; width: number }) {
  if (width < 44) return null;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="text-[10px] font-medium text-white/90 tabular-nums">
        {(data.rate * 100).toFixed(4)}%
      </span>
    </div>
  );
}

function FundingHeatmap({ config }: { config: z.output<typeof schema> }) {
  const startTimeMs = useMemo(() => Date.now() - WINDOW_MS, []);
  const { history, isLoading } = useFundingHistory(config.symbols, startTimeMs);

  const cells: FundingCell[] = useMemo(() => {
    const out: FundingCell[] = [];
    for (const symbol of config.symbols) {
      const points = history[symbol] ?? [];
      const buckets = new Map<number, { sum: number; n: number }>();
      for (const point of points) {
        const bucket = Math.floor(point.time / BUCKET_MS) * BUCKET_MS;
        const entry = buckets.get(bucket) ?? { sum: 0, n: 0 };
        entry.sum += point.fundingRate;
        entry.n += 1;
        buckets.set(bucket, entry);
      }
      for (const [bucket, { sum, n }] of buckets) {
        const avg = sum / n;
        const date = new Date(bucket);
        const column = `${date.toLocaleDateString("en-US", { weekday: "short" })} ${String(date.getHours()).padStart(2, "0")}h`;
        out.push({
          id: `${symbol}-${bucket}`,
          row: symbol,
          column,
          // color scale keys off this; funding is tiny so scale up
          value: avg * 10000,
          rate: avg,
        });
      }
    }
    return out;
  }, [history, config.symbols]);

  if (isLoading) return <FrameStatus loading>loading funding…</FrameStatus>;
  if (cells.length === 0) return <FrameStatus>no funding data</FrameStatus>;

  return (
    <HeatmapChart<FundingCell>
      data={cells}
      CellComponent={Cell}
      gap={3}
      showLabels
      rowLabelWidth={48}
      columnLabelHeight={20}
    />
  );
}

export const fundingHeatmapFrame = defineFrame({
  ...fundingHeatmapMeta,
  component: FundingHeatmap,
});
