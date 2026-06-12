import * as d3 from 'd3';
import { GRID } from '../constants';

export function createGrid(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    yScale: d3.ScaleLinear<number, number>,
    innerWidth: number
): void {
    g.append('g')
        .attr('class', 'grid')
        .call(
            d3
                .axisLeft(yScale)
                .ticks(GRID.ticks)
                .tickSize(-innerWidth)
                .tickFormat(() => '')
        )
        .call((selection) => {
            selection.select('.domain').remove();
            selection
                .selectAll('.tick line')
                .attr('stroke', GRID.color)
                .attr('stroke-opacity', GRID.opacity);
        });
}
