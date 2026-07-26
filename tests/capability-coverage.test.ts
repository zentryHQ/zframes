import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  Capability,
  MarketDataProvider,
} from "../packages/spec/src/types";
import { allFrameMetas } from "../packages/frames/src/schemas";

/**
 * Pins the capability contract between the frame catalogue and the provider
 * fleet the apps actually mount.
 *
 * A frame declares the `capabilities` it needs; a provider advertises the ones
 * it serves; `useProviderFor` routes each need to the first mounted provider
 * covering it. Nothing connects the two sides — both are plain string literals
 * from the same union — so a capability a frame asks for and no mounted provider
 * serves type-checks, lints, and renders as a permanent "No data source" error
 * card on every user's dashboard.
 *
 * The 230-frame render smoke structurally cannot catch that: the storybook
 * MockMarketDataProvider advertises *every* capability, so such a frame renders
 * happily in tests and only fails in production. This file is the one place the
 * two real lists meet, and both directions matter:
 *
 *  - forward — a frame need no mounted provider serves is the shipping bug
 *    above. Likely causes are ordinary: renaming a capability string in one
 *    provider, or landing a frame ahead of its provider.
 *  - reverse — a provider capability no frame consumes is dead code. Deliberate
 *    exceptions go in `UNCONSUMED_BY_FRAMES` so a genuine orphan fails loudly.
 *
 * It lives in repo-level `tests/` because it must import BOTH sides at once,
 * which the ESLint layer DAG forbids from inside any package (frames never see
 * providers, providers never see frames). Imports are relative for the same
 * reason the sibling guards are: `tests/` is not a package, and the keyed
 * provider packages are not root dependencies.
 */

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** The shape this file needs from a frame meta. */
interface CapabilityNeed {
  name: string;
  capabilities: readonly Capability[];
}

/**
 * Capabilities the mounted fleet advertises that NO frame consumes, each with
 * the reason it is deliberately unused. Empty today, and it should stay that
 * way: a provider method no frame can reach is code that ships to every user
 * and runs for nobody. Adding a key here is a decision — say why.
 */
const UNCONSUMED_BY_FRAMES: Partial<Record<Capability, string>> = {};

/**
 * `<frame> → <capability>` for every declared need the given advertised set
 * does not cover, in catalogue order.
 */
function unservedNeeds(
  metas: readonly CapabilityNeed[],
  advertised: ReadonlySet<Capability>,
): string[] {
  const gaps: string[] = [];
  for (const meta of metas)
    for (const capability of meta.capabilities)
      if (!advertised.has(capability))
        gaps.push(`${meta.name} → ${capability}`);
  return gaps;
}

const KEYLESS_MANIFEST = fileURLToPath(
  new URL("../packages/providers-keyless/package.json", import.meta.url),
);

/** The fleet, built exactly once (see `beforeAll`). */
let fleet: MarketDataProvider[] = [];
let keyless: MarketDataProvider[] = [];
let binance: MarketDataProvider | undefined;
let wallet: MarketDataProvider | undefined;
let advertised: ReadonlySet<Capability> = new Set();
let keylessAdvertised: ReadonlySet<Capability> = new Set();

/** What the recording fetch stub saw while the fleet was being constructed. */
let constructionFetchCalls: unknown[][] = [];
let fetchStubWasInstalled = false;

