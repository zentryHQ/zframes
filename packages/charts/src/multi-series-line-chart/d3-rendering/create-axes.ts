import * as d3 from "d3";
import { ChartTimeframe } from "../../lib/timeframe";
import { parseMarketData } from "../../lib/format";
import { formatChartDateForTimeframe } from "../utils";
import { AXIS } from "../constants";

export const createAxes = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleTime<number, number, never>,
  yScale: d3.ScaleLinear<number, number, never>,
  innerHeight: number,
  timeframe: ChartTimeframe,
  formatValue?: (value: number) => string,
  innerWidth?: number,
): void => {
  // d3 treats .ticks(n) as a HINT and rounds time scales to calendar
  // boundaries, so .ticks() can still emit more labels than asked and overlap
  // on narrow charts (the reported "garbled" x-axis was smashed-together
  // labels). Derive explicit tickValues and hard-cap the count so labels stay
  // ~72px apart at any frame width, regardless of d3's calendar rounding.
  const MIN_LABEL_PX = 72; // ~ "Jul 09" at 12px/700 + breathing room
  const maxXTicks =
    innerWidth !== undefined
      ? Math.max(
          2,
          Math.min(AXIS.xTicks, Math.floor(innerWidth / MIN_LABEL_PX)),
        )
      : AXIS.xTicks;
  const candidateXTicks = xScale.ticks(maxXTicks);
  const xTickStride = Math.max(
    1,
    Math.ceil(candidateXTicks.length / maxXTicks),
  );
  const xTickValues = candidateXTicks.filter((_, i) => i % xTickStride === 0);

  // X-axis
  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(xTickValues)
        .tickSize(AXIS.tickSize)
        .tickFormat((domainValue: Date | d3.NumberValue) => {
          if (domainValue instanceof Date) {
            return formatChartDateForTimeframe(
              domainValue.toISOString(),
              timeframe,
            );
          }
          return String(domainValue);
        }),
    )
    .style("font-size", "12px")
    .style("font-weight", "700")
    .style("font-family", "var(--font-manrope)");

  xAxisG
    .select(".domain")
    .attr("stroke", AXIS.domainColor)
    .attr("stroke-width", 1)
    .attr("stroke-opacity", AXIS.domainOpacity);

  xAxisG
    .selectAll(".tick line")
    .attr("stroke", AXIS.tickColor)
    .attr("transform", "translate(0, 4)");

  xAxisG
    .selectAll(".tick text")
    .attr("dy", "1.2em")
    .style("fill", AXIS.domainColor)
    .style("opacity", AXIS.textOpacity);

  const xSubAxisG = g
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(AXIS.xSubTicks)
        .tickSize(AXIS.subTickSize)
        .tickFormat(() => ""),
    );

  xSubAxisG.select(".domain").remove();

  xSubAxisG
    .selectAll(".tick line")
    .attr("stroke", AXIS.tickColor)
    .attr("transform", "translate(0, 4)");

  const [minValue, maxValue] = yScale.domain();
  const yTickValues: number[] = [];
  const numTicks = 5;

  for (let i = 0; i < numTicks; i++) {
    const value = minValue + ((maxValue - minValue) / (numTicks - 1)) * i;
    yTickValues.push(value);
  }

  const yAxisG = g
    .append("g")
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(yTickValues)
        .tickSize(AXIS.yTicks)
        .tickFormat((d) =>
          formatValue ? formatValue(d as number) : parseMarketData(d as number),
        ),
    )
    .style("font-size", "12px")
    .style("color", AXIS.domainColor)
    .style("font-family", "var(--font-dmsans)")
    .style("opacity", AXIS.textOpacity)
    .style("font-weight", "700");

  yAxisG.select(".domain").attr("stroke", "none");
  yAxisG.selectAll(".tick line").attr("stroke", "none");
};
