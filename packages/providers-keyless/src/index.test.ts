// Pins the keyless provider fleet — the ONE list every app mounts
// (`createKeylessProviders`). Three contracts live here, and nothing else in the
// suite covers them:
//
//  1. ORDER IS THE ROUTING TABLE. Capability routing is first-match with no
//     dedup: `useProviderFor` (packages/core/src/hooks.tsx) filters the fleet by
//     capability and takes `[0]` unless the frame pins a `source`. Hyperliquid
//     and Bitkub BOTH advertise `day-stats` + `ohlcv`, so moving Bitkub ahead of
//     Hyperliquid silently re-routes every unpinned price/candle frame to a THB
//     source: baht-derived prices, no `quote-stream` ticks, and HIP-3 equity
//     symbols (`xyz:TSLA`) that don't exist there. tests/dep-dag.test.ts pins
//     only the manifest, and the frame smoke suite renders against a mock
//     provider — so the constructed sequence is pinned here, verbatim.
//  2. THE FLEET MATCHES THE MANIFEST. Every `@zframes/provider-*` dependency
//     must be constructed exactly once; adding the dependency (and even the
//     import) without a `new XProvider()` line yields capabilities that never
//     route, which looks like an empty card rather than a build error.
//  3. CONSTRUCTION IS INERT. Both apps build the fleet during module init (the
//     explorer does it on the server), so importing the factory and calling it
//     must not fetch anything or open a socket before a frame asks for data.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Capability, MarketDataProvider } from "@zframes/spec";
import type { createKeylessProviders as createKeylessProvidersType } from "./index";
// This package's own manifest — the dependency list the fleet must cover. Read
// as a JSON module rather than with node:fs because @types/node is not a
// dependency here; the manifest is still the single source of truth for the
// coverage check below.
import manifest from "../package.json";

type Factory = typeof createKeylessProvidersType;

/**
 * Every provider module owns module-level `TtlCache` singletons, so each test
 * gets a genuinely FRESH module registry (`vi.resetModules()` + a dynamic
 * import) — the same pattern the provider suites use. It also keeps the
 * side-effect assertions honest: a stub installed before this call sees the
 * whole provider graph load cold.
 */
async function loadFactory(): Promise<Factory> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.createKeylessProviders;
}

/**
 * The fleet in construction order — which IS the capability-routing order.
 * These are the providers' real `.name` values (each is the package slug of
 * `provider-<slug>`), because `.name` is what a frame's `source` pins against.
 */
const EXPECTED_ORDER = [
  "hyperliquid",
  "defillama",
  "alternativeme",
  "coingecko",
  "coinpaprika",
  "geckoterminal",
  "blockchair",
  "coinmetrics",
  "bitcoin-data",
  "ultrasound",
  "polymarket",
  "etf-flows",
  "nyfed",
  "treasury",
  "bls",
  "sec",
  "finra",
  "nasdaq",
  "cboe",
  "ofr",
  "fred",
  "zillow",
  "fhfa",
  "fx",
  "metals",
  "news",
  "mempool",
  "deribit",
  "bitkub",
];

/**
 * `useProviderFor` (packages/core/src/hooks.tsx) reproduced exactly: filter the
 * fleet by capability, honour a case-insensitive `source` pin, otherwise take the
 * first covering provider. Duplicated here because the hook itself needs React,
 * while the behaviour under test is a property of this array's order.
 */
function routeFor(
  providers: MarketDataProvider[],
  capability: Capability,
  source?: string,
): MarketDataProvider | null {
  const covering = providers.filter((p) => p.capabilities.includes(capability));
  if (source) {
    const pinned = covering.find(
      (p) => p.name.toLowerCase() === source.toLowerCase(),
    );
    if (pinned) return pinned;
  }
  return covering[0] ?? null;
}

