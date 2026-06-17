"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import * as d3 from "d3";
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

  // Create band scales for rows and columns
  // We use paddingInner for gaps between cells, calculated as a ratio of step size
  const scales = useMemo(() => {
    const numColumns = uniqueColumns.length;
    const numRows = uniqueRows.length;

    // Calculate padding ratio: gap pixels / estimated step size
    // Step = range / (n - paddingInner + 2 * paddingOuter), simplified for inner only
    const xPaddingInner =
      numColumns > 1
        ? (gap * (numColumns - 1)) /
          (chartArea.width - gap * (numColumns - 1) + gap * numColumns)
        : 0;
    const yPaddingInner =
      numRows > 1
        ? (gap * (numRows - 1)) /
          (chartArea.height - gap * (numRows - 1) + gap * numRows)
        : 0;

    const xScale = d3
      .scaleBand<string>()
      .domain(uniqueColumns)
      .range([0, chartArea.width])
      .paddingInner(Math.min(xPaddingInner, 0.5))
      .paddingOuter(0);

    const yScale = d3
      .scaleBand<string>()
      .domain(uniqueRows)
      .range([0, chartArea.height])
      .paddingInner(Math.min(yPaddingInner, 0.5))
      .paddingOuter(0);

    return { xScale, yScale };
  }, [uniqueRows, uniqueColumns, chartArea, gap]);

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

  // Blend color helper (same as tree-chart)
  const blendColor = (base: string, overlay: string, alpha: number) => {
    const toRGB = (hex: string) =>
      hex.match(/[A-F0-9]{2}/gi)?.map((x) => parseInt(x, 16)) || [0, 0, 0];
    const [Rb, Gb, Bb] = toRGB(base);
    const [Ro, Go, Bo] = toRGB(overlay);

    const R = Math.round(Ro * alpha + Rb * (1 - alpha));
    const G = Math.round(Go * alpha + Gb * (1 - alpha));
    const B = Math.round(Bo * alpha + Bb * (1 - alpha));

    return `#${[R, G, B].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  };

  // Get discrete opacity based on intensity (same as tree-chart)
  const getDiscreteOpacity = (intensity: number, isPositive: boolean) => {
    if (!isPositive) {
      const invertedIntensity = 1 - intensity;
      if (invertedIntensity >= 0.75) return 0.6;
      if (invertedIntensity >= 0.5) return 0.4;
      if (invertedIntensity >= 0.25) return 0.3;
      return 0.2;
    } else {
      if (intensity >= 0.75) return 0.1;
      if (intensity >= 0.6) return 0.2;
      if (intensity >= 0.5) return 0.3;
      if (intensity >= 0.25) return 0.4;
      if (intensity >= 0.1) return 0.45;
      return 0.5;
    }
  };

  // Render cells
  const memoizedCells = useMemo(() => {
    const { xScale, yScale } = scales;

    return cellsWithColors.map(({ cell, intensity, isPositive }) => {
      const x = xScale(cell.column);
      const y = yScale(cell.row);
      const width = xScale.bandwidth();
      const height = yScale.bandwidth();

      if (x === undefined || y === undefined || width <= 0 || height <= 0)
        return null;

      const rowIndex = rowToIndex.get(cell.row) ?? 0;
      const columnIndex = columnToIndex.get(cell.column) ?? 0;

      const opacity = getDiscreteOpacity(intensity, isPositive);
      const baseColor = isPositive
        ? blendColor("#25A78D", "#000000", opacity)
        : blendColor("#F21553", "#000000", opacity);

      return (
        <div
          key={cell.id}
          className="group absolute cursor-pointer border border-transparent hover:bg-[radial-gradient(146.13%_118.42%_at_50%_-15.5%,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_99.59%)] hover:bg-gradient-to-t"
          style={{
            left: chartArea.x + x,
            top: chartArea.y + y,
            width,
            height,
            borderRadius: CELL_BORDER_RADIUS,
            backgroundColor: baseColor,
          }}
        >
          <CellComponent
            width={width}
            height={height}
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
    scales,
    chartArea,
    rowToIndex,
    columnToIndex,
    CellComponent,
  ]);

  // Render row labels
  const rowLabels = useMemo(() => {
    if (!showLabels) return null;
    const { yScale } = scales;

    return uniqueRows.map((row) => {
      const y = yScale(row);
      const height = yScale.bandwidth();
      if (y === undefined) return null;

      return (
        <div
          key={`row-${row}`}
          className="absolute flex items-center justify-end pr-2 text-xs text-white/60"
          style={{
            left: 0,
            top: chartArea.y + y,
            width: rowLabelWidth,
            height,
          }}
        >
          <span className="truncate">{row}</span>
        </div>
      );
    });
  }, [showLabels, uniqueRows, scales, chartArea, rowLabelWidth]);

  // Render column labels
  const columnLabels = useMemo(() => {
    if (!showLabels) return null;
    const { xScale } = scales;

    return uniqueColumns.map((column) => {
      const x = xScale(column);
      const width = xScale.bandwidth();
      if (x === undefined) return null;

      return (
        <div
          key={`col-${column}`}
          className="absolute flex items-end justify-center pb-1 text-xs text-white/60"
          style={{
            left: chartArea.x + x,
            top: 0,
            width,
            height: columnLabelHeight,
          }}
        >
          <span className="truncate">{column}</span>
        </div>
      );
    });
  }, [showLabels, uniqueColumns, scales, chartArea, columnLabelHeight]);

  return (
    <div className={cn("h-full w-full", className)} ref={containerRef}>
      <div
        className="relative space-x-2 space-y-2 overflow-hidden"
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

export default HeatmapChart;
