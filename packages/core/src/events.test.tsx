// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { EventMarker } from "@zframes/spec/spec";
import { FrameEventsProvider, useEvents } from "./events";

// The event-annotation layer's resolution rules, exercised through the real
// provider + hook. What actually matters:
//
//  - a bare "YYYY-MM-DD" must land on LOCAL midnight, or in any western
//    timezone the flag draws a day left of the candle it annotates (UTC parsing
//    is the default and would pass a naive test run in UTC CI);
//  - markers are per CARD, so one card's list must never reach another's chart
//    — a leak would silently annotate a TVL chart with TSLA earnings.

afterEach(cleanup);

function Probe({
  onRender,
}: {
  onRender: (events: ReturnType<typeof useEvents>) => void;
}) {
  onRender(useEvents());
  return null;
}

/** Render one card's scope, returning what a chart inside it would draw. */
function resolve(events?: EventMarker[]) {
  let seen: ReturnType<typeof useEvents> = [];
  render(
    <FrameEventsProvider instance={{ events }}>
      <Probe onRender={(e) => (seen = e)} />
    </FrameEventsProvider>,
  );
  return seen;
}

const FOMC: EventMarker = { date: "2026-03-18", label: "FOMC +25bp" };
const HACK: EventMarker = { date: "2026-05-02", label: "Bridge hack" };

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
    const authored = [HACK, FOMC, { date: "2026-04-01", label: "Middle" }];
    expect(resolve(authored).map((e) => e.label)).toEqual([
      "FOMC +25bp",
      "Middle",
      "Bridge hack",
    ]);
  });

  it("drops an unparseable date rather than rendering an Invalid Date flag", () => {
    expect(resolve([{ date: "not-a-date", label: "Nope" }, FOMC])).toHaveLength(
      1,
    );
  });

  it("carries the marker's own note, colour and link through to the chart", () => {
    const [event] = resolve([
      { ...FOMC, note: "why", color: "#f5a524", url: "https://example.com/a" },
    ]);
    expect(event).toMatchObject({
      label: "FOMC +25bp",
      note: "why",
      color: "#f5a524",
      url: "https://example.com/a",
    });
  });

  it("resolves to nothing when the card declares no events", () => {
    expect(resolve(undefined)).toEqual([]);
    expect(resolve([])).toEqual([]);
  });

  it("keeps one card's markers out of another card's chart", () => {
    // The reason markers live on the instance: sibling cards are independent,
    // and a leak here would put TSLA earnings on a TVL chart.
    const seen: Record<string, string[]> = {};
    render(
      <>
        <FrameEventsProvider instance={{ events: [FOMC] }}>
          <Probe onRender={(e) => (seen.a = e.map((x) => x.label))} />
        </FrameEventsProvider>
        <FrameEventsProvider instance={{ events: [HACK] }}>
          <Probe onRender={(e) => (seen.b = e.map((x) => x.label))} />
        </FrameEventsProvider>
        <FrameEventsProvider instance={{}}>
          <Probe onRender={(e) => (seen.c = e.map((x) => x.label))} />
        </FrameEventsProvider>
      </>,
    );
    expect(seen).toEqual({
      a: ["FOMC +25bp"],
      b: ["Bridge hack"],
      c: [],
    });
  });

  it("hands charts a stable array while nothing changes, so a D3 redraw isn't forced", () => {
    // A fresh `instance` object every render is the real-world case (the editor
    // rebuilds it constantly); only the `events` array identity is stable, and
    // that is what must keep the resolved list — and the chart's redraw — still.
    const events = [FOMC];
    const seen: ReturnType<typeof useEvents>[] = [];
    const { rerender } = render(
      <FrameEventsProvider instance={{ events }}>
        <Probe onRender={(e) => seen.push(e)} />
      </FrameEventsProvider>,
    );
    rerender(
      <FrameEventsProvider instance={{ events }}>
        <Probe onRender={(e) => seen.push(e)} />
      </FrameEventsProvider>,
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
