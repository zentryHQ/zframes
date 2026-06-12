import * as d3 from 'd3';
import type { StackedAreaChartScales } from '../types';

export function createScales(
    dates: Date[],
    yDomain: [number, number],
    innerWidth: number,
    innerHeight: number
): StackedAreaChartScales {
    const xScale = d3
        .scaleTime()
        .domain(d3.extent(dates) as [Date, Date])
        .range([0, innerWidth]);

    const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

    return { xScale, yScale };
}
