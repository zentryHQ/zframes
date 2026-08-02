import type { EventMarker, FrameInstance } from "@zframes/spec";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * The event-annotation layer.
 *
 * A card declares its own `events` — dated things that happened — and its
 * time-axis chart draws them, so a move can be read against what caused it.
 * They live on the CARD, not the dashboard: the events that explain a TSLA
 * chart are not the ones that explain a TVL chart, and a board-wide list would
 * put every flag on every chart whether it belonged there or not.
 *
 * Nothing here fetches: no feed knows which events a given chart cares about,
 * and a marker's whole job is to carry the reader's own interpretation.
 */

/** An event with its date parsed, ready for a chart's time scale. */
export interface ResolvedEvent {
  date: Date;
  label: string;
  note?: string;
  color?: string;
  url?: string;
}

const NO_EVENTS: ResolvedEvent[] = [];

const EventsContext = createContext<ResolvedEvent[]>(NO_EVENTS);

/**
 * A bare `YYYY-MM-DD` parses as UTC midnight, which in a western timezone lands
 * on the previous day locally — the flag would sit a day left of the candle it
 * annotates. Read the calendar date as LOCAL midnight so a marker stands where
 * the reader expects; timestamps that carry a zone are left alone.
 */
const parseEventDate = (value: string): Date => {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  return new Date(value);
};

/** Parse + sort, dropping anything undated. */
const resolve = (markers: readonly EventMarker[]): ResolvedEvent[] =>
  markers
    .map((marker) => ({ ...marker, date: parseEventDate(marker.date) }))
    .filter((event) => !Number.isNaN(event.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

/**
 * Publishes one card's event markers to the chart inside it. Rendered by
 * FrameContent around every frame, so a card that declares none is inert and
 * its chart simply draws no flags.
 */
export function FrameEventsProvider({
  instance,
  children,
}: {
  instance: Pick<FrameInstance, "events">;
  children: ReactNode;
}) {
  const { events } = instance;
  const value = useMemo(
    () => (events && events.length > 0 ? resolve(events) : NO_EVENTS),
    [events],
  );
  if (value === NO_EVENTS) return <>{children}</>;
  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

/**
 * The event markers this card should draw, date-parsed and sorted. Time-axis
 * charts pass them straight to `MultiSeriesLineChart`'s `events` prop; every
 * other frame ignores the layer entirely.
 */
export function useEvents(): ResolvedEvent[] {
  return useContext(EventsContext);
}
