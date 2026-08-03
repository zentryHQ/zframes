// D3 base chart layer: implementation-agnostic rendering primitives — no
// business logic, no data fetching; frames feed these via props. A reusable
// building-block library: some charts (StackedAreaChart, PieChart) ship as
// primitives for custom frames and aren't yet used by a built-in frame.

export { default as TreeChart } from "./tree-chart";
export type { LeafComponentProps, TreeNode, TileMode } from "./tree-chart";

export { default as HeatmapChart } from "./heatmap-chart";
export type {
  HeatmapCell,
  CellComponentProps,
  HeatmapChartProps,
} from "./heatmap-chart";

export { default as CalendarHeatmap } from "./calendar-heatmap";
export type {
  CalendarDatum,
  CalendarDay,
  CalendarHeatmapProps,
  WeekStart,
} from "./calendar-heatmap";
export {
  buildCalendarGrid,
  levelScale,
  monthLabels,
  parseDay,
} from "./calendar-heatmap/utils";

export { MultiSeriesLineChart } from "./multi-series-line-chart";
export type {
  ChartEvent,
  MultiSeriesData,
  MultiSeriesLineChartProps,
} from "./multi-series-line-chart/types";

export { default as StackedAreaChart } from "./stacked-area-chart";

export { default as PieChart } from "./pie-chart";

export { MiniLineChart } from "./mini-line-chart";

export { default as BarChart } from "./bar-chart";
export type { BarDatum, BarChartProps } from "./bar-chart";

export { default as ScatterChart } from "./scatter-chart";
export type { ScatterDatum, ScatterChartProps } from "./scatter-chart";

export { default as HistogramChart } from "./histogram-chart";
export type { HistogramChartProps, HistogramMarker } from "./histogram-chart";
export type {
  BinnedSample,
  BinOptions,
  HistogramBin,
  SampleStats,
} from "./histogram-chart/utils";
export {
  binSample,
  chooseBinWidth,
  normalCurve,
  quantile,
  sampleStats,
} from "./histogram-chart/utils";

export { default as BubbleChart } from "./bubble-chart";
export type { BubbleNode, BubbleChartProps } from "./bubble-chart";

export { default as RadialGauge } from "./radial-gauge";
export type { RadialGaugeProps } from "./radial-gauge";

export { ChartTimeframe } from "./lib/timeframe";
export { parseMarketData } from "./lib/format";
export { CHART_COLORS_MULTI_SERIES } from "./chart-utils";
