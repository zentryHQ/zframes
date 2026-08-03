// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FramesProvider, useProviderFor, useSourcesFor } from "./hooks";
import type { Capability, MarketDataProvider } from "@zframes/spec/types";

// Capability routing is what decides WHICH exchange a frame reads, and the
// `source` pin is the only escape from it. The contract, in one place:
//   * no `source` → the FIRST registered provider that advertises the capability,
//     which is why a second provider for an already-covered capability is
//     otherwise unreachable;
//   * `source` (a provider `name`, matched case-insensitively) → that provider —
//     the only reason a Bitkub-pinned frame doesn't silently read Hyperliquid;
//   * a `source` that is unknown, or known but doesn't cover the capability →
//     fall back to first-match, never null, so a typo degrades to the default
//     source instead of blanking the card;
//   * nobody covers it → null, which the renderer turns into "No data source".
// Invert or drop the pin and every source-pinned frame reads the wrong source;
// make the fallback return null and one typo'd source blanks a card. Neither
// regression is visible in renderer.test.tsx (that exercises FrameContent's own
// coverage flatMap, not these hooks) or in frame-smoke (one provider, so pinned
// and first-match are indistinguishable). These tests drive the real hooks
// through a real React render against overlapping providers.

// Deliberately OVERLAPPING coverage — the only shape in which first-match and a
// pin are distinguishable. "Beta-Exchange" carries capitals so a pin can differ
// from the registered name in case alone. Data methods are omitted on purpose:
// routing reads `capabilities` and `name`, nothing else.
const alphaExchange: MarketDataProvider = {
  name: "alpha-exchange",
  capabilities: ["day-stats", "ohlcv"],
};
const betaExchange: MarketDataProvider = {
  name: "Beta-Exchange",
  capabilities: ["day-stats"],
};
const gammaExchange: MarketDataProvider = {
  name: "gamma-exchange",
  capabilities: ["order-book"],
};
/** Registration order is the routing tie-break, so it is load-bearing here. */
const REGISTERED = [alphaExchange, betaExchange, gammaExchange];

/** Painted when a hook resolves to null — cannot collide with a provider name. */
const NONE = "<none>";

/**
 * Drive both routing hooks through a real render and hand back exactly what
 * they resolved to: the provider OBJECT (so "returns A, not B" is an identity
 * assertion), the source list, and the name the probe actually painted.
 */
function route(
  capability: Capability,
  source?: string,
  providers: MarketDataProvider | MarketDataProvider[] = REGISTERED,
): { provider: MarketDataProvider | null; sources: string[]; painted: string } {
  let provider: MarketDataProvider | null = null;
  let sources: string[] = [];
  function Probe() {
    provider = useProviderFor(capability, source);
    sources = useSourcesFor(capability);
    return <span data-testid="routed">{provider?.name ?? NONE}</span>;
  }
  const { container } = render(
    <FramesProvider providers={providers}>
      <Probe />
    </FramesProvider>,
  );
  return {
    provider,
    sources,
    painted:
      container.querySelector('[data-testid="routed"]')?.textContent ?? "",
  };
}

afterEach(() => cleanup());

describe("useProviderFor — default routing, no source", () => {
  it("hands the capability to the FIRST covering provider in registration order", () => {
    const { provider, sources, painted } = route("day-stats");

    // Two providers advertise day-stats, so this is a real choice, not the only
    // candidate — and the earlier registration wins.
    expect(sources).toEqual(["alpha-exchange", "Beta-Exchange"]);
    expect(provider).toBe(alphaExchange);
    expect(painted).toBe("alpha-exchange");
  });

  it("follows registration order, not the name or the capability count", () => {
    // Same three providers, reversed: now Beta is the earlier day-stats source
    // and it wins. Nothing about alpha itself (its name, its wider capability
    // list) makes it the default — only where it sits in the list.
    const { provider, sources } = route(
      "day-stats",
      undefined,
      [...REGISTERED].reverse(),
    );

    expect(sources).toEqual(["Beta-Exchange", "alpha-exchange"]);
    expect(provider).toBe(betaExchange);
  });

  it("routes a capability only one provider covers to that provider", () => {
    // Not simply "always providers[0]": order-book lives on the LAST provider.
    const { provider, painted } = route("order-book");
    expect(provider).toBe(gammaExchange);
    expect(painted).toBe("gamma-exchange");
  });

  it("resolves to null when nothing registered advertises the capability", () => {
    const { provider, sources, painted } = route("metal-spot");
    expect(provider).toBeNull();
    expect(sources).toEqual([]);
    expect(painted).toBe(NONE);
  });

  it("resolves to null when rendered outside any FramesProvider", () => {
    let provider: MarketDataProvider | null = null;
    function Probe() {
      provider = useProviderFor("day-stats");
      return null;
    }
    render(<Probe />);
    // The context default is an empty list — a frame mounted without a host
    // provider gets the "No data source" card, never a crash.
    expect(provider).toBeNull();
  });

  it("accepts a single provider as well as a list", () => {
    const { provider, sources } = route("day-stats", undefined, betaExchange);
    expect(provider).toBe(betaExchange);
    expect(sources).toEqual(["Beta-Exchange"]);
  });
});

