import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the event-annotation contract.
 *
 * A dashboard declares `events` once and EVERY history chart draws them — that
 * is the whole point of putting them at board level rather than in each frame's
 * config. It only holds while frames render through `TimeSeriesChart`
 * (`./series-chart`), which injects the board's markers; a frame reaching for
 * the raw `MultiSeriesLineChart` silently opts its card out, and nobody notices
 * because the chart still looks fine — it just never shows a flag.
 *
 * So: no frame imports the raw chart. Adding an exemption is a decision, not a
 * formality — say why.
 */

/** Frames allowed to use the raw chart, with the reason each is exempt. */
const RAW_CHART_OK: Record<string, string> = {
  // The wrapper itself — this is where the board's markers are injected.
  "series-chart.tsx": "defines the events-aware wrapper",
};

const RAW_CHART_IMPORT = /\bMultiSeriesLineChart\b(?!Props)/;

/** Doc comments legitimately name the raw chart when explaining the wrapper. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const srcDir = fileURLToPath(
  new URL("../packages/frames/src", import.meta.url),
);

function frameFiles(): string[] {
  return readdirSync(srcDir)
    .filter(
      (f: string) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."),
    )
    .sort();
}

describe("chart-event coverage", () => {
  it("no frame bypasses TimeSeriesChart for the raw line chart", () => {
    const offenders: string[] = [];
    for (const file of frameFiles()) {
      if (file in RAW_CHART_OK) continue;
      const source = stripComments(readFileSync(join(srcDir, file), "utf8"));
      if (RAW_CHART_IMPORT.test(source)) offenders.push(file);
    }
    expect(
      offenders,
      `These frames import MultiSeriesLineChart directly, so the dashboard's ` +
        `event markers never reach them. Use TimeSeriesChart from ` +
        `"./series-chart", or add the file to RAW_CHART_OK with a reason:\n` +
        offenders.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("every RAW_CHART_OK entry is a real file that still uses the raw chart", () => {
    const present = new Set(frameFiles());
    const stale: string[] = [];
    for (const [file, reason] of Object.entries(RAW_CHART_OK)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(0);
      if (!present.has(file)) {
        stale.push(`${file} (no such frame)`);
        continue;
      }
      if (!RAW_CHART_IMPORT.test(readFileSync(join(srcDir, file), "utf8")))
        stale.push(`${file} (no longer uses it)`);
    }
    expect(stale, `stale RAW_CHART_OK entries:\n${stale.join("\n")}`).toEqual(
      [],
    );
  });

  it("the wrapper is actually wired to the board's events", () => {
    const source = readFileSync(join(srcDir, "series-chart.tsx"), "utf8");
    // A wrapper that forgot the hook would pass the guard above while drawing
    // nothing — pin both halves of the injection.
    expect(source).toMatch(/useEvents\(\)/);
    expect(source).toMatch(/events=\{events \?\? boardEvents\}/);
  });

  it("the frames using it are the time-axis history charts, not a stale few", () => {
    // The sweep repointed 25 charts. If a refactor quietly drops most of them
    // back to something else, the layer stops being board-wide in practice.
    const users = frameFiles().filter((file) =>
      /<TimeSeriesChart\b/.test(readFileSync(join(srcDir, file), "utf8")),
    );
    expect(users.length).toBeGreaterThanOrEqual(20);
  });
});
