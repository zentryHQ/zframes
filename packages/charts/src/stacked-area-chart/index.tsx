"use client";

import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
} from "react";
import * as d3 from "d3";
import { cn } from "../lib/utils";

import type {
  StackedAreaSeries,
  StackedAreaChartProps,
  AreaComponentProps,
  StackedSeriesData,
} from "./types";
import { CHART_DEFAULTS, STACKED_AREA_COLORS, AREA } from "./constants";
import {
  getAllDates,
  combineSeriesData,
  createCombinedDataPoints,
  calculateStackedYDomain,
  getStackOrder,
  getStackOffset,
  getCurveFunction,
  formatValueWithSuffix,
} from "./utils";
import { useChartDimensions } from "./hooks/use-chart-dimensions";
import { useStackedAreaTooltip } from "./hooks/use-stacked-area-tooltip";
import { createScales } from "./d3-rendering/create-scales";
import { createGrid } from "./d3-rendering/create-grid";
import { createAxes } from "./d3-rendering/create-axes";
import { drawAreas, updateAreaOpacities } from "./d3-rendering/draw-areas";

/**
 * Default area component - renders a simple filled area
 */
function DefaultAreaComponent<T extends StackedAreaSeries>({
  pathD,
  color,
  isHovered,
  hasHover,
}: AreaComponentProps<T>) {
  const opacity = hasHover
    ? isHovered
      ? AREA.hoverOpacity
      : AREA.dimmedOpacity
    : AREA.opacity;

  return (
    <path
      d={pathD}
      fill={color}
      fillOpacity={opacity}
      stroke={color}
      strokeWidth={AREA.strokeWidth}
      strokeOpacity={AREA.strokeOpacity}
      style={{ transition: "fill-opacity 200ms ease-out" }}
    />
  );
}

