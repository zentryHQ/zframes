// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  hideChartTooltip,
  moveChartTooltip,
  placeChartTooltip,
  resetChartTooltip,
  showChartTooltip,
} from "./chart-tooltip";

const VW = 1000;
const VH = 800;

const node = () => document.querySelector<HTMLDivElement>(".zfc-tt");
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** A stand-in for the hovered mark — only read for its computed theme vars. */
function source(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  resetChartTooltip();
  document.body.innerHTML = "";
});

describe("placeChartTooltip", () => {
  it("sits to the right of the cursor and centres on it vertically", () => {
    // Right of the cursor keeps the tooltip clear of the value label a bar or
    // bubble draws directly above itself.
    expect(placeChartTooltip(400, 400, 200, 60, VW, VH)).toEqual({
      left: 414,
      top: 370,
    });
  });

  it("flips to the left when the right side has no room", () => {
    const { left } = placeChartTooltip(950, 400, 200, 60, VW, VH);
    expect(left).toBe(950 - 14 - 200);
  });

  it("keeps the whole box on screen when neither side fits", () => {
    // A 980px-wide tooltip cannot flip anywhere; it must still be fully visible
    // rather than hanging off the right edge.
    const { left } = placeChartTooltip(950, 400, 980, 60, VW, VH);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 980).toBeLessThanOrEqual(VW);
  });

  it("clamps vertically at both edges", () => {
    expect(placeChartTooltip(400, 2, 200, 60, VW, VH).top).toBe(8);
    expect(placeChartTooltip(400, 798, 200, 60, VW, VH).top).toBe(VH - 60 - 8);
  });

  it("never returns a negative offset even when the box exceeds the viewport", () => {
    const { left, top } = placeChartTooltip(10, 10, 2000, 2000, VW, VH);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
  });
});

