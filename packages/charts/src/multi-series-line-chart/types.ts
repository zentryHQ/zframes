import type { DataPoint } from "../lib/timeframe";
import { ChartTimeframe } from "../lib/timeframe";

export interface MultiSeriesData {
  id: string;
  name: string;
  data: DataPoint[];
  iconImageUrl?: string;
  color: string;
  seriesGroup?: string;
}

export interface MultiSeriesLineChartProps {
  series: MultiSeriesData[];
  width?: number;
  height?: number;
  timeframe: ChartTimeframe;
  className?: string;
  isLoading?: boolean;
  formatValue?: (value: number) => string;
  unitPrefix?: string | React.ReactNode;
  unitSuffix?: string | React.ReactNode;
  yDomain?: [number, number];
  onLabelClick?: (seriesId: string) => void;
}

export interface LegendItem {
  id: string;
  left: number;
  top: number;
  seriesData: MultiSeriesData;
  color: string;
  value: string;
  displayText: string;
}

export interface CombinedDataPoint {
  date: Date;
  values: { [seriesId: string]: number };
}

export interface ChartScales {
  xScale: d3.ScaleTime<number, number, never>;
  yScale: d3.ScaleLinear<number, number, never>;
}

export interface ChartDimensions {
  width: number | null;
  height: number;
  innerWidth: number | null;
  innerHeight: number;
  dynamicLeftMargin: number | null;
}
