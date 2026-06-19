import * as d3 from "d3";
import { useEffect, useRef } from "react";

const COLORS = ["#FF1F5F", "#81FE90"];

interface PieChartData {
  name: string;
  value: number;
}

interface PieChartProps {
  data: PieChartData[];
  width?: number;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  /** Slice colors, applied in order. Defaults to the built-in 2-color set. */
  colors?: string[];
  children?: React.ReactNode;
}

const PieChart = ({
  data,
  width = 270,
  height = 270,
  innerRadius = 90,
  outerRadius = 100,
  colors = COLORS,
  children,
}: PieChartProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    const centerX = width / 2;
    const centerY = height / 2;

    const defs = svg.append("defs");

    defs
      .append("filter")
      .attr("id", "glow")
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");

    defs
      .select("#glow")
      .append("feMerge")
      .selectAll("feMergeNode")
      .data(["coloredBlur", "SourceGraphic"])
      .enter()
      .append("feMergeNode")
      .attr("in", (d) => d);

    defs
      .append("filter")
      .attr("id", "glow-layer")
      .append("feGaussianBlur")
      .attr("stdDeviation", "6")
      .attr("result", "glowBlur");

    defs
      .select("#glow-layer")
      .append("feColorMatrix")
      .attr("type", "matrix")
      .attr("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0")
      .attr("result", "glowColor");

    const pie = d3
      .pie<PieChartData>()
      .value((d) => d.value)
      .padAngle(0.02); // padding between slices

    const arc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(100);

    const glowArc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(100);

    const colorScale = d3
      .scaleOrdinal()
      .domain(data.map((_, i) => i.toString()))
      .range(colors);

    const pieGroup = svg
      .append("g")
      .attr("transform", `translate(${centerX}, ${centerY})`);

    const sliceGroups = pieGroup
      .selectAll("g")
      .data(pie(data))
      .enter()
      .append("g");

    sliceGroups
      .append("path")
      .attr("class", "glow-layer")
      .attr("d", glowArc)
      .attr("fill", (_, i) => colorScale(i.toString()) as string)
      .attr("filter", "url(#glow-layer)")
      .style("opacity", 0)
      .style("pointer-events", "none");

    sliceGroups
      .append("path")
      .attr("class", "main-slice")
      .attr("d", arc)
      .attr("fill", (_, i) => colorScale(i.toString()) as string)
      .attr("stroke", "none");

    sliceGroups
      .on("mouseenter", function () {
        d3.select(this)
          .select(".glow-layer")
          .transition()
          .duration(300)
          .style("opacity", 1);
      })
      .on("mouseleave", function () {
        d3.select(this)
          .select(".glow-layer")
          .transition()
          .duration(300)
          .style("opacity", 0);
      });
  }, [data, width, height, innerRadius, outerRadius, colors]);

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-full"
      style={{
        background:
          "linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%)",
      }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="relative z-10"
      />

      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(0deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)",
          maskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 1px),#fff 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
        }}
      />
      <div
        className="pointer-events-none absolute inset-[10%] rounded-full"
        style={{
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)",
          maskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 1px),#fff 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
        }}
      />
    </div>
  );
};

export default PieChart;
