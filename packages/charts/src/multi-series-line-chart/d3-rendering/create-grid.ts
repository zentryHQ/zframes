import * as d3 from "d3";
import { GRID } from "../constants";

export const createGrid = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: d3.ScaleLinear<number, number, never>,
  innerWidth: number,
): void => {
  const [minValue, maxValue] = yScale.domain();
  const tickValues: number[] = [];

  if (GRID.ticks <= 1) {
    tickValues.push((minValue + maxValue) / 2);
  } else {
    for (let i = 0; i < GRID.ticks; i++) {
      const value = minValue + ((maxValue - minValue) / (GRID.ticks - 1)) * i;
      tickValues.push(value);
    }
  }

  g.append("g")
    .attr("class", "grid")
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(tickValues)
        .tickSize(-innerWidth)
        .tickFormat(() => ""),
    )
    .call((g) => g.select(".domain").remove())
    .selectAll("line")
    .attr("stroke", GRID.color)
    .attr("stroke-opacity", GRID.opacity);
};
