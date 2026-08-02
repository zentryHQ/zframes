// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { EventMarker, FrameInstance } from "@zframes/spec/spec";
import { DashboardEventsProvider, FrameEventsScope, useEvents } from "./events";

// The event-annotation layer's resolution rules, exercised through the real
// provider + hook. What actually matters:
//
//  - a bare "YYYY-MM-DD" must land on LOCAL midnight, or in any western
//    timezone the flag draws a day left of the candle it annotates (UTC parsing
//    is the default and would pass a naive test run in UTC CI);
//  - a card's view of the board list is subtractive by group, additive by its
//    own markers, and mutable to nothing — three branches a chart can't show
//    you are broken, because a missing flag looks like "no event that day".

afterEach(cleanup);

function Probe({
  onRender,
}: {
  onRender: (events: ReturnType<typeof useEvents>) => void;
}) {
  onRender(useEvents());
  return null;
}

/** Render board + card scope, returning what a chart inside the card would draw. */
function resolve(
  board: EventMarker[] | undefined,
  card: Partial<
    Pick<FrameInstance, "events" | "showEvents" | "eventGroups">
  > = {},
) {
  let seen: ReturnType<typeof useEvents> = [];
  render(
    <DashboardEventsProvider events={board}>
      <FrameEventsScope instance={card}>
        <Probe onRender={(events) => (seen = events)} />
      </FrameEventsScope>
    </DashboardEventsProvider>,
  );
  return seen;
}

const FOMC: EventMarker = {
  date: "2026-03-18",
  label: "FOMC +25bp",
  group: "macro",
};
const HACK: EventMarker = {
  date: "2026-05-02",
  label: "Bridge hack",
  group: "crypto",
};
const UNTAGGED: EventMarker = { date: "2026-04-01", label: "Something" };

describe("event resolution", () => {
  it("parses a bare calendar date as local midnight, not UTC", () => {
    const [event] = resolve([FOMC]);
    expect(event.date.getFullYear()).toBe(2026);
    expect(event.date.getMonth()).toBe(2);
    expect(event.date.getDate()).toBe(18);
    expect(event.date.getHours()).toBe(0);
  });

  it("keeps an explicit timestamp's own instant", () => {
    const [event] = resolve([{ date: "2026-03-18T14:30:00Z", label: "CPI" }]);
    expect(event.date.toISOString()).toBe("2026-03-18T14:30:00.000Z");
  });

  it("sorts chronologically whatever order they were authored in", () => {
    expect(resolve([HACK, FOMC, UNTAGGED]).map((e) => e.label)).toEqual([
      "FOMC +25bp",
      "Something",
      "Bridge hack",
    ]);
  });

  it("drops an unparseable date rather than rendering an Invalid Date flag", () => {
    expect(resolve([{ date: "not-a-date", label: "Nope" }, FOMC])).toHaveLength(
      1,
    );
  });

  it("gives a card with no event fields the whole board list", () => {
    expect(resolve([FOMC, HACK])).toHaveLength(2);
  });

  it("mutes a card with showEvents: false", () => {
    expect(resolve([FOMC, HACK], { showEvents: false })).toEqual([]);
  });

  it("narrows to the requested groups, excluding untagged events", () => {
    // An untagged marker is not "macro" — a group filter must be exclusive, or
    // scoping earnings to one card leaks every unlabelled board event onto it.
    const events = resolve([FOMC, HACK, UNTAGGED], { eventGroups: ["macro"] });
    expect(events.map((e) => e.label)).toEqual(["FOMC +25bp"]);
  });

  it("adds a card's own markers on top of the board's", () => {
    const events = resolve([FOMC], {
      events: [{ date: "2026-06-01", label: "Q2 earnings" }],
    });
    expect(events.map((e) => e.label)).toEqual(["FOMC +25bp", "Q2 earnings"]);
  });

  it("keeps card markers even when a group filter excludes the board's", () => {
    const events = resolve([FOMC], {
      eventGroups: ["nothing-matches"],
      events: [{ date: "2026-06-01", label: "Q2 earnings" }],
    });
    expect(events.map((e) => e.label)).toEqual(["Q2 earnings"]);
  });

  it("lets a card's copy win over the board's duplicate of the same marker", () => {
    const events = resolve([FOMC], {
      events: [{ date: "2026-03-18", label: "FOMC +25bp", color: "#ff0000" }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].color).toBe("#ff0000");
  });

  it("resolves to nothing when the board declares no events", () => {
    expect(resolve(undefined)).toEqual([]);
    expect(resolve([])).toEqual([]);
  });

  it("hands charts a stable array while nothing changes, so a D3 redraw isn't forced", () => {
    const board = [FOMC];
    const seen: ReturnType<typeof useEvents>[] = [];
    const { rerender } = render(
      <DashboardEventsProvider events={board}>
        <Probe onRender={(events) => seen.push(events)} />
      </DashboardEventsProvider>,
    );
    rerender(
      <DashboardEventsProvider events={board}>
        <Probe onRender={(events) => seen.push(events)} />
      </DashboardEventsProvider>,
    );
    expect(seen[0]).toBe(seen[1]);
  });
});
