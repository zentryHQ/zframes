import type { EventMarker, FrameInstance } from "@zframes/spec";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * The event-annotation layer.
 *
 * The dashboard declares `events` — dated things that happened — and every
 * time-axis chart draws them, so one authored list lines the same rate cut up
 * against price, TVL and funding at once. That is why it lives at board level
 * and not in each frame's config: the whole value is the SAME marker appearing
 * on several charts, and duplicating it per card is how the copies drift.
 *
 * A card narrows the board's list (`eventGroups`), adds its own
 * (`FrameInstance.events`), or opts out entirely (`showEvents: false`) — the
 * same board-then-card shape as the display currency.
 *
 * Nothing here fetches: no feed knows which events a given board cares about,
 * and a marker's whole job is to carry the reader's own interpretation.
 */

/** An event with its date parsed, ready for a chart's time scale. */
export interface ResolvedEvent {
  date: Date;
  label: string;
  note?: string;
  color?: string;
  url?: string;
  group?: string;
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

/** Parse + sort, dropping anything undated. Stable identity for equal input. */
const resolve = (markers: readonly EventMarker[]): ResolvedEvent[] =>
  markers
    .map((marker) => ({ ...marker, date: parseEventDate(marker.date) }))
    .filter((event) => !Number.isNaN(event.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

/**
 * Publishes the dashboard's event markers to every card. Parsed once for the
 * whole board rather than per chart.
 */
export function DashboardEventsProvider({
  events,
  children,
}: {
  events?: readonly EventMarker[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => (events && events.length > 0 ? resolve(events) : NO_EVENTS),
    [events],
  );
  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

/**
 * Applies one card's view of the board's events: mute, group filter, and its
 * own extra markers. Rendered by FrameContent inside the dashboard provider, so
 * a card with none of these fields set is inert and simply inherits the board.
 */
export function FrameEventsScope({
  instance,
  children,
}: {
  instance: Pick<FrameInstance, "events" | "showEvents" | "eventGroups">;
  children: ReactNode;
}) {
  const inherited = useContext(EventsContext);
  const { events, showEvents, eventGroups } = instance;
  const scoped = useMemo(() => {
    if (showEvents === false) return NO_EVENTS;
    // An explicit group filter is exclusive: an untagged board event is not
    // "macro", so `eventGroups: ["macro"]` must not smuggle it in.
    const board =
      eventGroups && eventGroups.length > 0
        ? inherited.filter(
            (event) =>
              event.group !== undefined && eventGroups.includes(event.group),
          )
        : inherited;
    if (!events || events.length === 0) return board;
    const merged = [...board, ...resolve(events)];
    // The same marker can arrive from both levels (a card repeating a board
    // event to colour it). Keep the card's copy — it is the more specific one.
    const seen = new Map<string, ResolvedEvent>();
    for (const event of merged)
      seen.set(`${event.date.getTime()}|${event.label}`, event);
    return [...seen.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [inherited, events, showEvents, eventGroups]);

  if (scoped === inherited) return <>{children}</>;
  return (
    <EventsContext.Provider value={scoped}>{children}</EventsContext.Provider>
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
