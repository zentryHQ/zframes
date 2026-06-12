import * as d3 from 'd3';
import { AXIS } from '../constants';

export function createAxes(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    innerHeight: number,
    formatXAxis?: (date: Date) => string,
    formatYAxis?: (value: number) => string
): void {
    // X Axis
    const xAxisGenerator = d3
        .axisBottom(xScale)
        .ticks(AXIS.xTicks)
        .tickSize(AXIS.tickSize);

    if (formatXAxis) {
        xAxisGenerator.tickFormat((d) => formatXAxis(d as Date));
    }

    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(xAxisGenerator)
        .call((selection) => {
            selection
                .select('.domain')
                .attr('stroke', AXIS.domainColor)
                .attr('stroke-opacity', AXIS.domainOpacity);
            selection
                .selectAll('.tick line')
                .attr('stroke', AXIS.tickColor)
                .attr('stroke-opacity', AXIS.textOpacity);
            selection
                .selectAll('.tick text')
                .attr('fill', AXIS.domainColor)
                .attr('fill-opacity', AXIS.textOpacity)
                .attr('font-size', AXIS.fontSize)
                .attr('font-weight', '500');
        });

    // Y Axis
    const yAxisGenerator = d3
        .axisLeft(yScale)
        .ticks(AXIS.yTicks)
        .tickSize(AXIS.tickSize);

    if (formatYAxis) {
        yAxisGenerator.tickFormat((d) => formatYAxis(d as number));
    }

    g.append('g')
        .attr('class', 'y-axis')
        .call(yAxisGenerator)
        .call((selection) => {
            selection
                .select('.domain')
                .attr('stroke', AXIS.domainColor)
                .attr('stroke-opacity', AXIS.domainOpacity);
            selection
                .selectAll('.tick line')
                .attr('stroke', AXIS.tickColor)
                .attr('stroke-opacity', AXIS.textOpacity);
            selection
                .selectAll('.tick text')
                .attr('fill', AXIS.domainColor)
                .attr('fill-opacity', AXIS.textOpacity)
                .attr('font-size', AXIS.fontSize)
                .attr('font-weight', '500');
        });
}
