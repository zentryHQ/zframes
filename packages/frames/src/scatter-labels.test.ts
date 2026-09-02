import { describe, expect, it } from "vitest";

/**
 * Every scatter frame names its own axes.
 *
 * `ScatterChart` cannot know what its axes mean, so its tooltip row labels
 * default to the literal `x` and `y` — and twelve of thirteen frames shipped
 * with exactly that: a hover readout saying "x: +1.2%" beside a caption that
 * had spelled out "24h change" all along. Nothing fails when a frame forgets,
 * because the chart renders perfectly with the two least useful labels
 * available, so this is the only place it can be caught.
 *
 * A source scan, for the same reason as `tests/heatmap-label-fit.test.ts`: what
 * has to hold is that the prop is PASSED, on every one of them.
 *
 * It reads the sources through Vite's glob rather than `node:fs` — this
 * package's tsconfig ships no Node types (its files all run in the browser),
 * which is why the repo's other scanners live up in `tests/`. The cast is
 * because `import.meta.glob`'s types come with `vite/client`, which this
 * package does not pull in either.
 */
const sources = (
  import.meta as unknown as {
    glob: (
      pattern: string,
      options: { query: string; import: string; eager: true },
    ) => Record<string, string>;
  }
).glob("./*.tsx", { query: "?raw", import: "default", eager: true });

const REQUIRED = ["xLabel", "yLabel"];

/**
 * The chart has to be IMPORTED, not merely mentioned: the shared card shells
 * spell `<ScatterChart` out in their usage docblocks, and a doc example is not
 * a card anyone reads a number off.
 */
const IMPORTS_SCATTER_CHART =
  /import[^;]*\bScatterChart\b[^;]*from\s+"@zframes\/charts"/;

const scatterFrames = Object.entries(sources)
  .filter(([path]) => !path.endsWith(".test.tsx"))
  .filter(
    ([, src]) =>
      src.includes("<ScatterChart") && IMPORTS_SCATTER_CHART.test(src),
  )
  .map(([path, src]) => ({ path: path.replace("./", ""), src }));

describe("scatter frames", () => {
  it("name both axes rather than shipping the chart's `x` / `y` defaults", () => {
    const offenders = scatterFrames
      .filter(({ src }) => !REQUIRED.every((prop) => src.includes(`${prop}=`)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("finds the scatter frames at all, so a rename cannot make it vacuous", () => {
    // Thirteen at the time of writing; a floor rather than an equality so a new
    // scatter frame does not have to edit this test to be added.
    expect(scatterFrames.length).toBeGreaterThanOrEqual(13);
  });
});

/**
 * `weightLabel` is deliberately NOT required above. The chart only prints a
 * weight row when the caller names it, and six of these frames weight their
 * bubbles by the very quantity already on the y axis, where a name would print
 * the same figure twice. This pins the other half of that decision: a frame
 * naming the weight must also say how to format it, or a USD offering size
 * renders as "70,000,000,000".
 */
describe("a named bubble weight", () => {
  it("always arrives with a formatter", () => {
    const offenders = scatterFrames
      .filter(
        ({ src }) =>
          src.includes("weightLabel=") && !src.includes("formatWeight="),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
