// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Component,
  Suspense,
  createElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { z } from "zod";
import type { AnyFrameDefinition, FrameRegistry } from "@zframes/core";
import { frameLoaders } from "@zframes/frames/lazy";
import { allFrameMetas } from "@zframes/frames/schemas";
import { createLazyRegistry } from "./lazy-registry";

/**
 * `createLazyRegistry` is the registry the SHIPPED runtime renders from — and
 * the one no other suite builds. `frame-smoke`, Storybook, the explorer, and
 * `lazy-loaders.test.tsx` all assemble `createRegistry(allFrames)` (eager) or
 * await the loader thunks directly, so every bug that lives in *this* function
 * ships green:
 *
 *  1. **Lost eager meta.** Config validation, the missing-capability check, the
 *     error cards, and the editor palette all read `schema` / `capabilities` /
 *     `category` / `layout` BEFORE any chunk downloads. If a field stopped being
 *     copied off the meta, every card would fall back to an error card (or the
 *     palette would lose its sizing) with no chunk ever fetched to blame.
 *  2. **Spread order.** `{ ...meta, component, titleIcon, titleContent }` only
 *     works because the lazy slots come *after* the spread. Flip it and a meta
 *     that ever grows a `component`-shaped key silently wins over the chunk.
 *  3. **Dropped title slots.** The slots are reserved from the loader FLAGS
 *     alone. Losing `titleContent` kills price-chart's live price and
 *     price-compare's "A vs B" title with no error card anywhere — the exact
 *     footgun this file exists to pin.
 *  4. **A meta with no loader** must be skipped loudly, not turned into a
 *     half-built entry.
 *  5. **The shared `pending` memo** must be CLEARED on a rejected import, or a
 *     one-off failed chunk fetch permanently poisons the entry.
 *
 * The first half runs against the REAL shipped lists (no mocks) — that is the
 * production registry. The second half mocks `@zframes/frames/lazy` +
 * `/schemas` with synthetic frames, because the failure paths (no loader,
 * rejected chunk, clobbering meta) don't exist in the real lists by design.
 * Loaders are `vi.fn`s, so "did building the registry fetch a chunk?" is
 * directly observable, and the lazy slots are resolved through a real
 * `<Suspense>` + error boundary, the same way core's `FrameContent` renders
 * them.
 */

/** The exotic-type tag `React.lazy` stamps on its result. */
const REACT_LAZY = Symbol.for("react.lazy");

const isLazy = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { $$typeof?: symbol }).$$typeof === REACT_LAZY;

/** Every field the entry is expected to carry over from the meta, eagerly. */
const META_KEYS = [
  "name",
  "label",
  "category",
  "description",
  "capabilities",
  "schema",
  "layout",
  "iconUrl",
  "source",
  "chrome",
  "account",
] as const;

const asRecord = (value: object): Record<string, unknown> =>
  value as unknown as Record<string, unknown>;

function entryOf(registry: FrameRegistry, name: string): AnyFrameDefinition {
  const entry = registry.get(name);
  if (!entry) throw new Error(`registry has no entry for "${name}"`);
  return entry;
}

type Slot = ComponentType<{ config: unknown }>;

function requireSlot(slot: Slot | undefined, what: string): Slot {
  if (!slot) throw new Error(`expected a ${what} slot on the entry`);
  return slot;
}

/** Catches what a rejected chunk throws, the way a real boundary would. */
class Catcher extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error
      ? createElement("span", null, `CAUGHT:${this.state.error.message}`)
      : this.props.children;
  }
}

/** Render one lazy slot under Suspense + a boundary, and wait for it to settle. */
async function renderSlot(slot: Slot) {
  const view = render(
    createElement(
      Catcher,
      null,
      createElement(
        Suspense,
        { fallback: createElement("span", null, "LOADING") },
        createElement(slot, { config: {} }),
      ),
    ),
  );
  await waitFor(() => {
    expect(view.container.textContent).not.toContain("LOADING");
  });
  return view;
}

