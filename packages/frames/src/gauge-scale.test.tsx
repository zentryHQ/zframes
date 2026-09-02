// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  GaugeOffScale,
  GaugeReading,
  gaugeRingValue,
  gaugeScale,
} from "./gauge-scale";

afterEach(cleanup);

/**
 * The gauge family's whole job is one number, and both of these failures used to
 * present a WRONG one with full confidence — which is why they are pinned here
 * rather than left to review. A gauge that quietly drops the guard looks exactly
 * like a gauge whose reading happens to be on the dial.
 */
describe("gaugeScale", () => {
  it("classifies a reading past either bound", () => {
    expect(gaugeScale(55, 0, 40)).toBe("over");
    expect(gaugeScale(-1, 0, 40)).toBe("under");
    expect(gaugeScale(20, 0, 40)).toBe("in");
  });

  it("treats the bounds themselves as on the dial", () => {
    expect(gaugeScale(0, 0, 40)).toBe("in");
    expect(gaugeScale(40, 0, 40)).toBe("in");
  });

  it("classifies every non-finite reading as absent", () => {
    // The live route is a rate whose denominator came back zero. `NaN` fails
    // every comparison, so an `in`-by-default classification would print the
    // literal NaN as the card's one figure.
    expect(gaugeScale(NaN, 0, 40)).toBe("absent");
    expect(gaugeScale(Infinity, 0, 40)).toBe("absent");
    expect(gaugeScale(-Infinity, 0, 40)).toBe("absent");
  });
});

describe("gaugeRingValue", () => {
  it("passes a finite reading through untouched", () => {
    expect(gaugeRingValue(55, 0)).toBe(55);
    expect(gaugeRingValue(-3, 0)).toBe(-3);
  });

  it("draws the empty ring for a non-finite one", () => {
    // d3's arc turns a NaN fraction into a path of NaNs and paints nothing at
    // all, which reads as a broken card rather than as an absent reading.
    expect(gaugeRingValue(NaN, 0)).toBe(0);
    expect(gaugeRingValue(Infinity, 5)).toBe(5);
  });
});

const fmt = (v: number) => v.toFixed(2);

describe("GaugeOffScale", () => {
  it("renders nothing while the reading is on the dial", () => {
    const { container } = render(
      <GaugeOffScale scale="in" min={0} max={40} format={fmt} />,
    );
    expect(container.textContent).toBe("");
  });

  it("names the bound it ran past, in the gauge's own precision", () => {
    const { container } = render(
      <GaugeOffScale scale="over" min={0} max={40} format={fmt} />,
    );
    expect(container.textContent).toContain("above 40.00");
  });

  it("names the floor when the reading fell under it", () => {
    const { container } = render(
      <GaugeOffScale scale="under" min={2.5} max={40} format={fmt} />,
    );
    expect(container.textContent).toContain("below 2.50");
  });

  it("hides the arrow from assistive tech and keeps the words", () => {
    // The words carry the reading; an unlabelled "▲" read aloud is noise.
    const { container } = render(
      <GaugeOffScale scale="over" min={0} max={40} format={fmt} />,
    );
    const decorative = container.querySelector("[aria-hidden]");
    expect(decorative?.textContent).toContain("▲");
  });
});

describe("GaugeReading", () => {
  it("prints the figure and the regime word when the reading is on the dial", () => {
    const { container } = render(
      <GaugeReading
        value={20}
        min={0}
        max={40}
        format={fmt}
        label="elevated"
      />,
    );
    expect(container.textContent).toContain("20.00");
    expect(container.textContent).toContain("elevated");
    expect(container.textContent).not.toContain("above");
  });

  it("marks an off-scale reading beside the regime word", () => {
    const { container } = render(
      <GaugeReading value={55} min={0} max={40} format={fmt} label="panic" />,
    );
    expect(container.textContent).toContain("55.00");
    expect(container.textContent).toContain("above 40.00");
  });

  it("replaces a non-finite reading with the placeholder, never a number", () => {
    const { container } = render(
      <GaugeReading value={NaN} min={0} max={40} format={fmt} label="panic" />,
    );
    expect(container.textContent).not.toContain("NaN");
    expect(container.textContent).toContain("—");
    // And it says so out loud: a bare em-dash reads as nothing.
    expect(container.textContent).toContain("no reading");
    // The regime word is dropped with it — classifying a reading that does not
    // exist is the same lie in words.
    expect(container.textContent).not.toContain("panic");
  });
});
