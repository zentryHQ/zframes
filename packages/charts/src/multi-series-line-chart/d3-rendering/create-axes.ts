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
  // d3 treats .ticks(n) as a hint and rounds time scales to calendar
  // boundaries, so narrow charts overflow with overlapping labels.
  // ~70px per "MMM dd" label keeps them readable at any frame width.
  const xTicks =
    innerWidth !== undefined
      ? Math.max(2, Math.min(AXIS.xTicks, Math.floor(innerWidth / 70)))
      : AXIS.xTicks;

  // X-axis
  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(xTicks)
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