beforeAll(async () => {
  // Import AND construct under a recording fetch stub, so the "no network I/O
  // at construction" assertion below observes the real thing rather than an
  // already-warm module. The stub returns a promise that never settles: a
  // provider that did fetch here is recorded, not crashed, and leaves no
  // unhandled rejection behind to poison a later test.
  const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(
    () => new Promise<Response>(() => {}),
  );
  vi.stubGlobal("fetch", fetchMock);
  fetchStubWasInstalled = (globalThis.fetch as unknown) === fetchMock;
  try {
    // Fresh modules so provider module bodies (module-level TtlCaches, any
    // import-time work) are evaluated with the stub in place.
    vi.resetModules();
    const [keylessMod, binanceMod, walletMod] = await Promise.all([
      import("../packages/providers-keyless/src/index"),
      import("../packages/provider-binance/src/index"),
      import("../packages/provider-wallet/src/index"),
    ]);
    keyless = keylessMod.createKeylessProviders();
    binance = new binanceMod.BinanceProvider();
    wallet = new walletMod.WalletProvider();
    // Exactly how the runtime composes it (apps/runtime/src/App.tsx).
    fleet = [...keyless, binance, wallet];
    constructionFetchCalls = fetchMock.mock.calls;
  } finally {
    vi.unstubAllGlobals();
  }
  keylessAdvertised = new Set(keyless.flatMap((p) => [...p.capabilities]));
  advertised = new Set(fleet.flatMap((p) => [...p.capabilities]));
});

