import * as d3 from "d3";
import type { StackedAreaSeries, CombinedStackedDataPoint } from "./types";

/**
 * Get all unique dates from series data, sorted chronologically
 */
export function getAllDates<T extends StackedAreaSeries>(series: T[]): Date[] {
  const dateSet = new Set<number>();

  series.forEach((s) => {
    s.data.forEach((d) => {
      const date = d.date instanceof Date ? d.date : new Date(d.date);
      dateSet.add(date.getTime());
    });
  });

  return Array.from(dateSet)
    .sort((a, b) => a - b)
    .map((ts) => new Date(ts));
}

/**
 * Combine series data into a format suitable for D3's stack generator
 */
export function combineSeriesData<T extends StackedAreaSeries>(
  series: T[],
  dates: Date[],
): Array<{ date: Date; [key: string]: number | Date }> {
  // Create a map for quick lookups
  const seriesDataMaps = series.map((s) => {
    const map = new Map<number, number>();
    s.data.forEach((d) => {
      const date = d.date instanceof Date ? d.date : new Date(d.date);
      map.set(date.getTime(), d.value);
    });
    return map;
  });

  return dates.map((date) => {
    const point: { date: Date; [key: string]: number | Date } = { date };
    series.forEach((s, i) => {
      point[s.id] = seriesDataMaps[i].get(date.getTime()) ?? 0;
    });
    return point;
  });
}

/**
 * Create combined data points for tooltips
 */
export function createCombinedDataPoints<T extends StackedAreaSeries>(
  series: T[],
  dates: Date[],
): CombinedStackedDataPoint[] {
  const seriesDataMaps = series.map((s) => {
    const map = new Map<number, number>();
    s.data.forEach((d) => {
      const date = d.date instanceof Date ? d.date : new Date(d.date);
      map.set(date.getTime(), d.value);
    });
    return map;
  });

  return dates.map((date) => {
    const values: { [seriesId: string]: number } = {};
    let total = 0;

    series.forEach((s, i) => {
      const value = seriesDataMaps[i].get(date.getTime()) ?? 0;
      values[s.id] = value;
      total += value;
    });

    return { date, values, total };
  });
}

/**
 * Calculate Y domain from stacked data
 */
export function calculateStackedYDomain<T extends StackedAreaSeries>(
  series: T[],
): [number, number] {
  const dates = getAllDates(series);
  const combined = createCombinedDataPoints(series, dates);

  const maxTotal = d3.max(combined, (d) => d.total) ?? 0;

  // Add 10% padding to top
  return [0, maxTotal * 1.1];
}

/**
 * Find the closest data point to a given x position
 */
export function findClosestDataPoint(
  x: number,
  xScale: d3.ScaleTime<number, number>,
  dates: Date[],
): { date: Date; index: number } | null {
  if (dates.length === 0) return null;

  const bisect = d3.bisector<Date, Date>((d) => d).left;
  const date = xScale.invert(x);
  const index = bisect(dates, date, 1);

  const d0 = dates[index - 1];
  const d1 = dates[index];

  if (!d0) return { date: d1, index };
  if (!d1) return { date: d0, index: index - 1 };

  return date.getTime() - d0.getTime() > d1.getTime() - date.getTime()
    ? { date: d1, index }
    : { date: d0, index: index - 1 };
}

/**
 * Format a number with appropriate suffixes (K, M, B)
 */
export function formatValueWithSuffix(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1e9) return `${sign}${(absValue / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `${sign}${(absValue / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `${sign}${(absValue / 1e3).toFixed(1)}K`;
  return `${sign}${absValue.toFixed(0)}`;
}
