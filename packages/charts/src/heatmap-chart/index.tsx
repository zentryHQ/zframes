"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  CHART_TOOLTIP_ATTR,
  chartTooltipLabel,
  delegateChartTooltip,
  type ChartTooltipContent,
} from "../lib/chart-tooltip";
import { observeResize } from "../lib/observe-resize";
import { cn, prefersReducedMotion } from "../lib/utils";

/**
 * Base interface for heatmap cells.
 * Extend this interface with additional fields for your specific use case.
 */
export interface HeatmapCell {
  id: string;
  row: string;
  column: string;
  value: number;
}

/**
 * Props passed to the CellComponent render prop.
 */
export interface CellComponentProps<T> {
  width: number;
  height: number;
  data: T;
  rowIndex: number;
  columnIndex: number;
  colorIntensity: number;
  isPositive: boolean;
}

export interface HeatmapChartProps<T extends HeatmapCell> {
  data: T[];
  className?: string;
  CellComponent: (props: CellComponentProps<T>) => React.ReactNode;
  getColorValue?: (data: T) => number;
  gap?: number;
  showLabels?: boolean;
  rowLabelWidth?: number;
  columnLabelHeight?: number;
  /**
   * Hover-tooltip content for a cell. Return `null` to give that cell no
   * tooltip. A frame should pass this: the default can only print the raw
   * `value`, and a heatmap's numbers are almost always in units the frame knows
   * and this chart does not (percent, $, bps, funding per 8h).
   */
  formatTooltip?: (data: T) => ChartTooltipContent | null;
}

const CELL_BORDER_RADIUS = "4px";
const DEFAULT_GAP = 6;
const DEFAULT_ROW_LABEL_WIDTH = 80;
const DEFAULT_COLUMN_LABEL_HEIGHT = 24;

/**
 * Fallback tooltip content, built from the `HeatmapCell` fields every cell is
 * guaranteed to carry.
 *
 * Row and column are joined with a middot, not a slash: these matrices routinely
 * put an interval or a numeric bucket on one axis, and "BTC / 8h" reads as a rate
 * rather than as a coordinate. A middot reads as a pairing either way round.
 */
const DEFAULT_FORMAT_TOOLTIP = (data: HeatmapCell): ChartTooltipContent => ({
  title: `${data.row} · ${data.column}`,
  rows: [{ value: String(data.value) }],
});

/**
 * Intro (entrance) animation. On the FIRST draw only, cells fade + scale in on a
 * diagonal stagger from the top-left corner, so the grid visibly assembles when
 * the card first appears. This is a React/CSS transition, not d3 — the grid is
 * plain absolutely-positioned divs. Labels never animate (this repo animates
 * data marks only).
 *
 * The stagger is normalised over the grid's OWN diagonal rather than applied as a
 * fixed per-cell increment, so a 300-cell heatmap finishes in the same ~800ms a
 * 16-cell one does instead of turning into a multi-second show.
 */
const INTRO_CELL_MS = 420;
const INTRO_STAGGER_MS = 380;
/** Time from the flip-to-final until the last (most-delayed) cell has landed. */
const INTRO_SETTLE_MS = INTRO_CELL_MS + INTRO_STAGGER_MS + 80;
const INTRO_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"; // easeCubicOut
const INTRO_START_SCALE = 0.92;

/**
 * `pending` = cells mounted at their start values, `running` = transitioning to
 * the final state, `done` = no intro styles emitted at all. The stage only ever
 * moves forward, which is what makes every later redraw (data poll, resize, prop
 * or theme change) an instant no-op.
 */
type IntroStage = "pending" | "running" | "done";

const EMPTY_STYLE: React.CSSProperties = {};

/**
 * The intro half of a cell's inline style, by stage. `diagonal` is
 * `rowIndex + columnIndex`; `maxDiagonal` normalises it so the whole grid's
 * stagger always spans exactly INTRO_STAGGER_MS.
 *
 * Only `opacity` and `transform` move — never `left`/`top`/`width`/`height`, so a
 * resize mid-intro repositions cells instantly instead of sliding them.
 */
