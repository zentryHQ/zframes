// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import BubbleChart from "./bubble-chart";

// Reduced motion must take the ANIMATION away, not the interaction: the cloud
// used to lose its drag behaviour entirely under reduce, so a reader who wanted
// to pull a bubble out of a crowded cluster had no way to.

const NODES = [
  { id: "a", label: "AAA", value: 10 },
  { id: "b", label: "BBB", value: 6 },
  { id: "c", label: "CCC", value: 3 },
];

/** d3 stores its `.on("mousedown.drag", …)` bindings on the node itself. */
type WithListeners = Element & {
  __on?: { type: string; name: string }[];
};

const dragBindings = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("g.bubble")).flatMap((node) =>
    ((node as WithListeners).__on ?? []).filter((l) => l.name === "drag"),
  );

function setPreference(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  // jsdom measures everything as 0×0, and the chart draws nothing without a
  // box. `observeResize` also needs a ResizeObserver to exist at all.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BubbleChart under reduced motion", () => {
  it("still draws every bubble", () => {
    setPreference(true);
    const { container } = render(<BubbleChart nodes={NODES} />);
    expect(container.querySelectorAll("g.bubble")).toHaveLength(NODES.length);
  });

  it("keeps the drag behaviour attached", () => {
    setPreference(true);
    const { container } = render(<BubbleChart nodes={NODES} />);
    expect(dragBindings(container).length).toBeGreaterThan(0);
  });

  it("attaches it with motion enabled too, i.e. the preference changes nothing here", () => {
    setPreference(false);
    const { container } = render(<BubbleChart nodes={NODES} />);
    expect(dragBindings(container).length).toBeGreaterThan(0);
  });

  it("lands the layout already settled, with no leftover intro scale", () => {
    setPreference(true);
    const { container } = render(<BubbleChart nodes={NODES} />);
    const scales = Array.from(container.querySelectorAll("g.bubble-scale"));
    expect(scales).toHaveLength(NODES.length);
    // `scale(0)` is the intro's start value: under reduce it is never applied,
    // so a bubble is never invisible waiting for a transition that won't run.
    for (const scale of scales) {
      expect(scale.getAttribute("transform")).toBeNull();
    }
    // Positioned, not stacked at the origin.
    const placed = Array.from(container.querySelectorAll("g.bubble")).map(
      (node) => node.getAttribute("transform"),
    );
    expect(new Set(placed).size).toBe(NODES.length);
  });
});
