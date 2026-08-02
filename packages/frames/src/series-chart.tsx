import {
  MultiSeriesLineChart,
  type MultiSeriesLineChartProps,
} from "@zframes/charts";
import { useEvents } from "@zframes/core";

/**
 * The time-series line chart every frame should use — `MultiSeriesLineChart`
 * plus the dashboard's event markers (`spec.events`, narrowed per card).
 *
 * Frames import THIS, never the raw chart: the whole point of board-level
 * events is that one authored list appears on every history chart at once, and
 * that only holds if adopting the layer is the default rather than something a
 * new frame has to remember. `tests/chart-events-coverage.test.ts` enforces it.
 *
 * Pass `events` explicitly to override the board's list for one chart.
 */
export function TimeSeriesChart({
  events,
  ...props
}: MultiSeriesLineChartProps) {
  const boardEvents = useEvents();
  return <MultiSeriesLineChart {...props} events={events ?? boardEvents} />;
}
