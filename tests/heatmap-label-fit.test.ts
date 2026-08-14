import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FRAMES_DIR = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../packages/frames/src",
);

/**
 * Every matrix frame prints its cell figures through `cellLabelFits` (frames'
 * `./ui`), never its own `width < 44` check.
 *
 * A hand-rolled width-only guard is right about columns and blind to rows, and a
 * heatmap packs rows far tighter: 20 years of monthly returns leaves each cell
 * ~11px, where a caption renders clipped top and bottom across the whole grid.
 * Nothing fails when that happens — the renderer has no idea what the cell was
 * meant to say — so it ships looking like a design mistake instead of a bug.
 */
describe("heatmap cell labels", () => {
  it("are gated by the shared fit guard in every frame", () => {
    const offenders = readdirSync(FRAMES_DIR)
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .filter((f) => {
        const src = readFileSync(join(FRAMES_DIR, f), "utf8");
        return src.includes("HeatmapChart") && !src.includes("cellLabelFits");
      });
    expect(offenders).toEqual([]);
  });
});