function introCellStyle(
  stage: IntroStage,
  diagonal: number,
  maxDiagonal: number,
): React.CSSProperties {
  if (stage === "done") return EMPTY_STYLE;
  if (stage === "pending") {
    return {
      opacity: 0,
      transform: `scale(${INTRO_START_SCALE})`,
      willChange: "opacity, transform",
    };
  }
  const delay =
    maxDiagonal > 0
      ? Math.round((diagonal / maxDiagonal) * INTRO_STAGGER_MS)
      : 0;
  return {
    opacity: 1,
    // scale(1), not `none` — an explicit identity scale interpolates from
    // scale(0.92) everywhere, and reads the same as the `done` stage's absent key.
    transform: "scale(1)",
    willChange: "opacity, transform",
    transition:
      `opacity ${INTRO_CELL_MS}ms ${INTRO_EASE} ${delay}ms, ` +
      `transform ${INTRO_CELL_MS}ms ${INTRO_EASE} ${delay}ms`,
  };
}

/**
 * HeatmapChart - A generic, implementation-agnostic heatmap visualization.
 *
 * Uses the composition pattern with a CellComponent render prop for custom cell rendering.
 * The component handles layout, color scaling, and responsive sizing.
 *
 * Cells play a one-shot intro on the first draw (see INTRO_* above); later
 * redraws — data polls, resizes, prop/theme changes — paint instantly.
 *
 * Each cell hovers a shared tooltip through one delegated listener on the grid;
 * pass `formatTooltip` to put the frame's own units in it.
 *
 * @example
 * ```tsx
 * interface MyData extends HeatmapCell {
 *   projectName: string;
 *   correlationScore: number;
 * }
 *
 * <HeatmapChart<MyData>
 *   data={myData}
 *   CellComponent={({ data, colorIntensity, isPositive }) => (
 *     <div className="flex items-center justify-center h-full">
 *       {data.correlationScore.toFixed(2)}
 *     </div>
 *   )}
 *   getColorValue={(d) => d.correlationScore}
 * />
 * ```
 */