describe("createLazyRegistry over the shipped frame lists", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let registry: FrameRegistry;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry = createLazyRegistry();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("keys the registry by exactly the allFrameMetas names, warning about none", () => {
    expect([...registry.keys()].sort()).toEqual(
      allFrameMetas.map((meta) => meta.name).sort(),
    );
    // One entry per meta: a duplicated name would collapse two into one slot.
    expect(registry.size).toBe(allFrameMetas.length);
    // Guard against a vacuously empty list (the runtime ships ~200 frames).
    expect(registry.size).toBeGreaterThan(50);
    // Every shipped meta has a loader, so nothing is skipped.
    expect(warn).not.toHaveBeenCalled();
  });

  it("copies every declared meta field onto the entry, by reference", () => {
    const mismatches: string[] = [];
    for (const meta of allFrameMetas) {
      const entry = asRecord(entryOf(registry, meta.name));
      const source = asRecord(meta);
      for (const key of META_KEYS) {
        if (!Object.is(entry[key], source[key])) {
          mismatches.push(`${meta.name}.${key}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
    // …and the optional fields are actually populated on the real lists, so the
    // comparison above isn't just matching undefined against undefined.
    expect(
      allFrameMetas.filter((meta) => meta.layout !== undefined).length,
    ).toBeGreaterThan(50);
    expect(
      allFrameMetas.filter((meta) => meta.source !== undefined).length,
    ).toBeGreaterThan(20);
  });

  it("exposes each entry's real Zod schema, usable before any chunk loads", () => {
    const broken: string[] = [];
    for (const name of registry.keys()) {
      const { schema } = entryOf(registry, name);
      try {
        const result = schema.safeParse({});
        if (typeof result.success !== "boolean") {
          broken.push(`${name}: safeParse returned no verdict`);
        }
      } catch (err) {
        broken.push(`${name}: safeParse threw ${String(err)}`);
      }
    }
    expect(broken).toEqual([]);

    // Not a placeholder: price-chart's required `symbol` still rejects {} …
    const priceChart = entryOf(registry, "price-chart");
    const empty = priceChart.schema.safeParse({});
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues.map((issue) => issue.path.join("."))).toContain(
        "symbol",
      );
    }
    // … and the declared defaults still apply once it's supplied.
    const filled = priceChart.schema.safeParse({ symbol: "BTC" });
    expect(filled.success).toBe(true);
    if (filled.success) {
      expect(filled.data).toMatchObject({
        symbol: "BTC",
        interval: "1h",
        mode: "candle",
      });
    }
    // An all-optional frame parses {} straight to its defaults.
    const clock = entryOf(registry, "clock").schema.safeParse({});
    expect(clock.success).toBe(true);
    if (clock.success) {
      expect(clock.data).toMatchObject({ hour12: false, showSeconds: true });
    }
  });

  it("reserves the title slots exactly where the loaders flag them", () => {
    const names = [...registry.keys()].sort();

    const flaggedIcon = names.filter(
      (name) => frameLoaders[name].titleIcon === true,
    );
    const withIcon = names.filter(
      (name) => entryOf(registry, name).titleIcon !== undefined,
    );
    expect(withIcon.length).toBeGreaterThan(0);
    expect(withIcon).toEqual(flaggedIcon);

    const flaggedContent = names.filter(
      (name) => frameLoaders[name].titleContent === true,
    );
    const withContent = names.filter(
      (name) => entryOf(registry, name).titleContent !== undefined,
    );
    expect(withContent.length).toBeGreaterThan(0);
    expect(withContent).toEqual(flaggedContent);

    // The named footgun: price-chart reserves both slots (live ticker + price),
    // while a frame that flags neither gets neither.
    const priceChart = entryOf(registry, "price-chart");
    expect(priceChart.titleIcon).not.toBeUndefined();
    expect(priceChart.titleContent).not.toBeUndefined();
    const clock = entryOf(registry, "clock");
    expect(clock.titleIcon).toBeUndefined();
    expect(clock.titleContent).toBeUndefined();
  });

  it("defers every component (and reserved slot) behind React.lazy", () => {
    const eager = [...registry.keys()].filter(
      (name) => !isLazy(entryOf(registry, name).component),
    );
    expect(eager).toEqual([]);

    const eagerSlots = [...registry.keys()].flatMap((name) => {
      const entry = entryOf(registry, name);
      return [
        ...(entry.titleIcon && !isLazy(entry.titleIcon)
          ? [`${name}.icon`]
          : []),
        ...(entry.titleContent && !isLazy(entry.titleContent)
          ? [`${name}.content`]
          : []),
      ];
    });
    expect(eagerSlots).toEqual([]);
  });
});

// --- Synthetic lists: the paths the real registry can't reach ---------------

type SyntheticLoader = {
  load: () => Promise<unknown>;
  titleIcon?: boolean;
  titleContent?: boolean;
};

const textComponent = (text: string) => () => createElement("span", null, text);

function metaFor(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    label: name,
    category: "tools",
    description: `synthetic ${name} frame`,
    capabilities: [],
    schema: z.object({ ticker: z.string().default("BTC") }),
    ...extra,
  };
}

function definition(name: string, text: string) {
  return { ...metaFor(name), component: textComponent(text) };
}

/**
 * Rebuild the module against synthetic frame lists. The lazy registry reads its
 * two inputs at import time, so the mocks have to be installed before a FRESH
 * import — hence resetModules + a dynamic import per case.
 */
async function buildSynthetic(
  metas: ReadonlyArray<Record<string, unknown>>,
  loaders: Record<string, SyntheticLoader>,
): Promise<FrameRegistry> {
  vi.resetModules();
  vi.doMock("@zframes/frames/schemas", () => ({ allFrameMetas: metas }));
  vi.doMock("@zframes/frames/lazy", () => ({ frameLoaders: loaders }));
  const mod = await import("./lazy-registry");
  return mod.createLazyRegistry();
}

describe("createLazyRegistry over synthetic frame lists", () => {
  afterEach(() => {
    cleanup();
    vi.doUnmock("@zframes/frames/schemas");
    vi.doUnmock("@zframes/frames/lazy");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("builds the whole registry without importing a single chunk", async () => {
    const load = vi.fn(() => Promise.resolve(definition("alpha", "BODY")));
    const registry = await buildSynthetic([metaFor("alpha")], {
      alpha: { load },
    });

    const entry = entryOf(registry, "alpha");
    // Eager meta is readable straight away …
    expect(entry.label).toBe("alpha");
    expect(entry.schema.safeParse({})).toMatchObject({
      success: true,
      data: { ticker: "BTC" },
    });
    expect(isLazy(entry.component)).toBe(true);
    // … and none of that touched the loader.
    expect(load).not.toHaveBeenCalled();
  });

  it("skips a meta with no loader and names it in the warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.fn(() => Promise.resolve(definition("alpha", "BODY")));

    const registry = await buildSynthetic(
      [metaFor("alpha"), metaFor("ghost-frame")],
      { alpha: { load } },
    );

    expect([...registry.keys()]).toEqual(["alpha"]);
    expect(registry.has("ghost-frame")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('"ghost-frame"');
    expect(message).toContain("no lazy loader");
  });

  it("never lets the meta spread clobber the component or the title slots", async () => {
    const sentinel = textComponent("SENTINEL");
    const load = vi.fn(() => Promise.resolve(definition("alpha", "LOADED")));

    // A meta carrying component-shaped keys — exactly what a flipped spread
    // order would let through.
    const registry = await buildSynthetic(
      [
        metaFor("alpha", {
          component: sentinel,
          titleIcon: sentinel,
          titleContent: sentinel,
        }),
      ],
      { alpha: { load } }, // flags NEITHER title slot
    );

    const entry = entryOf(registry, "alpha");
    expect(entry.component).not.toBe(sentinel);
    expect(isLazy(entry.component)).toBe(true);
    // The explicit `titleIcon`/`titleContent` after the spread win, so a meta
    // can't smuggle in a slot no loader flagged.
    expect(entry.titleIcon).toBeUndefined();
    expect(entry.titleContent).toBeUndefined();
    expect("titleIcon" in entry).toBe(true);
    expect("titleContent" in entry).toBe(true);

    const view = await renderSlot(entry.component);
    expect(view.container.textContent).toBe("LOADED");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("resolves the component and both title slots from ONE shared import", async () => {
    const load = vi.fn(() =>
      Promise.resolve({
        ...definition("alpha", "BODY"),
        titleIcon: textComponent("ICON"),
        titleContent: textComponent("TITLE"),
      }),
    );

    const registry = await buildSynthetic([metaFor("alpha")], {
      alpha: { load, titleIcon: true, titleContent: true },
    });
    const entry = entryOf(registry, "alpha");
    const icon = requireSlot(entry.titleIcon, "titleIcon");
    const title = requireSlot(entry.titleContent, "titleContent");

    expect((await renderSlot(entry.component)).container.textContent).toBe(
      "BODY",
    );
    expect((await renderSlot(icon)).container.textContent).toBe("ICON");
    expect((await renderSlot(title)).container.textContent).toBe("TITLE");
    // One chunk fetch for all three — that is what the shared `pending` buys.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to a null slot, with a warning, when a flagged module exports none", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Flagged titleContent, but the resolved definition has none.
    const load = vi.fn(() => Promise.resolve(definition("alpha", "BODY")));

    const registry = await buildSynthetic([metaFor("alpha")], {
      alpha: { load, titleContent: true },
    });
    const slot = requireSlot(
      entryOf(registry, "alpha").titleContent,
      "titleContent",
    );

    const view = await renderSlot(slot);
    // Renders nothing instead of crashing the card on `default: undefined`.
    expect(view.container.textContent).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "flagged titleContent but its module exports none",
    );
  });

  it("clears the shared promise when the chunk fails, so the next attempt refetches", async () => {
    // React logs boundary-caught errors; keep the run quiet.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn(() => Promise.reject(new Error("chunk 404")));

    const registry = await buildSynthetic([metaFor("alpha")], {
      alpha: { load, titleIcon: true },
    });
    const entry = entryOf(registry, "alpha");

    const first = await renderSlot(entry.component);
    expect(first.container.textContent).toBe("CAUGHT:chunk 404");
    expect(load).toHaveBeenCalledTimes(1);

    // React.lazy caches the rejection on the component object itself, so the
    // retry is observed through the sibling title slot — the other consumer of
    // the same shared `pending`. A memo still holding the rejected promise
    // would hand it straight back and never call the loader again.
    const icon = requireSlot(entry.titleIcon, "titleIcon");
    const second = await renderSlot(icon);
    expect(second.container.textContent).toBe("CAUGHT:chunk 404");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
