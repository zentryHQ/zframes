import { describe, expect, it } from "vitest";
import { frameLoaders } from "./lazy";
import { allFrameMetas, frameMetas } from "./schemas";

/**
 * Guards the runtime frame contract. The runtime registry
 * (apps/runtime `createLazyRegistry`) renders from `allFrameMetas` (eager
 * metadata) + `frameLoaders` (lazy component chunks). If those two per-frame
 * lists drift, a frame silently vanishes — it renders as an "Unknown frame"
 * error card and disappears from the editor palette.
 *
 * This is the safety net the original lazy-loading refactor lacked: it shipped
 * a registry built from the *curated* 58-entry `frameMetas` catalogue and
 * dropped 18 renderable frames (every games/journal/tools/layout frame), 19 of
 * which were live on the dogfood dashboard. Importing `./lazy` is cheap and
 * React-free here — the dynamic `import()`s live inside uncalled thunks, so no
 * component, chart, or canvas code executes.
 */
describe("frame registry parity", () => {
  const metaNames = allFrameMetas.map((m) => m.name).sort();
  const loaderNames = Object.keys(frameLoaders).sort();

  it("every renderable frame has exactly one loader, and vice versa", () => {
    expect(loaderNames).toEqual(metaNames);
  });

  it("the curated AI catalogue (frameMetas) is a subset of all renderable frames", () => {
    const renderable = new Set(metaNames);
    const orphans = frameMetas
      .map((m) => m.name)
      .filter((name) => !renderable.has(name));
    expect(orphans).toEqual([]);
  });

  it("has no duplicate frame names in either list", () => {
    expect(new Set(metaNames).size).toBe(metaNames.length);
    expect(new Set(loaderNames).size).toBe(loaderNames.length);
  });
});
