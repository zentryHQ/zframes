import { HeatmapChart, type CellComponentProps } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { DOWN_COLOR, UP_COLOR, changeColor, formatChangePct } from "./format";
import {
  MONTH_LABELS,
  metalName,
  monthlyReturns,
  sliceYears,
} from "./metals-shared";
import { metalSeasonalityMeta } from "./schemas";
import { FrameStatus, cellLabelFits } from "./ui";

const schema = metalSeasonalityMeta.schema;

/** Width of the year gutter — a four-digit year at caption size plus the
 *  label's own pr-2. Shared with the averages strip so its columns land under
 *  the grid's. Sized to fit "2024" outright: one glyph short and every row
 *  reads "20…", which is no label at all. */
const YEAR_LABEL_WIDTH = 44;
const CELL_GAP = 3;

/** Below this the cell is too small to hold "+12.34%" without clipping, so the
 *  colour alone carries the month and the grid stays legible. The height floor
 *  is shared — see `cellLabelFits`. */
const MIN_LABEL_WIDTH = 46;

/** Per-column widths at which the averages strip can still print each form
 *  without ellipsing. `+1.23%` needs ~40px at caption size; below that the sign
 *  and the unit are dropped in that order — the colour already carries the sign,
 *  and the row is labelled "avg" of a percent grid, so the `%` is redundant
 *  before the digits are. Under the last threshold the strip is dropped
 *  entirely: a row of `+…` is not a number, it's noise. */
const AVG_FULL_WIDTH = 40;
const AVG_SHORT_WIDTH = 26;
const AVG_MIN_WIDTH = 18;

/** Observed content-box width of an element, 0 until first measure. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.offsetWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface SeasonCell {
  id: string;
  row: string;
  column: string;
  /** Month-end to month-end return, in percent. */
  value: number;
}

function SeasonalityCell({
  data,
  width,
  height,
  colorIntensity,
  isPositive,
}: CellComponentProps<SeasonCell>) {
  return (
    <div className="relative h-full w-full">
      {/* The heatmap's built-in ramp is a fixed green/red that can't follow a
          custom theme.upColor/downColor, so the semantic pair is laid over it,
          weighted by the cell's own magnitude: a flat month stays dark, the
          extremes read at full strength. */}
      <span
        className="absolute inset-0 rounded"
        style={{
          background: isPositive ? UP_COLOR : DOWN_COLOR,
          opacity: 0.18 + colorIntensity * 0.82,
        }}
      />
      {cellLabelFits(width, height, MIN_LABEL_WIDTH) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="caption text-strong tabular-nums">
            {formatChangePct(data.value)}
          </span>
        </span>
      )}
    </div>
  );
}

