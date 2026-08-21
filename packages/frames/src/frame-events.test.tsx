// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { installChartEnv } from "./testing/jsdom-chart-env";
import {
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  createRegistry,
  type DashboardSpec,
} from "@zframes/core";
import { allFrames } from "./index";
import { allFrameMetas } from "./schemas";
import { MockMarketDataProvider } from "@zframes/provider-demo";

/**
 * WHAT THIS PINS — that a card's `events` actually reach its chart, through the
 * real render path: spec → DashboardRenderer → FrameContent →
 * FrameEventsProvider → the frame → TimeSeriesChart → EventLayer.
 *
 * Every other test in this feature covers one link of that chain in isolation:
 * `core/events.test.tsx` drives the provider directly, the chart layer's own
 * suite drives `EventLayer` with hand-made scales, and
 * `tests/chart-events-coverage.test.ts` greps sources. NONE of them render a
 * frame instance. Deleting the `<FrameEventsProvider>` wrapper from
 * `FrameContent` — which silently disables the whole feature — left all 2296
 * of those tests green, which is why this file exists.
 *
 * REAL FAILURE IT CATCHES: markers authored on a card, saved, reloaded, and
 * simply never drawn. Nothing errors, no card goes red, the chart looks
 * perfectly fine — it just quietly ignores the annotations, and the only way to
 * notice is to remember what you wrote.
 */

const registry = createRegistry(allFrames);
const provider = new MockMarketDataProvider("normal");

// A chart needs a measurable container, a visibility signal and SVG geometry
// before it draws anything — without them every DOM assertion below would pass
// against an empty card.
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = installChartEnv();
});
afterAll(() => restoreEnv());

/** Dated relative to now, like the mock provider's own series. */
const daysAgo = (days: number): string => {
  const d = new Date(Date.now() - days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MARKERS = [
  { date: daysAgo(40), label: "Rate decision", note: "why it moved" },
  { date: daysAgo(12), label: "Earnings" },
];

function board(frame: string, events?: unknown[]): DashboardSpec {
  return DashboardSpecSchema.parse({
    title: "events",
    grid: { columns: 12, rowHeight: 96, rows: 6 },
    frames: [
      {
        id: "card",
        frame,
        position: { x: 0, y: 0, w: 8, h: 4 },
        ...(events ? { events } : {}),
        config: { symbol: "BTC", lookback: "3M" },
      },
    ],
  });
}

/** Render a one-card board and let the frame's data hooks settle. */
async function draw(spec: DashboardSpec) {
  const view = render(
    <FramesProvider providers={[provider]}>
      <DashboardRenderer spec={spec} registry={registry} />
    </FramesProvider>,
  );
  // Lazy frame chunk + the mock provider's first resolve.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

const flagCount = (root: HTMLElement) =>
  root.querySelectorAll("[data-chart-event-layer] button").length;

afterEach(cleanup);

describe("a card's events reach its chart", () => {
  it("draws a flag per marker on an annotatable frame", async () => {
    const { container } = await draw(board("price-events", MARKERS));
    expect(flagCount(container)).toBe(MARKERS.length);
  });

  it("puts the marker's own label and note in the DOM, not just a dot", async () => {
    const { container } = await draw(board("price-events", MARKERS));
    const layer = container.querySelector("[data-chart-event-layer]");
    // The label rides the flag's accessible name; the note lives in the tooltip
    // markup, which only exists once opened — so pin the name here.
    const names = [...(layer?.querySelectorAll("button") ?? [])].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(names.join(" ")).toContain("Rate decision");
    expect(names.join(" ")).toContain("Earnings");
  });

  it("draws no layer at all when the card declares no events", async () => {
    const { container } = await draw(board("price-events"));
    expect(container.querySelector("[data-chart-event-layer]")).toBeNull();
  });

  it("ignores markers on a frame that isn't annotatable", async () => {
    // `price-ticker` has no time axis; a marker on it is inert by design, and
    // must not throw or render stray chrome.
    const { container } = await draw(board("price-ticker", MARKERS));
    expect(container.querySelector("[data-chart-event-layer]")).toBeNull();
  });

  it("keeps each card's markers on its own chart", async () => {
    // The per-card model's core promise. Two annotatable cards, different
    // lists: neither may show the other's flags.
    const spec = DashboardSpecSchema.parse({
      title: "two cards",
      grid: { columns: 12, rowHeight: 96, rows: 6 },
      frames: [
        {
          id: "a",
          frame: "price-events",
          position: { x: 0, y: 0, w: 6, h: 4 },
          events: [{ date: daysAgo(30), label: "Only on A" }],
          config: { symbol: "BTC", lookback: "3M" },
        },
        {
          id: "b",
          frame: "price-events",
          position: { x: 6, y: 0, w: 6, h: 4 },
          config: { symbol: "ETH", lookback: "3M" },
        },
      ],
    });
    const { container } = await draw(spec);
    const cards = [...container.querySelectorAll(".zf-frame")];
    const perCard = cards.map(
      (c) => c.querySelectorAll("[data-chart-event-layer] button").length,
    );
    expect(perCard.filter((n) => n > 0)).toHaveLength(1);
    expect(flagCount(container)).toBe(1);
  });

  it("drops a marker that falls outside the chart's window", async () => {
    const { container } = await draw(
      board("price-events", [
        { date: daysAgo(20), label: "In window" },
        { date: "2011-01-01", label: "Ancient" },
      ]),
    );
    expect(flagCount(container)).toBe(1);
  });
});

describe("annotatable metadata", () => {
  it("is set on the frame this feature is built around", () => {
    const meta = allFrameMetas.find((m) => m.name === "price-events");
    expect(meta?.annotatable).toBe(true);
  });

  it("is absent on frames with no time axis", () => {
    for (const name of [
      "price-ticker",
      "snake",
      "note",
      "market-cap-treemap",
    ]) {
      const meta = allFrameMetas.find((m) => m.name === name);
      expect(
        meta?.annotatable,
        `${name} should not be annotatable`,
      ).toBeUndefined();
    }
  });
});