describe("showChartTooltip", () => {
  it("creates one shared node on the body and renders the content", () => {
    showChartTooltip(source(), 100, 100, {
      title: "Mar 4, 2026",
      rows: [{ label: "TVL", value: "$1.2B", color: "#8b8bff" }],
      footer: "12% of total",
    });

    const el = node();
    expect(el).not.toBeNull();
    expect(el?.parentElement).toBe(document.body);
    expect(el?.classList.contains("zfc-tt--on")).toBe(true);
    expect(el?.querySelector(".zfc-tt-title")?.textContent).toBe("Mar 4, 2026");
    expect(el?.querySelector(".zfc-tt-label")?.textContent).toBe("TVL");
    expect(el?.querySelector(".zfc-tt-val")?.textContent).toBe("$1.2B");
    expect(el?.querySelector(".zfc-tt-foot")?.textContent).toBe("12% of total");
  });

  it("reuses the same node across charts", () => {
    showChartTooltip(source(), 10, 10, { title: "a" });
    const first = node();
    showChartTooltip(source(), 20, 20, { title: "b" });
    expect(node()).toBe(first);
    expect(document.querySelectorAll(".zfc-tt")).toHaveLength(1);
  });

  it("does not rebuild the DOM when the content is unchanged", () => {
    const content = { title: "BTC", rows: [{ value: "$104,200" }] };
    showChartTooltip(source(), 10, 10, content);
    const valueEl = node()?.querySelector(".zfc-tt-val");

    // Same signature, new object — the diff must key on content, not identity,
    // or sliding the cursor along a series rebuilds every frame.
    showChartTooltip(source(), 40, 10, {
      title: "BTC",
      rows: [{ value: "$104,200" }],
    });
    expect(node()?.querySelector(".zfc-tt-val")).toBe(valueEl);
  });

  it("collapses the label column when no row has a label", () => {
    showChartTooltip(source(), 10, 10, { rows: [{ value: "42" }] });
    expect(
      node()?.querySelector<HTMLElement>(".zfc-tt-rows")?.dataset.bare,
    ).toBe("1");

    showChartTooltip(source(), 10, 10, {
      rows: [{ label: "count", value: "42" }],
    });
    expect(
      node()?.querySelector<HTMLElement>(".zfc-tt-rows")?.dataset.bare,
    ).toBe("0");
  });

  it("keeps the swatch visible on a value-only row", () => {
    // A bare row hides its label cell, which used to take the swatch with it —
    // and on a diverging chart the swatch IS the reading (gain vs loss), so a
    // green bar and a red bar produced identical tooltips.
    showChartTooltip(source(), 10, 10, {
      rows: [{ value: "+11.77%", color: "rgb(63, 208, 143)" }],
    });
    const shown = Array.from(
      node()?.querySelectorAll<HTMLElement>(".zfc-tt-sw") ?? [],
    ).filter((el) => el.style.display !== "none");

    expect(shown).toHaveLength(1);
    expect(shown[0].style.background).toBe("rgb(63, 208, 143)");
    // …and it sits in the cell that is actually rendered.
    expect(shown[0].closest(".zfc-tt-val")).not.toBeNull();
  });

  it("moves the swatch back beside the label when rows are labelled", () => {
    showChartTooltip(source(), 10, 10, {
      rows: [{ label: "TVL", value: "$1.2B", color: "rgb(1, 2, 3)" }],
    });
    const shown = Array.from(
      node()?.querySelectorAll<HTMLElement>(".zfc-tt-sw") ?? [],
    ).filter((el) => el.style.display !== "none");

    expect(shown).toHaveLength(1);
    expect(shown[0].closest(".zfc-tt-label")).not.toBeNull();
  });

  it("grows and shrinks the row pool to match the content", () => {
    showChartTooltip(source(), 10, 10, {
      rows: [
        { label: "a", value: "1" },
        { label: "b", value: "2" },
        { label: "c", value: "3" },
      ],
    });
    expect(node()?.querySelectorAll(".zfc-tt-val")).toHaveLength(3);

    showChartTooltip(source(), 10, 10, { rows: [{ label: "a", value: "1" }] });
    expect(node()?.querySelectorAll(".zfc-tt-val")).toHaveLength(1);
  });

  it("hides the title and footer rather than leaving empty boxes", () => {
    showChartTooltip(source(), 10, 10, { rows: [{ value: "1" }] });
    const el = node();
    expect(el?.querySelector<HTMLElement>(".zfc-tt-title")?.style.display).toBe(
      "none",
    );
    expect(el?.querySelector<HTMLElement>(".zfc-tt-foot")?.style.display).toBe(
      "none",
    );
  });

  it("positions synchronously on show", () => {
    // Deferring the first write would flash the tooltip at the previous mark's
    // position for a frame.
    showChartTooltip(source(), 300, 200, { title: "x" });
    expect(node()?.style.transform).toMatch(/^translate3d\(\d+px, \d+px, 0\)$/);
  });
});

