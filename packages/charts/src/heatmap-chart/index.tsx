"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "../lib/utils";

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
}

const CELL_BORDER_RADIUS = "4px";
const DEFAULT_GAP = 6;
const DEFAULT_ROW_LABEL_WIDTH = 80;
const DEFAULT_COLUMN_LABEL_HEIGHT = 24;

/**
 * HeatmapChart - A generic, implementation-agnostic heatmap visualization.
 *
 * Uses the composition pattern with a CellComponent render prop for custom cell rendering.
 * The component handles layout, color scaling, and responsive sizing.
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
}: HeatmapChartProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();
  const [dimension, setDimension] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const observer = new ResizeObserver(() => {
        startTransition(() => {
          setDimension({
            width: container.offsetWidth,
            height: container.offsetHeight,
          });
        });
      });
      observer.observe(container);
      return () => {
        observer.disconnect();
      };
    }
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

  // Render cells
  const memoizedCells = useMemo(() => {
    const { cellWidth, cellHeight, columnX, rowY } = layout;
    if (cellWidth <= 0 || cellHeight <= 0) return null;

    return cellsWithColors.map(({ cell, intensity, isPositive }) => {
      const rowIndex = rowToIndex.get(cell.row);
      const columnIndex = columnToIndex.get(cell.column);
      if (rowIndex === undefined || columnIndex === undefined) return null;

      const baseColor = getCellColor(intensity, isPositive);

      return (
        <div
          key={cell.id}
          className="group absolute cursor-pointer border border-transparent hover:bg-[radial-gradient(146.13%_118.42%_at_50%_-15.5%,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_99.59%)] hover:bg-gradient-to-t"
          style={{
            left: chartArea.x + columnX(columnIndex),
            top: chartArea.y + rowY(rowIndex),
            width: cellWidth,
            height: cellHeight,
            borderRadius: CELL_BORDER_RADIUS,
            backgroundColor: baseColor,
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
  ]);

  // Render row labels
  const rowLabels = useMemo(() => {
    if (!showLabels) return null;
    const { cellHeight, rowY } = layout;

    return uniqueRows.map((row, index) => (
      <div
        key={`row-${row}`}
        className="absolute flex items-center justify-end pr-2 text-xs text-white/60"
        style={{
          left: 0,
          top: chartArea.y + rowY(index),
          width: rowLabelWidth,
          height: cellHeight,
        }}
      >
        <span className="truncate">{row}</span>
      </div>
    ));
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
