import * as d3 from "d3";
import { ChartTimeframe, DataPoint } from "./lib/timeframe";

/** Format dates for tooltips based on timeframe. */
export const formatChartDate = (
  date: string,
  timeframe: ChartTimeframe,
): string => {
  const d = new Date(date);
  if (timeframe === ChartTimeframe["24h"]) return d3.timeFormat("%H:%M")(d);
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

export const getDatapointsFromTimeframe = (
  timeframe: ChartTimeframe,
  timeIntervalMs: number,
): number => {
  switch (timeframe) {
    case ChartTimeframe["24h"]:
      return (24 * 60 * 60 * 1000) / timeIntervalMs;
    case ChartTimeframe["3D"]:
      return (3 * 24 * 60 * 60 * 1000) / timeIntervalMs;
    case ChartTimeframe["7D"]:
      return (7 * 24 * 60 * 60 * 1000) / timeIntervalMs;
    case ChartTimeframe["1M"]:
      return (30 * 24 * 60 * 60 * 1000) / timeIntervalMs;
    case ChartTimeframe["3M"]:
      return (90 * 24 * 60 * 60 * 1000) / timeIntervalMs;
    case ChartTimeframe["YTD"]:
      return (365 * 24 * 60 * 60 * 1000) / timeIntervalMs;
    default:
      return 30;
  }
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
