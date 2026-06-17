import * as d3 from "d3";
import type { CombinedDataPoint, ChartScales } from "../types";

export const createScales = (
  combinedData: CombinedDataPoint[],
  yDomain: [number, number],
  innerWidth: number,
  innerHeight: number,
): ChartScales => {
  const xScale = d3
    .scaleTime()
    .domain(d3.extent(combinedData, (d) => d.date) as [Date, Date])
    .range([0, innerWidth]);

  const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

  return { xScale, yScale };
};
