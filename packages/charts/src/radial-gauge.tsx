import * as d3 from "d3";
import { memo, useEffect, useRef } from "react";
import { prefersReducedMotion } from "./lib/utils";

export interface RadialGaugeProps {
  /** Current reading — clamped into [min, max]. */
  value: number;
  min?: number;
  max?: number;
  /** Arc + needle color (a CSS color, var() allowed). */
  color?: string;
  /** Unfilled-track color. Defaults to a faint currentColor. */
  trackColor?: string;
  /** Outer diameter in px. Default 180. */
  size?: number;
  /** Arc thickness in px. Default 12. */
  thickness?: number;
  /** Center slot — headline number / classification chip. */
  children?: React.ReactNode;
}

// 270° sweep, opening at the bottom.
const START_ANGLE = (-3 * Math.PI) / 4;
const END_ANGLE = (3 * Math.PI) / 4;

/**
 * Radial gauge — a bounded scalar (sentiment index, ratio, progress) as a
 * partially-filled arc with a center content slot. Pure presentation; the
 * caller resolves semantic colors.
 */
const RadialGauge = ({
  value,
  min = 0,
  max = 100,
  color = "var(--color-highlight, #8b8bff)",
  trackColor,
  size = 180,
  thickness = 12,
  children,
}: RadialGaugeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl);

    const outer = size / 2 - 2;
    const inner = outer - thickness;
    const fraction =
      max > min ? Math.min(Math.max((value - min) / (max - min), 0), 1) : 0;
    const valueAngle = START_ANGLE + fraction * (END_ANGLE - START_ANGLE);

    const g = svg
      .append("g")
      .attr("transform", `translate(${size / 2},${size / 2})`);

    const track = d3
      .arc()
      .innerRadius(inner)
      .outerRadius(outer)
      .cornerRadius(thickness)
      .startAngle(START_ANGLE)
      .endAngle(END_ANGLE);
    g.append("path")
      .attr("d", track as unknown as string)
      .attr("fill", trackColor ?? "currentColor")
      .attr("fill-opacity", trackColor ? 1 : 0.12);

    const fillArc = d3
      .arc()
      .innerRadius(inner)
      .outerRadius(outer)
      .cornerRadius(thickness)
      .startAngle(START_ANGLE);
    const path = g
      .append("path")
      .attr("fill", color)
      .attr("d", fillArc({ endAngle: START_ANGLE } as never) ?? "");

    if (prefersReducedMotion()) {
      path.attr("d", fillArc({ endAngle: valueAngle } as never) ?? "");
    } else {
      path
        .transition()
        .duration(600)
        .attrTween("d", () => {
          const interp = d3.interpolate(START_ANGLE, valueAngle);
          return (t) => fillArc({ endAngle: interp(t) } as never) ?? "";
        });
    }

    // Reading tick at the value angle.
    const tickR = (inner + outer) / 2;
    g.append("circle")
      .attr("cx", Math.sin(valueAngle) * tickR)
      .attr("cy", -Math.cos(valueAngle) * tickR)
      .attr("r", thickness / 2 + 2)
      .attr("fill", color)
      .attr("stroke", "var(--color-card, #101014)")
      .attr("stroke-width", 2);
  }, [value, min, max, color, trackColor, size, thickness]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg ref={svgRef} width={size} height={size} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};

export default memo(RadialGauge);
