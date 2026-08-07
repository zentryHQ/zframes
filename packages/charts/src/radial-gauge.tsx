import * as d3 from "d3";
import { memo, useEffect, useRef } from "react";
import { useChartIntro } from "./lib/use-chart-intro";
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
  const shouldIntro = useChartIntro();
  // The angle currently painted — kept live by `applyAngle` so an effect that
  // re-runs mid-sweep continues from the visible angle, not the interrupted
  // transition's target.
  const drawnAngleRef = useRef(START_ANGLE);

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
    const path = g.append("path").attr("fill", color);

    // Reading tick — rides the sweep with the fill instead of jumping ahead.
    const tickR = (inner + outer) / 2;
    const tick = g
      .append("circle")
      .attr("r", thickness / 2 + 2)
      .attr("fill", color)
      .attr("stroke", "var(--color-card, #101014)")
      .attr("stroke-width", 2);

    // One writer for both marks, so fill and tick can never disagree.
    const applyAngle = (angle: number) => {
      drawnAngleRef.current = angle;
      path.attr("d", fillArc({ endAngle: angle } as never) ?? "");
      tick
        .attr("cx", Math.sin(angle) * tickR)
        .attr("cy", -Math.cos(angle) * tickR);
    };

    // Intro: sweep from the track's start. Update: continue from the angle
    // already on screen — this gauge is the one chart that keeps animating after
    // its intro, because a live needle that teleports reads worse than one that
    // travels.
    //
    // The intro is gated on `useChartIntro`'s grace window rather than a
    // first-draw flag: a flag is burned by StrictMode's immediate second effect
    // run, which would silently downgrade the very first sweep to the shorter
    // update one. The window's cost here is that a value arriving in the first
    // second still counts as intro and sweeps from START_ANGLE — a reading that
    // moves that early has nothing meaningful to travel from anyway.
    const isIntro = shouldIntro();
    const fromAngle = isIntro ? START_ANGLE : drawnAngleRef.current;

    // Not folded into `shouldIntro()` (which already honours reduce): the update
    // sweep runs outside the window, so it needs its own check.
    if (prefersReducedMotion() || fromAngle === valueAngle) {
      // Reduced motion, or an incidental redraw (resize / theme / color) that
      // did not move the reading: paint the final state, schedule nothing.
      applyAngle(valueAngle);
      return;
    }

    applyAngle(fromAngle);
    const interp = d3.interpolate(fromAngle, valueAngle);
    g.transition("gauge")
      .duration(isIntro ? 600 : 400)
      .ease(isIntro ? d3.easeCubicInOut : d3.easeCubicOut)
      .tween("gauge-angle", () => (t: number) => applyAngle(interp(t)));

    // Stop this run's sweep before the next one begins. A d3 transition keeps
    // ticking on the timer after `selectAll("*").remove()` detaches its node,
    // and its tween still calls this run's `applyAngle` — so an uninterrupted
    // predecessor could outlive its successor and finish by writing its own
    // target into `drawnAngleRef`, i.e. an angle that is not on screen.
    return () => {
      g.interrupt("gauge");
    };
  }, [value, min, max, color, trackColor, size, thickness, shouldIntro]);

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