describe("theme forwarding", () => {
  it("copies the semantic colour tokens onto the body-level node", () => {
    // A frame's row colour is often `var(--zf-up, #3fd08f)` (changeColor()) and a
    // chart's default is `var(--color-highlight, …)`. Those variables are
    // declared inside `.zf-grid`; on a node parented to <body> they resolve to
    // their hard-coded fallbacks — which are the DEFAULTS, so a board with a
    // custom gain/loss pair shows a wrong-but-plausible swatch. Forwarding them
    // is what makes the substitution resolve here.
    const src = source();
    src.style.setProperty("--zf-up", "#00ff88");
    src.style.setProperty("--zf-down", "#ff0044");
    src.style.setProperty("--zf-accent-hue", "12");
    src.style.setProperty("--zf-accent-sat", "70%");

    showChartTooltip(src, 10, 10, { rows: [{ value: "1" }] });

    const style = node()?.style;
    expect(style?.getPropertyValue("--zf-up")).toBe("#00ff88");
    expect(style?.getPropertyValue("--zf-down")).toBe("#ff0044");
    expect(style?.getPropertyValue("--zf-accent-hue")).toBe("12");
    expect(style?.getPropertyValue("--zf-accent-sat")).toBe("70%");
  });

  it("re-resolves when the pointer crosses to a different chart mid-session", () => {
    // `hide` is deferred a frame, so leaving chart A and entering chart B lands
    // while the session is still open. Resolving once per SESSION would paint B
    // in A's colours — cards can carry their own style override.
    const chartA = source();
    chartA.style.setProperty("--zf-up", "#00ff88");
    showChartTooltip(chartA, 10, 10, { rows: [{ value: "1" }] });
    expect(node()?.style.getPropertyValue("--zf-up")).toBe("#00ff88");

    hideChartTooltip(); // deferred — not committed yet
    showChartTooltip(source(), 20, 20, { rows: [{ value: "2" }] });
    expect(node()?.style.getPropertyValue("--zf-up")).toBe("");
  });

  it("resolves once per chart, not once per mark", () => {
    // Marks of one d3 chart collapse to their owning <svg>, so sweeping a
    // 60-bar chart must not run getComputedStyle 60 times.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
    const marks = [0, 1, 2].map(() => {
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      svg.appendChild(r);
      return r;
    });

    let reads = 0;
    const real = window.getComputedStyle;
    window.getComputedStyle = ((el: Element) => {
      reads += 1;
      return real.call(window, el);
    }) as typeof window.getComputedStyle;
    try {
      marks.forEach((m, i) =>
        showChartTooltip(m, 10 + i, 10, { rows: [{ value: String(i) }] }),
      );
    } finally {
      window.getComputedStyle = real;
    }

    expect(reads).toBe(1);
  });
});

describe("hideChartTooltip", () => {
  it("defers by a frame so a crossing show cancels it", async () => {
    const src = source();
    showChartTooltip(src, 10, 10, { title: "bar 1" });
    hideChartTooltip();
    // Moving from one bar to the next: leave fires before enter.
    showChartTooltip(src, 30, 10, { title: "bar 2" });
    await nextFrame();

    expect(node()?.classList.contains("zfc-tt--on")).toBe(true);
    expect(node()?.querySelector(".zfc-tt-title")?.textContent).toBe("bar 2");
  });

  it("hides on the next frame when the pointer really left", async () => {
    showChartTooltip(source(), 10, 10, { title: "x" });
    hideChartTooltip();
    await nextFrame();
    expect(node()?.classList.contains("zfc-tt--on")).toBe(false);
  });

  it("is a no-op before anything was ever shown", () => {
    expect(() => hideChartTooltip()).not.toThrow();
    expect(node()).toBeNull();
  });
});

describe("moveChartTooltip", () => {
  it("does nothing when no hover session is open", () => {
    // Guards a stale pointermove arriving after the leave — it must not
    // resurrect the tooltip.
    moveChartTooltip(500, 500);
    expect(node()).toBeNull();
  });

  it("coalesces to one write per frame", async () => {
    showChartTooltip(source(), 100, 100, { title: "x" });
    const before = node()?.style.transform;

    moveChartTooltip(200, 100);
    moveChartTooltip(300, 100);
    moveChartTooltip(400, 100);
    // Nothing written yet — the batch lands on the frame boundary.
    expect(node()?.style.transform).toBe(before);

    await nextFrame();
    // The LAST coordinate wins, not the first. (jsdom reports a zero-sized box,
    // so the offsets are the bare cursor + CURSOR_OFFSET.)
    expect(node()?.style.transform).toBe("translate3d(414px, 100px, 0)");
  });
});

describe("resetChartTooltip", () => {
  it("removes the node so a later show starts clean", () => {
    showChartTooltip(source(), 10, 10, { title: "x" });
    resetChartTooltip();
    expect(node()).toBeNull();

    showChartTooltip(source(), 10, 10, { title: "y" });
    expect(node()?.querySelector(".zfc-tt-title")?.textContent).toBe("y");
  });
});
