import { HeatmapChart, type CellComponentProps } from "@zframes/charts";
import { defineFrame, useMetalHistory, type SeriesPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, DOWN_COLOR, formatPct, UP_COLOR } from "./format";
import {
  alignSeries,
  correlation,
  metalName,
  simpleReturns,
  sliceYears,
} from "./metals-shared";
import { metalsCorrelationMeta } from "./schemas";
import { FrameStatus, cellLabelFits } from "./ui";

const schema = metalsCorrelationMeta.schema;

/** The four metals the LBMA fixes daily — module-level so the hook's symbol key
 *  is stable across renders. */
const MATRIX_METALS = ["XAU", "XAG", "XPT", "XPD"] as const;

/** A coefficient needs ~26px; under that the tint alone carries the cell. */
const MIN_LABEL_WIDTH = 30;

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** A correlation coefficient is a unit-less -1…1 multiple, so none of `./format`
 *  fits: it is neither a percentage (formatPct) nor a signed delta
 *  (formatChangePct) nor an FX rate (formatRate). Two decimals is how the desk
 *  quotes it ("0.87"). */
const formatCoefficient = (value: number) => value.toFixed(2);

interface CorrelationCell {
  id: string;
  row: string;
  column: string;
  /** Pearson correlation of the two metals' daily returns, -1…1. */
  value: number;
  /** False when the pair shares too few trading days to correlate at all. */
  measured: boolean;
}

function MatrixCell({
  data,
  width,
  height,
  colorIntensity,
  isPositive,
}: CellComponentProps<CorrelationCell>) {
  return (
    <div className="relative h-full w-full">
      {data.measured ? (
        /* Positive co-movement reads as the semantic up colour, negative as
           down; the heatmap's own ramp can't follow a custom up/down pair, so it
           is overlaid here, weighted by the coefficient's rank in the matrix. */
        <span
          className="absolute inset-0 rounded"
          style={{
            background: isPositive ? UP_COLOR : DOWN_COLOR,
            opacity: 0.18 + colorIntensity * 0.82,
          }}
        />
      ) : (
        /* Unmeasurable pairs are knocked back to neutral over the heatmap's own
           ramp — a tinted "0.00" would read as "measured, and uncorrelated". */
        <span className="absolute inset-0 rounded bg-black/55" />
      )}
      {cellLabelFits(width, height, MIN_LABEL_WIDTH) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={`caption tabular-nums ${
              data.measured ? "text-strong" : "text-soft"
            }`}
          >
            {data.measured ? formatCoefficient(data.value) : "–"}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * Correlation of two fix series' daily returns. The legs are day-aligned first:
 * the LBMA skips slightly different holidays per metal, so an index-wise zip
 * would quietly pair a Tuesday move with a Thursday one.
 */
function returnCorrelation(
  a: readonly SeriesPoint[],
  b: readonly SeriesPoint[],
): number | null {
  const aligned = alignSeries(a, b);
  // Null, not 0 — two series that never traded on the same day have no
  // correlation to report, and 0 would claim they move independently.
  if (aligned.length < 3) return null;
  return correlation(
    simpleReturns(aligned.map((p) => ({ time: p.time, value: p.a }))),
    simpleReturns(aligned.map((p) => ({ time: p.time, value: p.b }))),
  );
}

function MetalsCorrelation({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory(MATRIX_METALS);

  const { cells, spanYears } = useMemo(() => {
    const windows = new Map<string, SeriesPoint[]>();
    for (const history of histories) {
      const windowed = sliceYears(history.points, config.years);
      if (windowed.length > 2) windows.set(history.symbol, windowed);
    }
    // Keep the declared order so the matrix always reads gold→palladium, and
    // drop any metal whose fixes don't reach into the window at all.
    const symbols = MATRIX_METALS.filter((s) => windows.has(s));
    if (symbols.length < 2)
      return { cells: [] as CorrelationCell[], spanYears: 0 };

    // The window asked for isn't always the window that exists: the LBMA has
    // fixed gold and silver since 1968 but platinum and palladium only since
    // 1990, so a 20y ask measures those pairs over what they actually have.
    // Report the measured span rather than parroting the config.
    let start = -Infinity;
    let end = -Infinity;
    for (const symbol of symbols) {
      const points = windows.get(symbol);
      if (!points || points.length === 0) continue;
      start = Math.max(start, points[0].time);
      end = Math.max(end, points[points.length - 1].time);
    }

    // Each unordered pair is measured once and mirrored across the diagonal.
    const pairs = new Map<string, number | null>();
    const out: CorrelationCell[] = [];
    for (const row of symbols) {
      const rowPoints = windows.get(row) ?? [];
      for (const column of symbols) {
        let value: number | null = 1;
        if (row !== column) {
          const key = [row, column].sort().join("|");
          value = pairs.has(key)
            ? (pairs.get(key) ?? null)
            : returnCorrelation(rowPoints, windows.get(column) ?? []);
          pairs.set(key, value);
        }
        out.push({
          id: `${row}-${column}`,
          row: metalName(row),
          column: metalName(column),
          value: value ?? 0,
          measured: value !== null,
        });
      }
    }
    return {
      cells: out,
      spanYears: Math.max(1, Math.round((end - start) / YEAR_MS)),
    };
  }, [histories, config.years]);

  if (isLoading) return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (cells.length === 0)
    return <FrameStatus>not enough fix history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="min-h-0 flex-1">
        <HeatmapChart<CorrelationCell>
          data={cells}
          CellComponent={MatrixCell}
          gap={3}
          showLabels
          rowLabelWidth={62}
          columnLabelHeight={18}
          formatTooltip={(cell) => {
            const pair = `${cell.row} · ${cell.column}`;
            // Same "–" the cell prints, so hovering an unmeasurable pair
            // explains the dash rather than inventing a number for it.
            if (!cell.measured)
              return {
                title: pair,
                rows: [{ label: "correlation", value: "–" }],
                footer: "too few shared fix days",
              };
            const coefficient = {
              label: "correlation",
              value: formatCoefficient(cell.value),
              // The tint is the cell's own reading (up = co-movement), which the
              // two-decimal number alone doesn't carry at a glance.
              color: changeColor(cell.value),
            };
            if (cell.row === cell.column)
              return {
                title: cell.row,
                rows: [coefficient],
                footer: "same metal",
              };
            return {
              title: pair,
              rows: [
                coefficient,
                // r² — the share of one metal's daily moves the other explains.
                // Whole percent: two decimals would out-precision the 0.87 above it.
                {
                  label: "r²",
                  value: formatPct(cell.value * cell.value * 100, 0),
                },
              ],
              footer: `daily returns · ${spanYears}y window`,
            };
          }}
        />
      </div>
      <div className="caption text-soft text-center">
        daily-return correlation · {spanYears}y window
      </div>
    </div>
  );
}

export const metalsCorrelationFrame = defineFrame({
  ...metalsCorrelationMeta,
  component: MetalsCorrelation,
});
