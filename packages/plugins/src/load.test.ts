import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketDataProvider } from "@zframes/spec";
import { loadPluginProviders } from "./load";

const provider = (name: string): MarketDataProvider =>
  ({ name, capabilities: ["day-stats"] }) as unknown as MarketDataProvider;

/** A well-formed plugin module as `import()` would deliver it. */
const module = (id: string, opts: { synthetic?: boolean } = {}) => ({
  manifest: {
    id,
    name: id,
    capabilities: ["day-stats"],
    sources: [],
    hosts: [],
    ...(opts.synthetic ? { synthetic: true } : {}),
  },
  createProviders: () => [provider(id)],
});

const MODULES = {
  keyless: async () => module("keyless"),
  demo: async () => module("demo", { synthetic: true }),
  broken: async () => ({ not: "a plugin" }),
  crashy: async () => {
    throw new Error("chunk failed");
  },
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("loadPluginProviders", () => {
  it("loads the named plugins in order", async () => {
    const result = await loadPluginProviders(["keyless", "demo"], MODULES);
    expect(result.providers.map((p) => p.name)).toEqual(["keyless", "demo"]);
    // A live plugin is mounted, so the board is NOT all-synthetic.
    expect(result.synthetic).toBe(false);
  });

  it("labels an all-synthetic mount", async () => {
    const result = await loadPluginProviders(["demo"], MODULES);
    expect(result.providers.map((p) => p.name)).toEqual(["demo"]);
    expect(result.synthetic).toBe(true);
  });

  it("skips unknown ids and invalid or crashing modules, keeping the rest", async () => {
    const result = await loadPluginProviders(
      ["nope", "broken", "crashy", "keyless"],
      MODULES,
    );
    expect(result.providers.map((p) => p.name)).toEqual(["keyless"]);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it("falls back to the demo when nothing loads", async () => {
    for (const ids of [[], ["nope"], ["crashy"]]) {
      const result = await loadPluginProviders(ids, MODULES);
      expect(result.providers.map((p) => p.name)).toEqual(["demo"]);
      expect(result.synthetic).toBe(true);
    }
  });

  it("does not loop when the demo itself was named and failed", async () => {
    const result = await loadPluginProviders(["demo"], {
      demo: MODULES.crashy,
    });
    expect(result.providers).toEqual([]);
    expect(result.synthetic).toBe(false);
  });
});
