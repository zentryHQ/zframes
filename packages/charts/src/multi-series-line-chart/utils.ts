import * as d3 from 'd3';
import { ChartTimeframe } from '../lib/timeframe';
import { formatChartDate } from '../chart-utils';
import type { MultiSeriesData, CombinedDataPoint } from './types';
import { calculateChartDomain } from '../chart-utils';

export const formatChartDateForTimeframe = (
    date: string,
    timeframe: ChartTimeframe
) => {
    return formatChartDate(date, timeframe);
};

export const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const calculateYDomain = (
    series: MultiSeriesData[]
): [number, number] => {
    const allDataPoints = series.flatMap((s) => s.data);

    return calculateChartDomain(allDataPoints) as [number, number];
};

export const getAllDates = (series: MultiSeriesData[]): string[] => {
    const dateSet = new Set<string>();
    series.forEach((s) => {
        s.data.forEach((d) => dateSet.add(d.date));
    });
    return Array.from(dateSet).sort();
};

export const combineDateValues = (
    allDates: string[],
    series: MultiSeriesData[]
): CombinedDataPoint[] => {
    return allDates.map((date) => {
        const values: { [seriesId: string]: number } = {};
        series.forEach((s) => {
            const point = s.data.find((d) => d.date === date);
            values[s.id] = point ? point.value : 0;
        });
        return {
            date: new Date(date),
            values,
        };
    });
};

export const findClosestDataPoint = (
    mouseX: number,
    xScale: d3.ScaleTime<number, number, never>,
    combinedData: CombinedDataPoint[]
): CombinedDataPoint | null => {
    const date = xScale.invert(mouseX);
    const bisectDate = d3.bisector((d: CombinedDataPoint) => d.date).left;
    const index = bisectDate(combinedData, date, 1);
    const d0 = combinedData[index - 1];
    const d1 = combinedData[index];

    if (!d0 || !d1) return null;

    return date.getTime() - d0.date.getTime() >
        d1.date.getTime() - date.getTime()
        ? d1
        : d0;
};

export const sortSeriesByLastValue = (
    series: MultiSeriesData[]
): MultiSeriesData[] => {
    return [...series].sort((a, b) => {
        const aLastValue =
            a.data.length > 0 ? a.data[a.data.length - 1].value : 0;
        const bLastValue =
            b.data.length > 0 ? b.data[b.data.length - 1].value : 0;
        return bLastValue - aLastValue;
    });
};

export const getHoverOpacity = (
    currentSeriesId: string,
    hoveredSeriesId: string | null
): number => {
    const isHovered = hoveredSeriesId === currentSeriesId;
    const isOtherHovered =
        hoveredSeriesId !== null && hoveredSeriesId !== currentSeriesId;
    if (isHovered) return 1;
    if (isOtherHovered) return 0.3;
    return 1;
};