function StackedAreaChartInner<T extends StackedAreaSeries>({
  series,
  AreaComponent = DefaultAreaComponent,
  className,
  height = CHART_DEFAULTS.height,
  margin,
  colors = STACKED_AREA_COLORS,
  getSeriesColor,
  formatXAxis,
  formatYAxis,
  formatValue = formatValueWithSuffix,
  stackOrder = "none",
  stackOffset = "none",
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  curveType = "monotoneX",
  isLoading = false,
  onDateHover,
}: StackedAreaChartProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);

  const dimensions = useChartDimensions({
    height,
    margin,
    containerRef,
  });

  // Memoize series colors
  const seriesColors = useMemo(() => {
    const colorMap: { [seriesId: string]: string } = {};
    series.forEach((s, index) => {
      if (getSeriesColor) {
        colorMap[s.id] = getSeriesColor(s, index);
      } else if (s.color) {
        colorMap[s.id] = s.color;
      } else {
        colorMap[s.id] = colors[index % colors.length];
      }
    });
    return colorMap;
  }, [series, colors, getSeriesColor]);

  // Memoize computed data
  const dates = useMemo(() => getAllDates(series), [series]);

  const combinedData = useMemo(
    () => combineSeriesData(series, dates),
    [series, dates],
  );

  const combinedDataPoints = useMemo(
    () => createCombinedDataPoints(series, dates),
    [series, dates],
  );

  const yDomain = useMemo(
    () => calculateStackedYDomain(series, stackOffset),
    [series, stackOffset],
  );

  // Create D3 stack
  const stackedData = useMemo(() => {
    if (series.length === 0 || dates.length === 0) return [];

    const stack = d3
      .stack<{ date: Date; [key: string]: number | Date }>()
      .keys(series.map((s) => s.id))
      .order(getStackOrder(stackOrder))
      .offset(getStackOffset(stackOffset));

    return stack(combinedData) as StackedSeriesData[];
  }, [series, dates, combinedData, stackOrder, stackOffset]);

  // Create scales
  const scales = useMemo(() => {
    if (
      dimensions.innerWidth <= 0 ||
      dimensions.innerHeight <= 0 ||
      dates.length === 0
    ) {
      return null;
    }
    return createScales(
      dates,
      yDomain,
      dimensions.innerWidth,
      dimensions.innerHeight,
    );
  }, [dates, yDomain, dimensions.innerWidth, dimensions.innerHeight]);

  // Tooltip hook
  const { tooltipState, handleMouseMove, handleMouseLeave } =
    useStackedAreaTooltip({
      dates,
      combinedData: combinedDataPoints,
      xScale: scales?.xScale ?? null,
      innerWidth: dimensions.innerWidth,
      innerHeight: dimensions.innerHeight,
      marginLeft: dimensions.marginLeft,
      marginTop: dimensions.marginTop,
      onDateHover,
    });

  // Generate area paths using D3
  const areaPaths = useMemo(() => {
    if (!scales || stackedData.length === 0) return [];

    const curve = getCurveFunction(curveType);

    const areaGenerator = d3
      .area<d3.SeriesPoint<{ date: Date; [key: string]: number | Date }>>()
      .x((d) => scales.xScale(d.data.date))
      .y0((d) => scales.yScale(d[0]))
      .y1((d) => scales.yScale(d[1]))
      .curve(curve);

    return stackedData.map((seriesData, index) => ({
      seriesId: seriesData.key,
      pathD: areaGenerator(seriesData) || "",
      color: seriesColors[seriesData.key] || "#888888",
      index,
      series: series.find((s) => s.id === seriesData.key) as T,
    }));
  }, [scales, stackedData, curveType, seriesColors, series]);

  // Draw SVG elements (grid, axes) via D3
  useEffect(() => {
    if (
      !svgRef.current ||
      !scales ||
      series.length === 0 ||
      dimensions.width === 0
    ) {
      return;
    }

    const svg = d3.select(svgRef.current);

    // Clear previous content
    svg.selectAll(".chart-content").remove();

    const g = svg
      .append("g")
      .attr("class", "chart-content")
      .attr(
        "transform",
        `translate(${dimensions.marginLeft},${dimensions.marginTop})`,
      );

    // Draw grid
    if (showGrid) {
      createGrid(g, scales.yScale, dimensions.innerWidth);
    }

    // Draw axes
    if (showXAxis || showYAxis) {
      createAxes(
        g,
        scales.xScale,
        scales.yScale,
        dimensions.innerHeight,
        showXAxis ? formatXAxis : undefined,
        showYAxis ? formatYAxis : undefined,
      );

      // Hide axes as needed
      if (!showXAxis) {
        g.select(".x-axis").remove();
      }
      if (!showYAxis) {
        g.select(".y-axis").remove();
      }
    }
  }, [
    scales,
    series.length,
    dimensions,
    showGrid,
    showXAxis,
    showYAxis,
    formatXAxis,
    formatYAxis,
  ]);

  // Handle hover effects
  const handleAreaMouseEnter = useCallback((seriesId: string) => {
    setHoveredSeriesId(seriesId);
  }, []);

  const handleAreaMouseLeave = useCallback(() => {
    setHoveredSeriesId(null);
  }, []);

  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className={cn("relative w-full", className)}
        style={{ height }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div
        ref={containerRef}
        className={cn("relative w-full", className)}
        style={{ height }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{ height }}
    >
      {dimensions.width > 0 && scales && (
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="overflow-visible"
        >
          {/* Render areas using React (allows custom AreaComponent) */}
          <g
            transform={`translate(${dimensions.marginLeft},${dimensions.marginTop})`}
          >
            {areaPaths.map(
              ({ seriesId, pathD, color, index, series: seriesData }) => (
                <g
                  key={seriesId}
                  onMouseEnter={() => handleAreaMouseEnter(seriesId)}
                  onMouseLeave={handleAreaMouseLeave}
                  style={{ cursor: "pointer" }}
                >
                  <AreaComponent
                    series={seriesData}
                    pathD={pathD}
                    color={color}
                    index={index}
                    isHovered={hoveredSeriesId === seriesId}
                    hasHover={hoveredSeriesId !== null}
                  />
                </g>
              ),
            )}

            {/* Vertical hover line */}
            {tooltipState.visible && (
              <line
                x1={tooltipState.x - dimensions.marginLeft}
                y1={0}
                x2={tooltipState.x - dimensions.marginLeft}
                y2={dimensions.innerHeight}
                stroke="#FFFFFF"
                strokeWidth={1}
                strokeOpacity={0.3}
                strokeDasharray="4,4"
              />
            )}

            {/* Invisible overlay for mouse events */}
            <rect
              x={0}
              y={0}
              width={dimensions.innerWidth}
              height={dimensions.innerHeight}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          </g>
        </svg>
      )}

      {/* Tooltip */}
      {tooltipState.visible && tooltipState.data && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl"
          style={{
            left: Math.min(tooltipState.x + 10, dimensions.width - 180),
            top: dimensions.marginTop + 10,
            minWidth: 150,
          }}
        >
          <div className="mb-2 text-xs text-white/60">
            {tooltipState.date?.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="space-y-1">
            {series.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: seriesColors[s.id],
                    }}
                  />
                  <span className="text-xs text-white/80">{s.name}</span>
                </div>
                <span className="text-xs font-medium text-white">
                  {formatValue(tooltipState.data?.values[s.id] ?? 0)}
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-xs font-medium text-white/60">Total</span>
              <span className="text-xs font-semibold text-white">
                {formatValue(tooltipState.data?.total ?? 0)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Stacked Area Chart - A generic, implementation-agnostic D3-based stacked area visualization.
 *
 * Features:
 * - Generic data interface with minimal required fields
 * - Render prop pattern for custom area rendering
 * - Multiple stacking strategies (normal, percentage, streamgraph)
 * - Responsive sizing with ResizeObserver
 * - Built-in tooltip with hover interactions
 * - Smooth animations
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StackedAreaChart
 *   series={[
 *     { id: 'a', name: 'Series A', data: [{ date: '2024-01-01', value: 100 }] },
 *     { id: 'b', name: 'Series B', data: [{ date: '2024-01-01', value: 50 }] },
 *   ]}
 * />
 *
 * // Percentage stacking
 * <StackedAreaChart
 *   series={data}
 *   stackOffset="expand"
 *   formatYAxis={(v) => `${(v * 100).toFixed(0)}%`}
 * />
 *
 * // Custom area component
 * <StackedAreaChart
 *   series={data}
 *   AreaComponent={({ pathD, color, isHovered }) => (
 *     <path d={pathD} fill={color} opacity={isHovered ? 1 : 0.7} />
 *   )}
 * />
 * ```
 */
const StackedAreaChart = StackedAreaChartInner as <T extends StackedAreaSeries>(
  props: StackedAreaChartProps<T>,
) => React.ReactElement;

// memo() erases the generic call signature, so cast it back to preserve
// callers' type inference.
const StackedAreaChartMemo = React.memo(
  StackedAreaChartInner,
) as typeof StackedAreaChart;

export default StackedAreaChartMemo;

export type {
  StackedAreaSeries,
  StackedAreaDataPoint,
  StackedAreaChartProps,
  AreaComponentProps,
  CombinedStackedDataPoint,
  StackedAreaChartScales,
  StackedAreaChartDimensions,
  StackOrder,
  StackOffset,
} from "./types";

export { useStackedAreaTooltip } from "./hooks/use-stacked-area-tooltip";
export { useChartDimensions } from "./hooks/use-chart-dimensions";
export {
  getAllDates,
  combineSeriesData,
  createCombinedDataPoints,
  calculateStackedYDomain,
  formatValueWithSuffix,
  formatPercentage,
} from "./utils";
export { STACKED_AREA_COLORS, AREA } from "./constants";
