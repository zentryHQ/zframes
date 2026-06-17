import * as d3 from "d3";
import type { StackedSeriesData } from "../types";
import { AREA, CHART_DEFAULTS } from "../constants";
import { getCurveFunction } from "../utils";

export interface DrawAreasOptions {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  stackedData: StackedSeriesData[];
  seriesColors: { [seriesId: string]: string };
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  curveType: "linear" | "monotoneX" | "step" | "natural" | "basis";
  animate?: boolean;
}

export function drawAreas({
  g,
  stackedData,
  seriesColors,
  xScale,
  yScale,
  curveType,
  animate = true,
}: DrawAreasOptions): void {
  const curve = getCurveFunction(curveType);

  const areaGenerator = d3
    .area<d3.SeriesPoint<{ date: Date; [key: string]: number | Date }>>()
    .x((d) => xScale(d.data.date))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(curve);

  // Create a group for all areas
  const areasGroup = g.append("g").attr("class", "areas");

  stackedData.forEach((series, index) => {
    const seriesId = series.key;
    const color = seriesColors[seriesId] || "#888888";

    const area = areasGroup
      .append("path")
      .datum(series)
      .attr("class", "area")
      .attr("data-series-id", seriesId)
      .attr("data-series-index", index)
      .attr("fill", color)
      .attr("fill-opacity", AREA.opacity)
      .attr("stroke", color)
      .attr("stroke-width", AREA.strokeWidth)
      .attr("stroke-opacity", AREA.strokeOpacity)
      .attr("d", areaGenerator);

    if (animate) {
      // Animate by clipping from left to right
      const clipId = `area-clip-${seriesId}-${Date.now()}`;

      g.append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 0)
        .attr("height", yScale.range()[0] + 10)
        .transition()
        .duration(CHART_DEFAULTS.animationDuration)
        .ease(d3.easeCubicInOut)
        .attr("width", xScale.range()[1]);

      area.attr("clip-path", `url(#${clipId})`);
    }
  });
}

/**
 * Update area opacities for hover effect
 */
export function updateAreaOpacities(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  hoveredSeriesId: string | null,
): void {
  g.selectAll(".area").each(function () {
    const path = d3.select(this);
    const seriesId = path.attr("data-series-id");

    if (hoveredSeriesId === null) {
      // No hover - reset all to normal
      path.transition().duration(200).attr("fill-opacity", AREA.opacity);
    } else if (seriesId === hoveredSeriesId) {
      // This is hovered - highlight
      path.transition().duration(200).attr("fill-opacity", AREA.hoverOpacity);
    } else {
      // Not hovered - dim
      path.transition().duration(200).attr("fill-opacity", AREA.dimmedOpacity);
    }
  });
}