function MetalSeasonality({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);
  const [stripRef, stripWidth] = useWidth<HTMLDivElement>();

  const { cells, months, monthMeans, openId, rowCount } = useMemo(() => {
    const windowed = sliceYears(histories[0]?.points ?? [], config.years);
    const returns = monthlyReturns(windowed);

    // Group by calendar year so the grid can be emitted deliberately: the
    // heatmap derives row/column order from first occurrence, so cells are
    // written month-major (Jan→Dec columns, years ascending inside each month).
    const byYear = new Map<number, Map<number, number>>();
    for (const r of returns) {
      const row = byYear.get(r.year) ?? new Map<number, number>();
      row.set(r.month, r.pct);
      byYear.set(r.year, row);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    // A leading partial year has no January, which would drop its row out of
    // chronological order under month-major emission — and half a year is not a
    // seasonal observation anyway.
    if (years.length > 1 && (byYear.get(years[0])?.size ?? 0) < 12)
      years.shift();

    const present = MONTH_LABELS.map((_, month) =>
      years.some((year) => byYear.get(year)?.has(month)),
    );
    const monthIndexes = MONTH_LABELS.map((_, i) => i).filter(
      (i) => present[i],
    );

    // `monthlyReturns` closes every month on its last available fix, so the
    // newest entry is month-TO-DATE until that month actually ends. It stays in
    // the grid (it's the topical cell) but is held out of the long-run average,
    // which is the seasonal signal the strip exists for and would otherwise be
    // pulled by a three-day "month".
    const open = returns[returns.length - 1];

    const out: SeasonCell[] = [];
    const means: { label: string; pct: number | null }[] = [];
    for (const month of monthIndexes) {
      let sum = 0;
      let n = 0;
      for (const year of years) {
        const pct = byYear.get(year)?.get(month);
        if (pct === undefined) continue;
        out.push({
          id: `${year}-${month}`,
          row: String(year),
          column: MONTH_LABELS[month],
          value: pct,
        });
        if (open && open.year === year && open.month === month) continue;
        sum += pct;
        n += 1;
      }
      // Null, not 0: a month whose only observation is the running one has no
      // average yet, and printing "+0.00%" would read as "flat, historically".
      means.push({ label: MONTH_LABELS[month], pct: n > 0 ? sum / n : null });
    }

    return {
      cells: out,
      months: monthIndexes.length,
      monthMeans: means,
      // The running month's cell id, so its tooltip can say the return is
      // month-to-date — the grid draws it identically to a closed month.
      openId: open ? `${open.year}-${open.month}` : null,
      rowCount: years.length,
    };
  }, [histories, config.years]);

  if (isLoading)
    return <FrameStatus loading>loading monthly returns…</FrameStatus>;
  if (cells.length === 0)
    return <FrameStatus>no monthly returns yet</FrameStatus>;

  // The measured box spans the year gutter too, so the gutter comes off before
  // the remainder is split into month columns.
  const gridWidth = Math.max(0, stripWidth - YEAR_LABEL_WIDTH);
  const columnWidth =
    months > 0 && gridWidth > 0
      ? (gridWidth - CELL_GAP * (months - 1)) / months
      : 0;
  const showAvg = stripWidth === 0 || columnWidth >= AVG_MIN_WIDTH;
  const formatAvg = (pct: number) => {
    if (columnWidth === 0 || columnWidth >= AVG_FULL_WIDTH)
      return formatChangePct(pct);
    if (columnWidth >= AVG_SHORT_WIDTH)
      return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}`;
    return Math.abs(pct).toFixed(1);
  };

  return (
    <ChartCard gap={1.5}>
      <ChartCard.Body>
        <HeatmapChart<SeasonCell>
          data={cells}
          CellComponent={SeasonalityCell}
          gap={CELL_GAP}
          showLabels
          rowLabelWidth={YEAR_LABEL_WIDTH}
          columnLabelHeight={18}
          formatTooltip={(cell) => {
            const mean =
              monthMeans.find((m) => m.label === cell.column)?.pct ?? null;
            return {
              title: `${metalName(config.symbol)} · ${cell.column} ${cell.row}`,
              rows: [
                {
                  label: "return",
                  value: formatChangePct(cell.value),
                  color: changeColor(cell.value),
                },
                {
                  label: "avg",
                  value: mean === null ? "–" : formatChangePct(mean),
                },
              ],
              footer:
                cell.id === openId
                  ? `month to date · not in the ${cell.column} avg`
                  : `${cell.column} avg across ${rowCount}y`,
            };
          }}
        />
      </ChartCard.Body>

      {/* Each month's mean across the window — the seasonal signal the grid is
          read for, aligned column-for-column underneath it. Hidden outright once
          its columns are too narrow to hold even a one-decimal figure. */}
      {/* The measured box stays mounted even when the strip is hidden — measuring
          the strip itself would freeze its last width at the moment it
          disappeared, so a resize back to a wide card could never bring it
          back. */}
      <div ref={stripRef}>
        {showAvg && (
          <div className="flex items-center border-t border-white/[0.08] pt-1.5">
            <span
              className="caption text-soft shrink-0 pr-2 text-right"
              style={{ width: YEAR_LABEL_WIDTH }}
            >
              avg
            </span>
            <div
              className="grid min-w-0 flex-1"
              style={{
                gap: CELL_GAP,
                gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))`,
              }}
            >
              {monthMeans.map((mean) => (
                <span
                  key={mean.label}
                  className={`caption overflow-hidden text-center tabular-nums${
                    mean.pct === null ? " text-soft" : ""
                  }`}
                  style={
                    mean.pct === null
                      ? undefined
                      : { color: changeColor(mean.pct) }
                  }
                >
                  {mean.pct === null ? "–" : formatAvg(mean.pct)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The row count, not config.years: a leading partial year is dropped, and
          platinum/palladium fixes only start in 1990, so the grid regularly
          spans fewer years than were asked for. */}
      <ChartCard.Caption>
        {metalName(config.symbol)} · monthly returns · {rowCount}y
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalSeasonalityFrame = defineFrame({
  ...metalSeasonalityMeta,
  component: MetalSeasonality,
});
