// D3 base chart layer ported from zTerminal (zentry-nexus frontend-s2
// shared/components/charts). Implementation-agnostic: no business logic,
// no data fetching — frames feed these via props. This is a reusable
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

export { MultiSeriesLineChart } from "./multi-series-line-chart";
export type {
  MultiSeriesData,
  MultiSeriesLineChartProps,
} from "./multi-series-line-chart/types";

export { default as StackedAreaChart } from "./stacked-area-chart";

export { default as PieChart } from "./pie-chart";

export { MiniLineChart } from "./mini-line-chart";

export { LoadingOrb } from "./loading-orb";
export { Skeleton } from "./lib/skeleton";

export { ChartTimeframe } from "./lib/timeframe";
export type { DataPoint } from "./lib/timeframe";
export { parseMarketData, formatSmallNumber } from "./lib/format";
export { cn } from "./lib/utils";
export {
  CHART_COLORS_MULTI_SERIES,
  calculateChartDomain,
  formatChartDate,
} from "./chart-utils";