describe("createKeylessProviders", () => {
  let createKeylessProviders: Factory;

  beforeEach(async () => {
    createKeylessProviders = await loadFactory();
  });

  it("constructs the whole keyless fleet in capability-routing order", () => {
    const providers = createKeylessProviders();
    expect(providers.map((p) => p.name)).toEqual(EXPECTED_ORDER);
    expect(providers).toHaveLength(29);
  });

  it("keeps hyperliquid first and bitkub last (the two load-bearing ends)", () => {
    const names = createKeylessProviders().map((p) => p.name);
    expect(names[0]).toBe("hyperliquid");
    expect(names[names.length - 1]).toBe("bitkub");
    // The invariant that actually matters is the relative order of the two
    // sources that overlap on day-stats/ohlcv.
    expect(names.indexOf("hyperliquid")).toBeLessThan(names.indexOf("bitkub"));
  });

  it("names every provider uniquely, so a source pin is unambiguous", () => {
    const names = createKeylessProviders().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    // `source` matching lower-cases both sides, so names differing only in case
    // would be ambiguous too.
    const lowered = names.map((n) => n.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("gives every provider at least one capability and none the keyed one", () => {
    for (const provider of createKeylessProviders()) {
      expect(
        provider.capabilities.length,
        `${provider.name} advertises no capability, so it can never route`,
      ).toBeGreaterThan(0);
      // "portfolio" belongs to the keyed tier (Binance / wallet); this package
      // must never pull it in — the public explorer's keyless-only guarantee.
      expect(provider.capabilities, provider.name).not.toContain("portfolio");
    }
  });

  describe("first-match routing", () => {
    // Both sources cover these two capabilities; first-match decides, so the
    // fleet's order alone determines which one every unpinned frame gets.
    const OVERLAPPING = ["day-stats", "ohlcv"] as const;

    it.each(OVERLAPPING)(
      "routes %s to hyperliquid while bitkub waits behind it",
      (capability) => {
        const providers = createKeylessProviders();
        const covering = providers.filter((p) =>
          p.capabilities.includes(capability),
        );
        // Bitkub really does compete for this capability…
        expect(covering.map((p) => p.name)).toContain("bitkub");
        // …but it is never the first match.
        expect(covering[0].name).toBe("hyperliquid");
        expect(routeFor(providers, capability)?.name).toBe("hyperliquid");
      },
    );

    it.each(OVERLAPPING)(
      "reaches bitkub for %s only when the frame pins source: bitkub",
      (capability) => {
        const providers = createKeylessProviders();
        expect(routeFor(providers, capability, "bitkub")?.name).toBe("bitkub");
        // Case-insensitively, as the hook compares it.
        expect(routeFor(providers, capability, "BitKub")?.name).toBe("bitkub");
        // An unknown source falls back to first-match rather than nothing.
        expect(routeFor(providers, capability, "kraken")?.name).toBe(
          "hyperliquid",
        );
      },
    );

    it("routes quote-stream to hyperliquid alone (bitkub has no live ticks)", () => {
      const streaming = createKeylessProviders().filter((p) =>
        p.capabilities.includes("quote-stream"),
      );
      expect(streaming.map((p) => p.name)).toEqual(["hyperliquid"]);
    });

    it("routes order-book to bitkub, the only source that serves it", () => {
      const books = createKeylessProviders().filter((p) =>
        p.capabilities.includes("order-book"),
      );
      expect(books.map((p) => p.name)).toEqual(["bitkub"]);
    });
  });

  it("constructs exactly one provider per @zframes/provider-* dependency", async () => {
    const providerDeps = Object.keys(manifest.dependencies).filter((dep) =>
      dep.startsWith("@zframes/provider-"),
    );
    const providers = createKeylessProviders();
    expect(providerDeps.length).toBeGreaterThan(0);
    expect(providerDeps).toHaveLength(providers.length);

    // Counts alone would tolerate a swap (one dep constructed twice, another
    // not at all), so match each dependency to an instance: import the package,
    // take its exported provider class, and require exactly one instance of it
    // in the fleet.
    for (const dep of providerDeps) {
      const mod = (await import(dep)) as Record<string, unknown>;
      const ctors = Object.values(mod).filter(
        (value): value is new () => MarketDataProvider =>
          typeof value === "function" && /Provider$/.test(value.name),
      );
      expect(
        ctors,
        `${dep} should export exactly one provider class`,
      ).toHaveLength(1);
      const built = providers.filter((p) => p instanceof ctors[0]);
      expect(
        built.map((p) => p.name),
        `${dep} should be constructed exactly once by createKeylessProviders`,
      ).toHaveLength(1);
    }
  });

  it("touches no network and opens no socket while being constructed", async () => {
    const fetchMock = vi.fn();
    const opened: unknown[] = [];
    class SpyWebSocket {
      constructor(url: unknown) {
        opened.push(url);
      }
    }
    // Stubbed BEFORE the provider graph loads: a module-level fetch or an
    // eagerly-opened allMids socket would otherwise fire during import, before
    // the factory is even called.
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", SpyWebSocket);
    try {
      const create = await loadFactory();
      const providers = create();

      expect(providers).toHaveLength(EXPECTED_ORDER.length);
      expect(fetchMock.mock.calls).toEqual([]);
      expect(opened).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
