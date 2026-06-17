import * as d3 from "d3";
import type { MultiSeriesData } from "../types";

export const drawLines = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  filteredSeries: MultiSeriesData[],
  seriesColors: { [seriesId: string]: string },
  xScale: d3.ScaleTime<number, number, never>,
  yScale: d3.ScaleLinear<number, number, never>,
): void => {
  const line = d3
    .line<{ date: Date; value: number }>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.value))
    .curve(d3.curveMonotoneX);

  filteredSeries.forEach((seriesData) => {
    const processedData = seriesData.data.map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }));

    const seriesColor = seriesColors[seriesData.id];

    const path = g
      .append("path")
      .datum(processedData)
      .attr("fill", "none")
      .attr("stroke", seriesColor)
      .attr("stroke-width", 1.2)
      .attr("opacity", 1)
      .attr("data-series-id", seriesData.id)
      .attr("d", line);

    const totalLength = (path.node() as SVGPathElement).getTotalLength();

    path
      .attr("stroke-dasharray", totalLength + " " + totalLength)
      .attr("stroke-dashoffset", totalLength);

    path
      .transition("draw")
      .duration(1200)
      .ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0)
      .on("end", function () {
        d3.select(this).attr("stroke-dasharray", null);
      });
  });
};