function HeatmapChartInner<T extends HeatmapCell>({
  data,
  className,
  CellComponent,
  getColorValue,
  gap = DEFAULT_GAP,
  showLabels = false,
  rowLabelWidth = DEFAULT_ROW_LABEL_WIDTH,
  columnLabelHeight = DEFAULT_COLUMN_LABEL_HEIGHT,
  formatTooltip = DEFAULT_FORMAT_TOOLTIP,
}: HeatmapChartProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();
  const [dimension, setDimension] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Under reduce the stage starts at "done", so the grid paints its final state
  // instantly and no transition is ever scheduled. `prefers-reduced-motion` is
  // read once here, in the initialiser — unlike the d3 charts, which re-read it
  // per draw via `useChartIntro`. The difference only shows if the OS setting is
  // toggled mid-session: those charts pick it up on their next redraw, this grid
  // keeps the stage it started with. Its intro is a one-shot React state machine
  // rather than a per-draw gate, so there is nowhere later to re-read it.
  const [introStage, setIntroStage] = useState<IntroStage>(() =>
    prefersReducedMotion() ? "done" : "pending",
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResize(container, () => {
      startTransition(() => {
        setDimension((prev) =>
          prev.width === container.offsetWidth &&
          prev.height === container.offsetHeight
            ? prev
            : {
                width: container.offsetWidth,
                height: container.offsetHeight,
              },
        );
      });
    });
  }, []);

  // Extract unique rows and columns, preserving order of first occurrence
  const { uniqueRows, uniqueColumns, rowToIndex, columnToIndex } =
    useMemo(() => {
      const rowsSet = new Set<string>();
      const columnsSet = new Set<string>();
      const rows: string[] = [];
      const columns: string[] = [];

      for (const cell of data) {
        if (!rowsSet.has(cell.row)) {
          rowsSet.add(cell.row);
          rows.push(cell.row);
        }
        if (!columnsSet.has(cell.column)) {
          columnsSet.add(cell.column);
          columns.push(cell.column);
        }
      }

      const rowMap = new Map(rows.map((r, i) => [r, i]));
      const columnMap = new Map(columns.map((c, i) => [c, i]));

      return {
        uniqueRows: rows,
        uniqueColumns: columns,
        rowToIndex: rowMap,
        columnToIndex: columnMap,
      };
    }, [data]);

  // Calculate chart area dimensions (excluding labels)
  const chartArea = useMemo(() => {
    const labelOffsetX = showLabels ? rowLabelWidth : 0;
    const labelOffsetY = showLabels ? columnLabelHeight : 0;

    return {
      x: labelOffsetX,
      y: labelOffsetY,
      width: Math.max(0, dimension.width - labelOffsetX),
      height: Math.max(0, dimension.height - labelOffsetY),
    };
  }, [dimension, showLabels, rowLabelWidth, columnLabelHeight]);

  // Fixed-pixel grid layout. A d3 scaleBand only takes a padding *ratio*, which
  // yields different pixel gaps on each axis whenever cells aren't square (e.g.
  // a 2-row × 8-col funding map ends up with wider column gaps than row gaps).
  // Computing cell size directly keeps the gap a uniform `gap` px both ways.
  const layout = useMemo(() => {
    const numColumns = uniqueColumns.length;
    const numRows = uniqueRows.length;

    const cellWidth =
      numColumns > 0
        ? Math.max(0, (chartArea.width - gap * (numColumns - 1)) / numColumns)
        : 0;
    const cellHeight =
      numRows > 0
        ? Math.max(0, (chartArea.height - gap * (numRows - 1)) / numRows)
        : 0;

    const columnX = (index: number) => index * (cellWidth + gap);
    const rowY = (index: number) => index * (cellHeight + gap);

    return { cellWidth, cellHeight, columnX, rowY };
  }, [uniqueRows.length, uniqueColumns.length, chartArea, gap]);

  // Calculate color intensity for each cell
  const cellsWithColors = useMemo(() => {
    const colorValues = data.map((cell) =>
      getColorValue ? getColorValue(cell) : cell.value,
    );

    const positiveValues = colorValues.filter((c) => c >= 0);
    const negativeValues = colorValues.filter((c) => c < 0);

    const positiveMin =
      positiveValues.length > 0 ? Math.min(...positiveValues) : 0;
    const positiveMax =
      positiveValues.length > 0 ? Math.max(...positiveValues) : 0;
    const negativeMin =
      negativeValues.length > 0 ? Math.min(...negativeValues) : 0;
    const negativeMax =
      negativeValues.length > 0 ? Math.max(...negativeValues) : 0;

    const getColorIntensity = (colorValue: number): number => {
      if (colorValue < 0) {
        if (negativeMax === negativeMin) return 1;
        return (colorValue - negativeMax) / (negativeMin - negativeMax);
      } else {
        if (positiveMax === positiveMin) return 1;
        return (colorValue - positiveMin) / (positiveMax - positiveMin);
      }
    };

    return data.map((cell) => {
      const colorValue = getColorValue ? getColorValue(cell) : cell.value;
      const intensity = getColorIntensity(colorValue);
      const isPositive = colorValue >= 0;

      return {
        cell,
        colorValue,
        intensity,
        isPositive,
      };
    });
  }, [data, getColorValue]);

  // Diverging up/down ramp, tuned for a dark indigo ground (matches tree-chart).
  // Down uses a crimson hue that stays red even when dark — orange-reds (hue ~4)
  // turn muddy brown at low lightness; up uses a calm emerald, not neon mint.
  const getCellColor = (intensity: number, isPositive: boolean): string => {
    if (isPositive) {
      const l = Math.round(34 + intensity * 16); // 34% → 50%
      const s = Math.round(42 + intensity * 20); // 42% → 62%
      return `hsl(152 ${s}% ${l}%)`;
    }
    const l = Math.round(36 + intensity * 15); // 36% → 51%
    const s = Math.round(48 + intensity * 22); // 48% → 70%
    return `hsl(350 ${s}% ${l}%)`;
  };

  // Longest diagonal in the grid — the divisor that keeps the stagger's total
  // span fixed however many cells there are.
  const introMaxDiagonal = Math.max(
    0,
    uniqueRows.length - 1 + (uniqueColumns.length - 1),
  );

  // Render cells
  const memoizedCells = useMemo(() => {
    const { cellWidth, cellHeight, columnX, rowY } = layout;
    if (cellWidth <= 0 || cellHeight <= 0) return null;

    return cellsWithColors.map(({ cell, intensity, isPositive }) => {
      const rowIndex = rowToIndex.get(cell.row);
      const columnIndex = columnToIndex.get(cell.column);
      if (rowIndex === undefined || columnIndex === undefined) return null;

      const baseColor = getCellColor(intensity, isPositive);
      const introStyle = introCellStyle(
        introStage,
        rowIndex + columnIndex,
        introMaxDiagonal,
      );

      return (
        <div
          key={cell.id}
          // The cell's key for the delegated tooltip listener below — a plain
          // string attribute, so a 300-cell grid re-renders without allocating a
          // handler per cell.
          {...{ [CHART_TOOLTIP_ATTR]: cell.id }}
          // The hover tooltip is aria-hidden (one shared node for the whole
          // page), so the cell's reading lives here — and for a dense matrix
          // this is the only place the figure appears in the DOM at all.
          aria-label={chartTooltipLabel(formatTooltip(cell))}
          className="group absolute cursor-pointer border border-transparent hover:bg-[radial-gradient(146.13%_118.42%_at_50%_-15.5%,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_99.59%)] hover:bg-gradient-to-t"
          style={{
            left: chartArea.x + columnX(columnIndex),
            top: chartArea.y + rowY(rowIndex),
            width: cellWidth,
            height: cellHeight,
            borderRadius: CELL_BORDER_RADIUS,
            backgroundColor: baseColor,
            // Empty once the intro is done, so a redraw renders exactly the
            // markup this chart rendered before the intro existed.
            ...introStyle,
          }}
        >
          <CellComponent
            width={cellWidth}
            height={cellHeight}
            data={cell}
            rowIndex={rowIndex}
            columnIndex={columnIndex}
            colorIntensity={intensity}
            isPositive={isPositive}
          />
        </div>
      );
    });
  }, [
    cellsWithColors,
    layout,
    chartArea,
    rowToIndex,
    columnToIndex,
    CellComponent,
    introStage,
    introMaxDiagonal,
    // In the deps even though frames pass an inline arrow, so this memo now
    // rebuilds on every parent render. That is the cheaper mistake: the cells'
    // `aria-label` is the ONLY place a dense grid spells its figures out, and
    // `formatTooltip` closes over `useMoney()`, which resolves a poll AFTER
    // first paint without changing `data` — omitting it would leave every label
    // frozen at the pre-conversion USD string while the cells read correctly.
    formatTooltip,
  ]);

  // Did this render actually paint cells? Mirrors the memo's own guard: the first
  // effect runs almost always bail (dimensions are 0 until observeResize reports,
  // and data can still be loading), and the one-shot intro must not be burned by
  // a pass that painted nothing.
  const hasDrawnCells = memoizedCells !== null && memoizedCells.length > 0;

  // pending → running, one frame after the first real draw, so the browser has a
  // start value to transition FROM.
  useEffect(() => {
    if (introStage !== "pending" || !hasDrawnCells) return;
    const start = () => setIntroStage("running");
    // jsdom (and any host without rAF) falls back to a macrotask.
    if (typeof requestAnimationFrame !== "function") {
      const id = setTimeout(start, 0);
      return () => clearTimeout(id);
    }
    const id = requestAnimationFrame(start);
    return () => cancelAnimationFrame(id);
  }, [introStage, hasDrawnCells]);

  // running → done, once the last (most-delayed) cell has landed. Kept as its own
  // effect: folding it into the one above would let that effect's own cleanup
  // (fired when it flips the stage) cancel this timer and strand the intro styles.
  useEffect(() => {
    if (introStage !== "running") return;
    const id = setTimeout(() => setIntroStage("done"), INTRO_SETTLE_MS);
    return () => clearTimeout(id);
  }, [introStage]);

  // The delegated listener only knows the hovered cell's id, so it needs a way
  // back to the datum.
  const cellById = useMemo(() => {
    const map = new Map<string, T>();
    for (const cell of data) map.set(cell.id, cell);
    return map;
  }, [data]);

  /**
   * Reached through a ref rather than the effect's dep array: a frame's
   * `formatTooltip` has to be an inline arrow (it closes over `useMoney()`,
   * which only a component may call), so depending on its identity would
   * detach and re-attach the listener on every render. Synced in a layout
   * effect, before any pointer event can reach the grid.
   */
  const formatTooltipRef = useRef(formatTooltip);
  useEffect(() => {
    formatTooltipRef.current = formatTooltip;
  }, [formatTooltip]);

  // One listener on the grid box rather than handlers on every cell. Its detach
  // also dismisses a tooltip left open by the cell under the cursor, which is
  // what covers a data poll dropping that cell (no pointerout ever fires).
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    return delegateChartTooltip(grid, (id) => {
      const cell = cellById.get(id);
      return cell ? formatTooltipRef.current(cell) : null;
    });
  }, [cellById]);

  // Render row labels
  const rowLabels = useMemo(() => {
    if (!showLabels) return null;
    const { cellHeight, rowY } = layout;
    // Same thinning as the column labels below, on the other axis: a label needs
    // ~14px of line box, and a tall grid (20 years of months) gives each row far
    // less than that. Unthinned, consecutive labels overlap into an illegible
    // smear — which reads as a broken card, not as a dense one. Every Nth label
    // is drawn in full instead, spilling into its now-empty neighbours.
    const step = Math.max(1, Math.ceil(14 / Math.max(cellHeight, 1)));

    return uniqueRows.map((row, index) => {
      if (index % step !== 0) return null;
      return (
        <div
          key={`row-${row}`}
          className="pointer-events-none absolute flex items-center justify-end pr-2 text-xs leading-none text-white/60"
          style={{
            left: 0,
            top: chartArea.y + rowY(index),
            width: rowLabelWidth,
            height: cellHeight,
          }}
        >
          <span className="truncate">{row}</span>
        </div>
      );
    });
  }, [showLabels, uniqueRows, layout, chartArea, rowLabelWidth]);

  // Render column labels
  const columnLabels = useMemo(() => {
    if (!showLabels) return null;
    const { cellWidth, columnX } = layout;
    // When columns are too narrow to hold a label, show every Nth one in full
    // rather than truncating every column to an indistinct "7…". The kept
    // labels centre over their column and are free to spill into the (now
    // label-less) neighbours.
    const step = Math.max(1, Math.ceil(34 / Math.max(cellWidth, 1)));

    return uniqueColumns.map((column, index) => {
      if (index % step !== 0) return null;
      return (
        <div
          key={`col-${column}`}
          className="pointer-events-none absolute flex items-end justify-center pb-1 text-xs text-white/60"
          style={{
            left: chartArea.x + columnX(index),
            top: 0,
            width: cellWidth,
            height: columnLabelHeight,
          }}
        >
          <span className="whitespace-nowrap">{column}</span>
        </div>
      );
    });
  }, [showLabels, uniqueColumns, layout, chartArea, columnLabelHeight]);

  return (
    <div className={cn("h-full w-full", className)} ref={containerRef}>
      <div
        ref={gridRef}
        className="relative overflow-hidden"
        style={{ height: dimension.height, width: dimension.width }}
      >
        {rowLabels}
        {columnLabels}
        {memoizedCells}
      </div>
    </div>
  );
}

const HeatmapChart = HeatmapChartInner as <T extends HeatmapCell>(
  props: HeatmapChartProps<T>,
) => React.ReactElement;

// memo() erases the generic call signature, so cast it back to preserve
// callers' type inference.
const HeatmapChartMemo = React.memo(HeatmapChartInner) as typeof HeatmapChart;

export default HeatmapChartMemo;
