import * as d3 from "d3";
import { memo, useEffect, useRef, useState } from "react";
import { observeResize } from "./lib/observe-resize";
import {
  type ChartTooltipContent,
  hideChartTooltip,
  moveChartTooltip,
  showChartTooltip,
} from "./lib/chart-tooltip";
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
  /** Outer diameter in px. Default 180. Ignored when `fill` is set. */
  size?: number;
  /**
   * LAYOUT: size the gauge to its container instead of the `size` prop, taking
   * the SMALLER of the container's two sides so the dial stays circular on a
   * card of any shape. Opt-in; with it off the gauge renders exactly as before.
   *
   * Not to be confused with the SVG paint attribute of the same name, nor with
   * liveline's gradient-area `fill` — this one is purely about geometry.
   */
  fill?: boolean;
  /** Arc thickness in px. Default 12. */
  thickness?: number;
  /** Renders the reading and the bounds in the hover tooltip. */
  formatValue?: (value: number) => string;
  /** Center slot — headline number / classification chip. */
  children?: React.ReactNode;
}

// 270° sweep, opening at the bottom.
const START_ANGLE = (-3 * Math.PI) / 4;
const END_ANGLE = (3 * Math.PI) / 4;

const DEFAULT_FORMAT_VALUE = (v: number) => String(v);

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
  fill = false,
  thickness = 12,
  formatValue = DEFAULT_FORMAT_VALUE,
  children,
}: RadialGaugeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const shouldIntro = useChartIntro();
  // A dial is square, so one number describes it: the smaller side of whatever
  // box it was given. A zero measurement (first paint, before layout settles)
  // falls back to the prop rather than collapsing the gauge to nothing.
  const dial = fill && measured ? measured : size;

  useEffect(() => {
    if (!fill) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const side = Math.min(r.width, r.height);
      setMeasured((prev) =>
        prev !== null && Math.abs(prev - side) < 0.5 ? prev : side,
      );
    };
    update();
    return observeResize(el, update);
  }, [fill]);
  // The angle currently painted — kept live by `applyAngle` so an effect that
  // re-runs mid-sweep continues from the visible angle, not the interrupted
  // transition's target.
  const drawnAngleRef = useRef(START_ANGLE);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl);

    const outer = dial / 2 - 2;
    const inner = outer - thickness;
    const fraction =
      max > min ? Math.min(Math.max((value - min) / (max - min), 0), 1) : 0;
    const valueAngle = START_ANGLE + fraction * (END_ANGLE - START_ANGLE);

    const g = svg
      .append("g")
      .attr("transform", `translate(${dial / 2},${dial / 2})`);

    const track = d3
      .arc()
      .innerRadius(inner)
      .outerRadius(outer)
      .cornerRadius(thickness)
      .startAngle(START_ANGLE)
      .endAngle(END_ANGLE);
    const trackPath = g
      .append("path")
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

    // The reading itself already sits in the centre slot, so restating it would
    // be noise; the scale it is bounded by is rendered nowhere else.
    const scaleTip: ChartTooltipContent = {
      rows: [{ value: formatValue(value), color }],
      footer: `of ${formatValue(min)} to ${formatValue(max)}`,
    };
    // Both halves of the ring answer, so hovering anywhere on it works. Neither
    // path carries a datum — the content is closed over instead of formatted
    // from one, hence the raw show/move/hide calls.
    const attachScaleTip = (
      sel: d3.Selection<SVGPathElement, unknown, null, undefined>,
    ) => {
      sel
        .on("pointerenter", function (event: PointerEvent) {
          showChartTooltip(this, event.clientX, event.clientY, scaleTip);
        })
        .on("pointermove", (event: PointerEvent) => {
          moveChartTooltip(event.clientX, event.clientY);
        })
        .on("pointerleave", hideChartTooltip)
        .on("pointercancel", hideChartTooltip);
    };
    attachScaleTip(trackPath);
    attachScaleTip(path);

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
      // No sweep to stop, but the ring under the cursor is still destroyed by
      // the next run's selectAll("*").remove().
      return hideChartTooltip;
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
      // Same reason: the hovered ring does not survive the next run, and a
      // tooltip left open would point at nothing.
      hideChartTooltip();
    };
  }, [
    value,
    min,
    max,
    color,
    trackColor,
    dial,
    thickness,
    formatValue,
    shouldIntro,
  ]);

  return (
    <div
      ref={wrapRef}
      className={
        fill
          ? // `flex-1` as well as `h-full`: a filling gauge is usually one item
            // in a flex column (a caption above or below it), where `h-full`
            // alone resolves to the WHOLE container and pushes its siblings
            // out. As a flex child this claims only the free space; anywhere
            // else it is inert, so the non-flex callers pay nothing for it.
            "relative flex h-full min-h-0 w-full flex-1 items-center justify-center"
          : "relative"
      }
      style={fill ? undefined : { width: size, height: size }}
    >
      <svg ref={svgRef} width={dial} height={dial} />
      {/* `inset-0` spans the whole gauge, ring included, so without this the
          centre slot swallows every pointer event and the arc beneath it can
          never be hovered. The slot is a readout, not a control — it has nothing
          to catch. (PieChart avoids the same trap the other way round, by
          stacking its svg above with `z-10`.) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};

export default memo(RadialGauge);
