"use client";

import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  memo,
} from "react";
import * as d3 from "d3";
import { cn } from "../lib/utils";
import { Skeleton } from "../lib/skeleton";

import type { MultiSeriesLineChartProps } from "./types";
import { CHART_MARGIN } from "./constants";

import { useChartDimensions } from "./hooks/use-chart-dimensions";
import { useSeriesGroups } from "./hooks/use-series-groups";
import { useSeriesColors } from "./hooks/use-series-colors";

import { SeriesGroupButton } from "./components/series-group-button";
import { ChartLegend } from "./components/chart-legend";
import { ChartTooltip } from "./components/chart-tooltip";

import {
  calculateYDomain,
  getAllDates,
  combineDateValues,
  getHoverOpacity,
} from "./utils";

import { createScales } from "./d3-rendering/create-scales";
import { createGrid } from "./d3-rendering/create-grid";
import { createAxes } from "./d3-rendering/create-axes";
import { drawLines } from "./d3-rendering/draw-lines";
import { createInteractions } from "./d3-rendering/create-interactions";
import { calculateLegendPositions } from "./d3-rendering/calculate-legend-positions";
import { LoadingOrb } from "../loading-orb";

const MultiSeriesLineChartComponent: React.FC<MultiSeriesLineChartProps> = ({
  series,
  width,
  height = 400,
  timeframe,
  className,
  isLoading = false,
  formatValue,
  unitPrefix,
  unitSuffix,
  onLabelClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);

  const sortedSeries = useMemo(
    () =>
      [...series].sort((a, b) => {
        const aLastValue =
          a.data.length > 0 ? a.data[a.data.length - 1].value : 0;
        const bLastValue =
          b.data.length > 0 ? b.data[b.data.length - 1].value : 0;
        return bLastValue - aLastValue;
      }),
    [series],
  );

  const handleSeriesHover = useCallback((seriesId: string | null) => {
    setHoveredSeriesId(seriesId);
  }, []);

  const { seriesGroups, visibleGroups, filteredSeries, toggleGroup } =
    useSeriesGroups(sortedSeries);

  const { seriesColors, isColorLoading } = useSeriesColors(sortedSeries);

  const yDomain = useMemo(() => calculateYDomain(sortedSeries), [sortedSeries]);

  const dimensions = useChartDimensions({
    width,
    height,
    yDomain,
    formatValue,
    containerRef,
    svgRef,
  });

  const allDates = useMemo(() => getAllDates(sortedSeries), [sortedSeries]);

  const combinedData = useMemo(
    () => combineDateValues(allDates, sortedSeries),
    [allDates, sortedSeries],
  );

  const highestValue = useMemo(() => {
    return Math.max(
      ...(filteredSeries
        .map((series) => series.data.map((data) => data.value))
        .flat()
        .filter((v) => v !== undefined) as number[]),
    );
  }, [filteredSeries]);

  const scales = useMemo(() => {
    if (!dimensions.innerWidth || !dimensions.innerHeight) return null;

    return createScales(
      combinedData,
      yDomain,
      dimensions.innerWidth,
      dimensions.innerHeight,
    );
  }, [combinedData, yDomain, dimensions.innerWidth, dimensions.innerHeight]);

  const legendItems = useMemo(() => {
    if (!scales || !dimensions.dynamicLeftMargin) return [];

    return calculateLegendPositions(
      filteredSeries,
      seriesColors,
      scales,
      dimensions.dynamicLeftMargin,
      CHART_MARGIN.top,
      formatValue,
    );
  }, [
    scales,
    dimensions.dynamicLeftMargin,
    filteredSeries,
    seriesColors,
    formatValue,
  ]);

  useEffect(() => {
    if (
      !svgRef.current ||
      series.length === 0 ||
      isColorLoading ||
      !scales ||
      dimensions.width === null ||
      dimensions.innerWidth === null ||
      dimensions.dynamicLeftMargin === null
    )
      return;

    const svg = d3.select(svgRef.current);
    const { innerWidth, innerHeight, dynamicLeftMargin } = dimensions;

    svg.selectAll("*").remove();

    const { xScale, yScale } = scales;

    const g = svg
      .append("g")
      .attr("transform", `translate(${dynamicLeftMargin},${CHART_MARGIN.top})`);

    createGrid(g, yScale, innerWidth);
    createAxes(
      g,
      xScale,
      yScale,
      innerHeight,
      timeframe,
      formatValue,
      innerWidth,
    );

    drawLines(
      g,
      filteredSeries,
      seriesColors,
      xScale,
      yScale,
      !hasAnimatedRef.current,
    );
    hasAnimatedRef.current = true;

    const { onMouseMove, onMouseLeave, destroy } = createInteractions({
      g,
      containerWidth: dimensions.width,
      innerWidth,
      innerHeight: dimensions.innerHeight,
      xScale,
      yScale,
      combinedData,
      filteredSeries,
      tooltipRef: tooltipRef,
      containerRef,
      legendRef,
      highestValue,
      formatValue,
    });

    const overlay = g
      .append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .style("pointer-events", "all");

    overlay
      .on("mousemove", onMouseMove)
      .on("mouseleave", onMouseLeave)
      .on("touchstart", onMouseMove)
      .on("touchmove", onMouseMove)
      .on("touchend", onMouseLeave);

    overlay.raise();

    return () => {
      destroy();
      overlay
        .on("mousemove", null)
        .on("mouseleave", null)
        .on("touchstart", null)
        .on("touchmove", null)
        .on("touchend", null);
      svg.selectAll("*").interrupt();
      svg.selectAll("*").remove();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    combinedData,
    yDomain,
    series.length,
    filteredSeries,
    scales,
    dimensions.innerWidth,
    dimensions.innerHeight,
    dimensions.dynamicLeftMargin,
    height,
    timeframe,
    isColorLoading,
    seriesColors,
    formatValue,
  ]);

  useEffect(() => {
    if (!svgRef.current || series.length === 0 || isColorLoading) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select("g");

    g.selectAll("path[data-series-id]")
      .transition()
      .duration(200)
      .ease(d3.easeCubicOut)
      .attr("opacity", function () {
        const seriesId = d3.select(this).attr("data-series-id");
        return getHoverOpacity(seriesId, hoveredSeriesId);
      });
  }, [hoveredSeriesId, series, seriesColors, isColorLoading]);

  if (!isLoading && series.length === 0) {
    return (
      <div className={cn("relative w-full", className)}>
        <div
          className={cn(
            "mx-auto flex w-full items-center justify-center text-sm text-gray-400",
          )}
          style={{ height }}
        >
          No data available
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{ width, minHeight: height }}
    >
      {isLoading ? (
        <LoadingOrb className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      ) : (
        <>
          {seriesGroups.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              {seriesGroups.map((group) => (
                <SeriesGroupButton
                  key={group}
                  group={group}
                  isVisible={visibleGroups.has(group)}
                  onClick={() => toggleGroup(group)}
                />
              ))}
            </div>
          )}

          {dimensions.width !== null && (
            <>
              <div className="relative z-20">
                <ChartLegend
                  legendRef={legendRef}
                  legendItems={legendItems}
                  containerWidth={dimensions.width}
                  hoveredSeriesId={hoveredSeriesId}
                  onSeriesHover={handleSeriesHover}
                  onLabelClick={onLabelClick}
                  unitPrefix={unitPrefix}
                  unitSuffix={unitSuffix}
                />
              </div>

              <div className="relative select-none">
                <svg
                  ref={svgRef}
                  width={dimensions.width}
                  height={height}
                  className="relative z-0"
                  style={{
                    maxWidth: "100%",
                    width: "100%",
                    display: "block",
                    overflow: "visible",
                  }}
                />
                <div className="z-10">
                  <ChartTooltip
                    containerWidth={dimensions.width}
                    tooltipRef={tooltipRef}
                    series={filteredSeries}
                    seriesColors={seriesColors}
                    unitPrefix={unitPrefix}
                    unitSuffix={unitSuffix}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export const MultiSeriesLineChart = memo(MultiSeriesLineChartComponent);
export type { MultiSeriesData, MultiSeriesLineChartProps } from "./types";
