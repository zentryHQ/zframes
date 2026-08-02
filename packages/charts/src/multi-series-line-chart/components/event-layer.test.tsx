// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import * as d3 from "d3";
import { EventLayer } from "./event-layer";
import type { ChartEvent } from "../types";

// The annotation layer's two jobs a chart can't tell you it got wrong: putting
// a flag where its date actually falls (and nowhere else), and staying legible
// when several events land in the same week.

afterEach(cleanup);

const START = new Date("2026-01-01T00:00:00Z");
const END = new Date("2026-12-31T00:00:00Z");
const INNER_WIDTH = 600;

const xScale = d3.scaleTime().domain([START, END]).range([0, INNER_WIDTH]);

function draw(events: ChartEvent[], containerWidth = 700) {
  return render(
    <EventLayer
      events={events}
      xScale={xScale}
      offsetX={50}
      offsetY={20}
      innerWidth={INNER_WIDTH}
      innerHeight={200}
      containerWidth={containerWidth}
    />,
  );
}

const flags = () => screen.queryAllByRole("button");

describe("EventLayer", () => {
  it("draws one flag per event, positioned at its date on the scale", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const { container } = draw([{ date, label: "Halfway" }]);
    expect(flags()).toHaveLength(1);
    // Plot origin (offsetX) plus the scale's own x — a flag that ignores the
    // margin sits over the y-axis labels instead of over its candle.
    expect(flags()[0].style.left).toBe(`${50 + xScale(date)}px`);
    expect(container.querySelector("[data-chart-event-layer]")).not.toBeNull();
  });

  it("drops events outside the plotted window instead of pinning them to an edge", () => {
    draw([
      { date: new Date("2019-05-05T00:00:00Z"), label: "Ancient" },
      { date: new Date("2026-06-01T00:00:00Z"), label: "In window" },
      { date: new Date("2031-01-01T00:00:00Z"), label: "Future" },
    ]);
    expect(flags()).toHaveLength(1);
  });

  it("collapses neighbours into one flag rather than a smear of overlapping dots", () => {
    // Three consecutive days on a year-wide axis are ~1.6px apart.
    draw([
      { date: new Date("2026-06-01T00:00:00Z"), label: "One" },
      { date: new Date("2026-06-02T00:00:00Z"), label: "Two" },
      { date: new Date("2026-06-03T00:00:00Z"), label: "Three" },
    ]);
    expect(flags()).toHaveLength(1);
    expect(flags()[0].getAttribute("aria-label")).toContain("One");
    expect(flags()[0].getAttribute("aria-label")).toContain("Three");
  });

  it("keeps events further apart than a flag as separate markers", () => {
    draw([
      { date: new Date("2026-02-01T00:00:00Z"), label: "Feb" },
      { date: new Date("2026-09-01T00:00:00Z"), label: "Sep" },
    ]);
    expect(flags()).toHaveLength(2);
  });

  it("shows the detail on hover — date, label, note and source link", () => {
    draw([
      {
        date: new Date("2026-06-01T00:00:00Z"),
        label: "ETF approved",
        note: "SEC cleared the spot filing",
        url: "https://example.com/filing",
      },
    ]);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(flags()[0]);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("ETF approved");
    expect(tip.textContent).toContain("SEC cleared the spot filing");

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.com/filing");
    // Opening a source must not hand the tooltip's opener to the target page.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("opens on keyboard focus too, so the detail isn't hover-only", () => {
    draw([{ date: new Date("2026-06-01T00:00:00Z"), label: "Focusable" }]);
    fireEvent.focus(flags()[0]);
    expect(screen.getByRole("tooltip").textContent).toContain("Focusable");
  });

  it("lists every event of a cluster in one tooltip", () => {
    draw([
      { date: new Date("2026-06-01T00:00:00Z"), label: "First" },
      { date: new Date("2026-06-02T00:00:00Z"), label: "Second" },
    ]);
    fireEvent.pointerEnter(flags()[0]);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("First");
    expect(tip.textContent).toContain("Second");
  });

  it("renders nothing at all when no event falls in the window", () => {
    const { container } = draw([
      { date: new Date("2001-01-01T00:00:00Z"), label: "Old" },
    ]);
    expect(container.firstChild).toBeNull();
  });

  it("drops the inline labels on a narrow card, keeping only the flags", () => {
    const wide = draw([
      { date: new Date("2026-06-01T00:00:00Z"), label: "Wide" },
    ]);
    expect(wide.container.textContent).toContain("Wide");
    cleanup();
    const narrow = draw(
      [{ date: new Date("2026-06-01T00:00:00Z"), label: "Narrow" }],
      320,
    );
    expect(narrow.container.textContent).not.toContain("Narrow");
    expect(narrow.container.querySelectorAll("button")).toHaveLength(1);
  });
});

describe("EventLayer clustering threshold", () => {
  // Two flags are 7px wide with a 21px hit area, so the collapse point is a
  // real visual decision, not an arbitrary constant: a pixel under it the dots
  // overlap, a pixel over they read as two. Pin both sides of the line.
  const at = (x: number) => xScale.invert(x);

  it("collapses two markers closer together than the threshold", () => {
    draw([
      { date: at(300), label: "First" },
      { date: at(316), label: "Second" }, // 16px apart — under 18
    ]);
    expect(flags()).toHaveLength(1);
    expect(flags()[0].getAttribute("aria-label")).toContain("Second");
  });

  it("keeps two markers further apart than the threshold separate", () => {
    draw([
      { date: at(300), label: "First" },
      { date: at(320), label: "Second" }, // 20px apart — over 18
    ]);
    expect(flags()).toHaveLength(2);
  });

  it("chains a run of near-neighbours into ONE cluster, not a pair plus a stray", () => {
    // Each gap is under the threshold but the span is not: clustering walks
    // from the group's anchor, so all three belong to the first flag.
    draw([
      { date: at(300), label: "A" },
      { date: at(310), label: "B" },
      { date: at(316), label: "C" },
    ]);
    expect(flags()).toHaveLength(1);
    const label = flags()[0].getAttribute("aria-label") ?? "";
    expect(label).toContain("A");
    expect(label).toContain("B");
    expect(label).toContain("C");
  });
});

describe("EventLayer tooltip interaction", () => {
  const marker = [
    {
      date: new Date("2026-06-01T00:00:00Z"),
      label: "ETF approved",
      url: "https://example.com/filing",
    },
  ];

  afterEach(() => vi.useRealTimers());

  it("stays open while the pointer crosses into the tooltip, so its link is reachable", () => {
    // The flag and the tooltip are separate elements: closing on `pointerleave`
    // alone snatches the tooltip away mid-travel and the source link can never
    // be clicked. A hover-intent delay is what makes it reachable.
    vi.useFakeTimers();
    draw(marker);
    fireEvent.pointerEnter(flags()[0]);
    fireEvent.pointerLeave(flags()[0]);
    fireEvent.pointerEnter(screen.getByRole("tooltip"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("closes shortly after the pointer leaves both", () => {
    vi.useFakeTimers();
    draw(marker);
    fireEvent.pointerEnter(flags()[0]);
    fireEvent.pointerLeave(flags()[0]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on click, so a touch user can open and dismiss it", () => {
    draw(marker);
    fireEvent.click(flags()[0]);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.click(flags()[0]);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on blur, so keyboard focus doesn't strand an open tooltip", () => {
    vi.useFakeTimers();
    draw(marker);
    fireEvent.focus(flags()[0]);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.blur(flags()[0]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
