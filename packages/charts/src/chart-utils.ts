import * as d3 from "d3";
import { ChartTimeframe, DataPoint } from "./lib/timeframe";

/** Format dates for tooltips based on timeframe. */
export const formatChartDate = (
  date: string,
  timeframe: ChartTimeframe,
): string => {
  const d = new Date(date);
  if (timeframe === ChartTimeframe["24h"]) return d3.timeFormat("%H:%M")(d);
  // Beyond a year, "Apr 01" repeats down the axis and reads as noise: a
  // multi-year series wants the month AND year, a multi-decade one just the year.
  if (timeframe === ChartTimeframe["1Y"]) return d3.timeFormat("%b %Y")(d);
  if (timeframe === ChartTimeframe["5Y"] || timeframe === ChartTimeframe.MAX)
    return d3.timeFormat("%Y")(d);
  return d3.timeFormat("%b %d")(d);
};

/** Calculate chart domain with padding. */
export const calculateChartDomain = (data: DataPoint[], padding = 0.1) => {
  const values = data.map((d) => d.value);
  const minValue = d3.min(values) || 0;
  const maxValue = d3.max(values) || 0;
  const range = maxValue - minValue;

  const maxDomain = maxValue + range * padding;
  let minDomain = minValue - range * padding;

  if (minValue >= 0 && minDomain < 0) {
    minDomain = 0;
  }

  return [minDomain, maxDomain];
};

export const CHART_COLORS_MULTI_SERIES = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
];
