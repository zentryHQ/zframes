import {
  MultiSeriesLineChart,
  type MultiSeriesLineChartProps,
} from "@zframes/charts";
import { useEvents } from "@zframes/core";
import type { ReactNode } from "react";

/**
 * The time-series line chart every frame should use — `MultiSeriesLineChart`
 * plus the card's own event markers (`FrameInstance.events`).
 *
 * Frames import THIS, never the raw chart: a frame that reaches past it still
 * renders a perfectly good chart, it just never draws a marker, which looks
 * exactly like a card whose owner annotated nothing. Making adoption the
 * default is the only way that stays true as frames are added;
 * `tests/chart-events-coverage.test.ts` enforces it, and pairs it with the
 * `annotatable` flag on each such frame's meta.
 *
 * Pass `events` explicitly to override what the card declared.
 *
 * `control` is the on-card timeframe toggle (see ./timeframe-toggle). These
 * frames return the chart AS their root — there is no header row to put a
 * control in — so it is overlaid top-right rather than stacked above, which
 * would steal height from every chart on the board. Strictly opt-in: with no
 * `control` the output is exactly what it always was, so the frames that don't
 * have a timeframe field are untouched.
 */
export function TimeSeriesChart({
  control,
  events,
  ...props
}: MultiSeriesLineChartProps & { control?: ReactNode }) {
  const cardEvents = useEvents();
  const chart = (
    <MultiSeriesLineChart {...props} events={events ?? cardEvents} />
  );
  if (!control) return chart;
  return (
    <div className="relative h-full min-h-0">
      {chart}
      {/* pointer-events-auto on the control only, so the chart keeps its own
          hover/tooltip everywhere the buttons aren't. */}
      <div className="pointer-events-none absolute top-0 right-0 z-10">
        <div className="pointer-events-auto">{control}</div>
      </div>
    </div>
  );
}
