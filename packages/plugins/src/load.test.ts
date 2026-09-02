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
  binance: async () => module("binance"),
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
    const result = await loadPluginProviders(["keyless", "binance"], MODULES);
    expect(result.providers.map((p) => p.name)).toEqual(["keyless", "binance"]);
    // Nothing mounted fabricates its data.
    expect(result.synthetic).toBe("none");
    expect(result.syntheticPlugins).toEqual([]);
    expect(result.demoFallback).toBe(false);
  });

  it("sorts a synthetic plugin last however early it was installed", async () => {
    // Routing precedence is array order and the demo covers every capability,
    // so installed-first would otherwise serve the whole board fabricated.
    const result = await loadPluginProviders(
      ["demo", "keyless", "binance"],
      MODULES,
    );
    expect(result.providers.map((p) => p.name)).toEqual([
      "keyless",
      "binance",
      "demo",
    ]);
    // …and the live plugins keep their relative order.
    expect(result.synthetic).toBe("some");
    expect(result.syntheticPlugins).toEqual(["demo"]);
  });

  it("labels a mixed mount so the chrome can still disclose it", async () => {
    const result = await loadPluginProviders(["keyless", "demo"], MODULES);
    // One real plugin must NOT clear the disclosure: the demo still serves
    // every capability keyless doesn't cover.
    expect(result.synthetic).toBe("some");
    expect(result.syntheticPlugins).toEqual(["demo"]);
    expect(result.demoFallback).toBe(false);
  });

  it("labels an all-synthetic mount", async () => {
    const result = await loadPluginProviders(["demo"], MODULES);
    expect(result.providers.map((p) => p.name)).toEqual(["demo"]);
    expect(result.synthetic).toBe("all");
    expect(result.syntheticPlugins).toEqual(["demo"]);
    // Installed on purpose, not stood in for an empty install — the header's
    // advice differs between the two.
    expect(result.demoFallback).toBe(false);
  });

  it("skips unknown ids and invalid or crashing modules, keeping the rest", async () => {
    const result = await loadPluginProviders(
      ["nope", "broken", "crashy", "keyless"],
      MODULES,
    );
    expect(result.providers.map((p) => p.name)).toEqual(["keyless"]);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it("falls back to the demo when nothing loads, and says it was a fallback", async () => {
    for (const ids of [[], ["nope"], ["crashy"]]) {
      const result = await loadPluginProviders(ids, MODULES);
      expect(result.providers.map((p) => p.name)).toEqual(["demo"]);
      expect(result.synthetic).toBe("all");
      expect(result.demoFallback).toBe(true);
    }
  });

  it("does not loop when the demo itself was named and failed", async () => {
    const result = await loadPluginProviders(["demo"], {
      demo: MODULES.crashy,
    });
    expect(result.providers).toEqual([]);
    expect(result.synthetic).toBe("none");
    expect(result.demoFallback).toBe(false);
  });
});
