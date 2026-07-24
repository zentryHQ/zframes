/**
 * Timeframe granularity for time-series charts. Drives axis tick formatting
 * and date parsing — a generic chart concern, no product-specific coupling.
 */
export enum ChartTimeframe {
  "30m" = "30m",
  "24h" = "24h",
  "3D" = "3D",
  "7D" = "7D",
  "1M" = "1M",
  "3M" = "3M",
  YTD = "YTD",
  /** Multi-year: axis ticks fall back to month+year. */
  "1Y" = "1Y",
  /** Multi-decade: axis ticks are bare years. */
  "5Y" = "5Y",
  MAX = "MAX",
}

export type DataPoint = {
  date: string;
  value: number;
};
