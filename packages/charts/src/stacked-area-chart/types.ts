import type * as d3 from "d3";

/**
 * Base data point for time-series data
 */
export interface StackedAreaDataPoint {
  date: Date | string;
  value: number;
}

/**
 * A single series in the stacked area chart
 */
export interface StackedAreaSeries {
  id: string;
  name: string;
  data: StackedAreaDataPoint[];
  color?: string;
}

/**
 * Props for one stacked band's path
 */
export interface AreaBandProps {
  /** The D3 path string for the area */
  pathD: string;
  /** The color for this area */
  color: string;
  /** Whether this series is currently hovered */
  isHovered: boolean;
  /** Whether any series is currently hovered */
  hasHover: boolean;
}

/**
 * Combined data point for tooltip/interaction use
 */
export interface CombinedStackedDataPoint {
  date: Date;
  values: { [seriesId: string]: number };
  total: number;
}

/**
 * Chart scales
 */
export interface StackedAreaChartScales {
  xScale: d3.ScaleTime<number, number, never>;
  yScale: d3.ScaleLinear<number, number, never>;
}

/**
 * Chart dimensions
 */
export interface StackedAreaChartDimensions {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

/**
 * Props for the StackedAreaChart component
 */
export interface StackedAreaChartProps<T extends StackedAreaSeries> {
  /** Array of series data */
  series: T[];
  /** Optional height (defaults to 400) */
  height?: number;
  /**
   * Size the chart to its CONTAINER's height instead of `height`.
   *
   * `height` pins the container, so a card body shorter than it can't shrink
   * the chart and the bands spill out clipped. With `fill` the container takes
   * the card's height and the bands are drawn to whatever that measures.
   * Opt-in — existing callers keep their fixed height and pixel-identical
   * output.
   */
  fill?: boolean;
  /** Format function for x-axis ticks */
  formatXAxis?: (date: Date) => string;
  /** Format function for y-axis ticks */
  formatYAxis?: (value: number) => string;
  /** Format function for tooltip values */
  formatValue?: (value: number) => string;
}

export type StackedSeriesData = d3.Series<
  { date: Date; [key: string]: number | Date },
  string
>;
