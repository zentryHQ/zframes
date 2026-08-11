import { describe, expect, it } from "vitest";
import { THEME_PRESETS } from "@zframes/spec/presets";
import { frameMetas } from "@zframes/frames/schemas";
import { catalogue } from "./catalogue";

/**
 * `zframes catalogue` is the generating agent's ONLY window into what it can
 * build, so its three modes are a wire contract:
 *
 * - bare: every frame (full JSON Schema) + the design vocabulary. This is what
 *   step 2 of the /zframes skill used to read whole; it outgrew a single read,
 *   which is why the other two modes exist.
 * - `--summary`: the cheap browse pass. It must carry the COMPLETE design
 *   vocabulary (categories, preset values, scene projectIds) because the skill
 *   reads only this before choosing frames and cosmetics.
 * - `catalogue <frame...>`: full entries for the picked frames only, in the
 *   asked order, erroring loudly on an unknown name (the agent's typo loop).
 */
describe("catalogue", () => {
  it("bare: wraps every frame with the design vocabulary", () => {
    const result = catalogue([]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout ?? "");
    expect(parsed.frames).toHaveLength(frameMetas.length);
    expect(parsed.categories.length).toBeGreaterThan(0);
    expect(parsed.themePresets).toHaveLength(THEME_PRESETS.length);
    expect(parsed.backgroundScenes.length).toBeGreaterThan(0);
    // Scene rendering internals must not leak to the agent; projectId is what
    // it writes into `background.projectId`.
    const [scene] = parsed.backgroundScenes;
    expect(Object.keys(scene).sort()).toEqual([
      "description",
      "key",
      "label",
      "projectId",
    ]);
    // Every frame entry carries its designed size for the agent's layout pass.
    const chart = parsed.frames.find(
      (f: { name: string }) => f.name === "price-chart",
    );
    expect(chart.layout.w).toBeGreaterThan(0);
    expect(chart.layout.minH).toBeGreaterThan(0);
  });

  it("--summary: one line per frame plus the full design vocabulary", () => {
    const result = catalogue(["--summary"]);
    expect(result.code).toBe(0);
    const out = result.stdout ?? "";
    // Every frame appears (as `name — …` on a category line).
    for (const meta of frameMetas) expect(out).toContain(`${meta.name} —`);
    // Preset VALUES are inlined — cosmetics must not need a second call.
    for (const preset of THEME_PRESETS) {
      expect(out).toContain(preset.key);
      expect(out).toContain(JSON.stringify(preset.theme));
    }
    // Scene projectIds are what the agent writes into background.projectId.
    expect(out).toContain("YrTzGatwjK7EoFpCSfgZ"); // aurora, the default
    // And it stays a browse view: no JSON Schema blobs.
    expect(out).not.toContain('"configSchema"');
  });

  it("frame names: full entries for just those frames, in the asked order", () => {
    const result = catalogue(["yield-curve", "price-chart"]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout ?? "");
    expect(parsed.frames.map((f: { name: string }) => f.name)).toEqual([
      "yield-curve",
      "price-chart",
    ]);
    expect(parsed.frames[1].configSchema.properties.symbol).toBeDefined();
  });

  it("errors loudly on an unknown frame name, listing the valid ones", () => {
    const result = catalogue(["price-chart", "does-not-exist"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toContain("unknown frame");
    expect(result.stderr).toContain("does-not-exist");
    expect(result.stderr).toContain("price-chart"); // the available list
  });

  it("rejects an unknown option instead of silently ignoring it", () => {
    const result = catalogue(["--sumary"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--sumary");
  });
});
