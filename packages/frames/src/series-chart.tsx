import {
  MultiSeriesLineChart,
  type MultiSeriesLineChartProps,
} from "@zframes/charts";
import { useEvents } from "@zframes/core";

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
 */
export function TimeSeriesChart({
  events,
  ...props
}: MultiSeriesLineChartProps) {
  const cardEvents = useEvents();
  return <MultiSeriesLineChart {...props} events={events ?? cardEvents} />;
}