describe("useProviderFor — source pin", () => {
  it("reaches the second provider for an already-covered capability", () => {
    // Without the pin day-stats resolves to alpha (asserted above); the pin is
    // the ONLY way beta is reachable at all.
    const { provider, painted } = route("day-stats", betaExchange.name);
    expect(provider).toBe(betaExchange);
    expect(provider).not.toBe(alphaExchange);
    expect(painted).toBe("Beta-Exchange");
  });

  it("matches the source against the provider name case-insensitively", () => {
    // Both sides are lowercased, so a picker value and a registered name only
    // have to agree on letters — "BITKUB" must still find "bitkub".
    for (const source of ["beta-exchange", "BETA-EXCHANGE", "bEtA-eXcHaNgE"]) {
      const { provider } = route("day-stats", source);
      expect(provider, `source "${source}"`).toBe(betaExchange);
    }
  });

  it("keeps the pin scoped to its own capability", () => {
    // Beta is pinnable for day-stats but advertises no ohlcv, so an ohlcv frame
    // pinned to it still lands on the provider that can actually serve it.
    const { provider } = route("ohlcv", betaExchange.name);
    expect(provider).toBe(alphaExchange);
  });

  it("falls back to first-match (never null) for a known non-covering source", () => {
    // gamma is registered, but for order-book only. A day-stats frame pinned to
    // it must degrade to the default source rather than render an empty card.
    const { provider, painted } = route("day-stats", gammaExchange.name);
    expect(provider).toBe(alphaExchange);
    expect(provider).not.toBe(gammaExchange);
    expect(provider?.capabilities).toContain("day-stats");
    expect(painted).toBe("alpha-exchange");
  });

  it("falls back to first-match for an unknown or typo'd source", () => {
    expect(route("day-stats", "bitkub-typo").provider).toBe(alphaExchange);
    // Names are compared verbatim apart from case — untrimmed whitespace is
    // simply "unknown", and takes the same safe fallback.
    expect(route("day-stats", " Beta-Exchange ").provider).toBe(alphaExchange);
  });

  it("treats an empty source string as no pin at all", () => {
    const { provider } = route("day-stats", "");
    expect(provider).toBe(alphaExchange);
  });

  it("still resolves to null when the pinned source is the only hint and nothing covers the capability", () => {
    // A pin cannot conjure coverage: metal-spot is served by nobody.
    const { provider, painted } = route("metal-spot", alphaExchange.name);
    expect(provider).toBeNull();
    expect(painted).toBe(NONE);
  });
});

describe("useSourcesFor", () => {
  it("lists every covering provider name, verbatim, in registration order", () => {
    expect(route("day-stats").sources).toEqual([
      "alpha-exchange",
      "Beta-Exchange",
    ]);
    expect(route("order-book").sources).toEqual(["gamma-exchange"]);
  });

  it("returns an empty list for a capability nobody covers", () => {
    expect(route("metal-spot").sources).toEqual([]);
  });

  it("offers only names that a pin can actually resolve back to", () => {
    // The picker (useSourcesFor) and the pin (useProviderFor) must agree: every
    // offered name routes to the provider that offered it, mixed case included.
    for (const source of route("day-stats").sources) {
      const { provider } = route("day-stats", source);
      expect(provider?.name, `source "${source}"`).toBe(source);
    }
  });
});