describe("frame ↔ provider capability coverage", () => {
  it("mounts one instance per keyless provider package, plus the keyed pair", () => {
    const manifest = JSON.parse(readFileSync(KEYLESS_MANIFEST, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const declared = Object.keys(manifest.dependencies ?? {}).filter((dep) =>
      dep.startsWith("@zframes/provider-"),
    );
    // A provider package added to the composition leaf's manifest but never
    // constructed in the factory ships a whole provider's capabilities as
    // unreachable — and would silently weaken every check below.
    expect(declared.length).toBeGreaterThan(20);
    expect(keyless).toHaveLength(declared.length);
    expect(fleet).toHaveLength(declared.length + 2);
    // `venue` pins resolve case-insensitively by provider NAME
    // (useProviderFor), so a duplicate name makes one of them unreachable.
    expect(new Set(fleet.map((p) => p.name)).size).toBe(fleet.length);
    // A provider advertising nothing can never be routed to.
    expect(fleet.filter((p) => p.capabilities.length === 0)).toEqual([]);
    // Anti-vacuity floor: the checks below are set membership, so a fleet that
    // silently failed to construct must not read as "everything covered".
    expect(advertised.size).toBeGreaterThan(50);
  });

  it("every capability a frame declares is served by a mounted provider", () => {
    const gaps = unservedNeeds(allFrameMetas, advertised);
    expect(
      gaps,
      "These frames declare a capability no mounted provider advertises. Each " +
        "renders as a permanent 'No data source' error card on every dashboard " +
        "that uses it — the frame-render smoke cannot see it, because the mock " +
        "provider advertises everything. Fix the capability string, or mount " +
        "the provider that serves it:\n" +
        gaps.map((gap) => `  - ${gap}`).join("\n"),
    ).toEqual([]);
  });

  it("the coverage check detects a real gap (Bitkub unmounted orphans order-book-depth)", () => {
    // Guards the guard: the assertion above is a "no offenders" check, so it
    // would pass vacuously if `unservedNeeds` stopped detecting anything.
    // Bitkub is the only provider advertising `order-book`, and
    // `order-book-depth` is the only frame needing it.
    const withoutBitkub = new Set(
      [...advertised].filter((capability) => capability !== "order-book"),
    );
    expect(unservedNeeds(allFrameMetas, withoutBitkub)).toEqual([
      "order-book-depth → order-book",
    ]);
  });

  it("every capability the fleet advertises is consumed by at least one frame", () => {
    const consumed = new Set(allFrameMetas.flatMap((m) => [...m.capabilities]));
    const orphans = [...advertised]
      .filter((capability) => !consumed.has(capability))
      .sort();
    // Compared as an exact list, so this also keeps the allowlist honest: an
    // entry whose capability a frame now consumes (or that no provider
    // advertises any more) fails here as a stale carve-out.
    expect(
      orphans,
      "Provider capabilities no frame consumes are dead code; allowlist keys " +
        "that are now consumed are stale carve-outs. Advertised-but-unused: " +
        `[${orphans.join(", ")}]; allowlisted: ` +
        `[${Object.keys(UNCONSUMED_BY_FRAMES).join(", ")}]`,
    ).toEqual(Object.keys(UNCONSUMED_BY_FRAMES).sort());
  });

  it("the keyless set alone serves every frame need except portfolio", () => {
    // The published CLI mounts `createKeylessProviders()` and nothing else, so
    // every non-account frame must be fully served without the keyed tier.
    // The list is explicit on purpose: a new frame that needs a connected
    // account narrows what the keyless CLI can render, so it is a decision.
    const accountFrames = allFrameMetas.filter((m) =>
      m.capabilities.includes("portfolio"),
    );
    expect(accountFrames.map((m) => m.name)).toEqual([
      "portfolio-value",
      "portfolio-allocation",
      "portfolio-holdings",
      "portfolio-movers",
      "portfolio-value-bars",
    ]);
    expect(unservedNeeds(allFrameMetas, keylessAdvertised)).toEqual(
      accountFrames.map((m) => `${m.name} → portfolio`),
    );
  });

  it("the keyed pair is required for portfolio and adds nothing else", () => {
    expect(keylessAdvertised.has("portfolio")).toBe(false);
    const keyedOnly = [...advertised].filter(
      (capability) => !keylessAdvertised.has(capability),
    );
    expect(keyedOnly).toEqual(["portfolio"]);
    expect(binance?.capabilities).toEqual(["portfolio"]);
    expect(wallet?.capabilities).toEqual(["portfolio"]);
    // Both keyed providers advertise the SAME single capability, so capability
    // routing alone would make the second one unreachable (first-match).
    // `portfolioKinds` is what keeps both live: usePortfolio filters covering
    // providers by the configured source kind. Distinct kinds are the contract.
    expect(binance?.portfolioKinds).toEqual(["binance"]);
    expect(wallet?.portfolioKinds).toEqual(["wallet"]);
    // Names double as the user-visible source labels and the venue handles.
    expect(binance?.name).toBe("Binance");
    expect(wallet?.name).toBe("On-chain wallet");
  });

  it("marks exactly the portfolio-capability frames as account-tier", () => {
    // `account: true` drives the connect-state chrome and the catalogue's
    // opt-in grouping; a frame flagged without needing `portfolio` (or needing
    // it without the flag) would render a connect prompt for data it never
    // reads, or read keyed data with no prompt.
    const flagged = allFrameMetas.filter((m) => m.account).map((m) => m.name);
    const needsPortfolio = allFrameMetas
      .filter((m) => m.capabilities.includes("portfolio"))
      .map((m) => m.name);
    expect(flagged).toEqual(needsPortfolio);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("constructing the whole fleet performs no network I/O", () => {
    // Without this, "zero calls" would be vacuously true.
    expect(fetchStubWasInstalled).toBe(true);
    // Providers must defer every request to the capability method a hook calls:
    // mounting the fleet must not fire one request per provider, and hosts
    // (explorer, storybook) construct it without ever rendering a frame.
    expect(constructionFetchCalls).toEqual([]);
  });

  it("a provider reaches the network only once a capability method is called", async () => {
    // The other half of the assertion above: providers really do their I/O
    // through the global `fetch` the stub replaced, so recording zero calls at
    // construction means deferred work, not an unobserved channel.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          total_market_cap: { usd: 2_500_000_000_000 },
          market_cap_percentage: { btc: 52.5 },
          market_cap_change_percentage_24h_usd: 1.75,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const coingecko = fleet.find((p) => p.name === "coingecko");
      expect(coingecko?.getGlobalMarket).toBeTypeOf("function");
      const market = await coingecko?.getGlobalMarket?.();
      expect(market).toEqual({
        totalMarketCapUsd: 2_500_000_000_000,
        marketCapChangePct24h: 1.75,
        dominance: { btc: 52.5 },
      });
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        "https://api.coingecko.com/api/v3/global",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
