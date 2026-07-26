// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { createRegistry, type AnyFrameDefinition } from "@zframes/core";
import { allFrames } from "./index";
import { frameLoaders } from "./lazy";
import { allFrameMetas } from "./schemas";

/**
 * The two halves of the four-list frame contract `registry-parity.test.ts`
 * does NOT cover.
 *
 * That test compares `allFrameMetas` (schemas.ts) against `frameLoaders`
 * (lazy.ts) by name. Two failure modes survive it:
 *
 * 1. **`allFrames` drift.** A frame added to `schemas.ts` + `lazy.ts` but
 *    forgotten in `index.ts`'s eager `allFrames` array keeps CI green, yet it
 *    renders as an "Unknown frame" card in every eager host (the explorer,
 *    Storybook) AND silently drops out of `frame-smoke.test.tsx`'s crash net,
 *    which iterates `allFrames`. `createRegistry` is `new Map(frames.map(f =>
 *    [f.name, f]))`, so a duplicated name would also quietly keep only the LAST
 *    entry — a copy-pasted meta makes the earlier frame vanish with no error.
 *
 * 2. **A loader wired to the wrong module.** Name parity only proves a KEY
 *    exists; nothing checks what the thunk actually imports. `"btc-fees": {
 *    load: () => import("./btc-blocks")… }` typechecks, passes parity, and
 *    ships the wrong card. The only way to catch it is to *await* every thunk
 *    and read the definition back — which also lets us check the
 *    `titleIcon` / `titleContent` flags in both directions, since the lazy
 *    registry reserves those title slots from the flags alone: a module that
 *    grows a dynamic title while its flag stays off silently loses it in the
 *    lazy runtime (the runtime the CLI ships), while a flag with no component
 *    behind it reserves an empty slot.
 *
 * Awaiting the thunks pulls in real components/charts, hence jsdom + a generous
 * timeout on the one-time load.
 */

const loaderKeys = Object.keys(frameLoaders).sort();
const eagerNames = allFrames.map((f) => f.name).sort();

describe("the eager frame list (allFrames)", () => {
  it("covers exactly the renderable metas — none forgotten, none extra", () => {
    expect(eagerNames).toEqual(allFrameMetas.map((m) => m.name).sort());
  });

  it("names every frame exactly once", () => {
    const repeated = eagerNames.filter((name, i) => eagerNames[i - 1] === name);
    expect(repeated).toEqual([]);
  });

  it("survives createRegistry with every frame still reachable", () => {
    const registry = createRegistry(allFrames);
    // A duplicate name silently collapses two entries into one Map slot.
    expect(registry.size).toBe(allFrames.length);
    const unreachable = allFrames
      .filter((frame) => registry.get(frame.name) !== frame)
      .map((frame) => frame.name);
    expect(unreachable).toEqual([]);
  });
});

describe("lazy frame loaders", () => {
  const resolved: Record<string, AnyFrameDefinition> = {};

  beforeAll(async () => {
    const entries = await Promise.all(
      loaderKeys.map(
        async (key) => [key, await frameLoaders[key].load()] as const,
      ),
    );
    for (const [key, def] of entries) resolved[key] = def;
  }, 120_000);

  it("resolve one definition per key", () => {
    expect(Object.keys(resolved).length).toBe(loaderKeys.length);
    expect(loaderKeys.length).toBe(allFrames.length);
  });

  it("each resolve the frame their key names", () => {
    const mismatched = loaderKeys
      .filter((key) => resolved[key].name !== key)
      .map((key) => `${key} -> loads ${resolved[key].name}`);
    expect(mismatched).toEqual([]);
  });

  it("resolve the very definition the eager list exports", () => {
    const eagerByName = new Map(allFrames.map((frame) => [frame.name, frame]));
    const diverged = loaderKeys.filter(
      (key) => resolved[key] !== eagerByName.get(key),
    );
    expect(diverged).toEqual([]);
  });

  it("flag titleIcon exactly where the module exports one", () => {
    const flagged = loaderKeys.filter(
      (key) => frameLoaders[key].titleIcon === true,
    );
    const actual = loaderKeys.filter(
      (key) => resolved[key].titleIcon !== undefined,
    );
    expect(actual.length).toBeGreaterThan(0);
    expect(flagged).toEqual(actual);
  });

  it("flag titleContent exactly where the module exports one", () => {
    const flagged = loaderKeys.filter(
      (key) => frameLoaders[key].titleContent === true,
    );
    const actual = loaderKeys.filter(
      (key) => resolved[key].titleContent !== undefined,
    );
    expect(actual.length).toBeGreaterThan(0);
    expect(flagged).toEqual(actual);
  });
});
