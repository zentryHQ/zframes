// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { FramesProvider } from "@zframes/core";
import type {
  Holding,
  MarketDataProvider,
  Portfolio,
  PortfolioSource,
} from "@zframes/spec";
import {
  resolveSource,
  usePortfolioView,
  usePricedHoldings,
  type PortfolioView,
} from "./portfolio-common";

// The shared plumbing behind the three portfolio frames (portfolio-value,
// -allocation, -holdings). Two contracts live here and nothing else pinned
// either — `frame-smoke.test.tsx` renders these frames against the mock
// provider's `portfolio` capability but asserts nothing about the arithmetic:
//
//  1. Pricing precedence (`usePricedHoldings`). The headline number is the sum
//     of per-holding values, and each value must prefer the LIVE Hyperliquid mid
//     × amount over the provider's `valueUsd` snapshot (CoinGecko / exchange),
//     falling back to the snapshot only for assets the venue doesn't quote
//     (stablecoins, exotic tokens). Invert that precedence and the whole
//     portfolio silently stops moving with the market — a plausible-looking
//     number that is minutes stale.
//  2. The wrapped-asset aliases. `provider-wallet` reports WETH/WBTC verbatim
//     (they are the on-chain symbols), and Hyperliquid quotes neither. Losing
//     the WETH→ETH / WBTC→BTC alias reprices those holdings off the snapshot
//     instead — again a stale total that still renders. The alias has to reach
//     BOTH the subscription hint (so the socket is asked for the base symbol)
//     and the lookup, so those are asserted together.
//
// Plus the config gate: `resolveSource` returning null is the "needs more
// config" signal that makes the frames render the connect card instead of an
// error, and it is what trims the address the provider is then called with.
//
// Everything runs through the real `FramesProvider` + `useMids` streaming path
// against a stub provider whose socket the test drives by hand, so a regression
// in the projection or the alias fails here rather than only on a live board.

type Emit = (mids: Record<string, number>) => void;

/** One `subscribeMids` call: the socket callback and the symbols it asked for. */
type Subscription = {
  emit: Emit;
  wanted: readonly string[] | undefined;
  unsubscribe: ReturnType<typeof vi.fn>;
};

const WALLET_PORTFOLIO: Portfolio = {
  source: "wallet",
  label: "0x12…ab",
  holdings: [{ symbol: "ETH", amount: 2, valueUsd: 6_000 }],
  totalUsd: 6_000,
  asOf: 1_700_000_000_000,
};

/**
 * A provider covering both capabilities these frames route through: the
 * `quote-stream` socket (driven by hand, as the real allMids stream would fan
 * out) and `portfolio` for the wallet kind.
 */
function makeProvider(portfolio: Portfolio = WALLET_PORTFOLIO) {
  const subs: Subscription[] = [];
  const subscribeMids = vi.fn((onMids: Emit, symbols?: readonly string[]) => {
    const unsubscribe = vi.fn();
    subs.push({ emit: onMids, wanted: symbols, unsubscribe });
    return unsubscribe;
  });
  // Args are still recorded, so the source it was called with is assertable.
  const getPortfolio = vi.fn<(source: PortfolioSource) => Promise<Portfolio>>(
    async () => portfolio,
  );
  const provider: MarketDataProvider = {
    name: "stub-venue",
    capabilities: ["quote-stream", "portfolio"],
    portfolioKinds: ["wallet"],
    subscribeMids,
    getPortfolio,
  };
  return { provider, subs, subscribeMids, getPortfolio };
}

type Priced = ReturnType<typeof usePricedHoldings>;

let latestPriced: Priced | null = null;
let latestView: PortfolioView | null = null;
/** Invocation counter, so the memo assertion can't pass by not re-rendering. */
let pricedRenders = 0;

function PricedProbe({ holdings }: { holdings?: readonly Holding[] }) {
  pricedRenders += 1;
  latestPriced = usePricedHoldings(holdings);
  return null;
}

function ViewProbe({ address }: { address?: string }) {
  latestView = usePortfolioView({ source: "wallet", address }).view;
  return null;
}

/** The priced probe's most recent hook result (throws if it never rendered). */
function priced(): Priced {
  if (!latestPriced) throw new Error("PricedProbe did not render");
  return latestPriced;
}

/** The resolved USD value of one holding, keyed by its symbol as authored. */
function valueOf(symbol: string): number | undefined {
  return priced().priced.find((h) => h.symbol === symbol)?.value;
}

function view(): PortfolioView {
  if (!latestView) throw new Error("ViewProbe did not render");
  return latestView;
}

function pricedTree(
  holdings: readonly Holding[] | undefined,
  provider: MarketDataProvider,
) {
  return (
    <FramesProvider providers={[provider]}>
      <PricedProbe holdings={holdings} />
    </FramesProvider>
  );
}

/** Push a mid payload down the socket, letting React commit what it triggers. */
async function emit(sub: Subscription, mids: Record<string, number>) {
  await act(async () => {
    sub.emit(mids);
  });
}

/** Let the portfolio loader's promise chain and its state updates settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  latestPriced = null;
  latestView = null;
  pricedRenders = 0;
  vi.useFakeTimers();
  // Hermetic, and a guard in its own right: the keyless wallet path must never
  // touch the keyed credential route (that fetch belongs to the Binance source).
  fetchMock = vi.fn(() => {
    throw new Error("unexpected fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveSource", () => {
  it("returns null for a wallet with no usable address", () => {
    // Null is the "needs more config" signal the frames switch on to render the
    // connect card; a whitespace-only field (half-typed, or pasted whitespace)
    // must count as absent, or the provider is asked for the portfolio of "  ".
    expect(resolveSource({ source: "wallet" })).toBeNull();
    expect(resolveSource({ source: "wallet", address: "" })).toBeNull();
    expect(resolveSource({ source: "wallet", address: "   " })).toBeNull();
    expect(resolveSource({ source: "wallet", address: "\t\n " })).toBeNull();
  });

  it("returns the trimmed wallet source once an address is configured", () => {
    expect(
      resolveSource({ source: "wallet", address: "  0xAbC123  " }),
    ).toEqual({ kind: "wallet", address: "0xAbC123" });
    // ENS names go through untouched apart from the trim.
    expect(resolveSource({ source: "wallet", address: "vitalik.eth" })).toEqual(
      {
        kind: "wallet",
        address: "vitalik.eth",
      },
    );
  });

  it("resolves the binance source unconditionally and carries no address", () => {
    // The keyed source is gated by credential status, NOT by the address field,
    // so a missing (or stray) address must not suppress it — and the stray value
    // must not leak into the source, which keys the portfolio poll.
    expect(resolveSource({ source: "binance" })).toEqual({ kind: "binance" });
    const stray = resolveSource({ source: "binance", address: "   " });
    expect(stray).toEqual({ kind: "binance" });
    expect(stray && "address" in stray).toBe(false);
    expect(resolveSource({ source: "binance", address: "0xAbC" })).toEqual({
      kind: "binance",
    });
  });
});

describe("usePricedHoldings — pricing precedence", () => {
  it("prefers the live mid × amount over the provider's snapshot valueUsd", async () => {
    const { provider, subs } = makeProvider();
    // The snapshot values BTC at 60k/coin; the live mid says 70k.
    const holdings: Holding[] = [
      { symbol: "BTC", amount: 0.5, valueUsd: 30_000 },
    ];
    render(pricedTree(holdings, provider));

    // Before the socket speaks the snapshot holds the card — a stale number
    // beats a blank one.
    expect(valueOf("BTC")).toBe(30_000);
    expect(priced().total).toBe(30_000);

    await emit(subs[0], { BTC: 70_000 });

    // Live mid wins: 0.5 × 70_000, NOT the 30_000 snapshot.
    expect(valueOf("BTC")).toBe(35_000);
    expect(priced().total).toBe(35_000);

    // …and it keeps tracking the market on the next tick.
    await emit(subs[0], { BTC: 72_000 });
    expect(valueOf("BTC")).toBe(36_000);
    expect(priced().total).toBe(36_000);
  });

  it("falls back to valueUsd for an asset the venue doesn't quote, and totals both", async () => {
    const { provider, subs } = makeProvider();
    const holdings: Holding[] = [
      { symbol: "BTC", amount: 2, valueUsd: 100_000 },
      // Hyperliquid doesn't quote USDC: the snapshot is the only price there is.
      { symbol: "USDC", amount: 1_500, valueUsd: 1_500 },
    ];
    render(pricedTree(holdings, provider));

    // Every holding is offered to the stream — the venue decides what it carries.
    expect(subs[0].wanted).toEqual(["BTC", "USDC"]);

    await emit(subs[0], { BTC: 60_000, ETH: 4_000 });

    expect(valueOf("BTC")).toBe(120_000);
    expect(valueOf("USDC")).toBe(1_500);
    expect(priced().total).toBe(121_500);
    // Not the all-snapshot total (101_500) — proof the mid really took over for
    // the one symbol the stream quoted.
    expect(priced().total).not.toBe(101_500);
  });

  it("counts a holding with neither a mid nor a snapshot value as 0, not NaN", async () => {
    const { provider, subs } = makeProvider();
    const holdings: Holding[] = [
      { symbol: "BTC", amount: 1, valueUsd: 50_000 },
      // An unpriced exotic token: the wallet provider found a balance but no
      // price. One NaN here would poison the whole headline number.
      { symbol: "PEPE", amount: 1_000_000 },
    ];
    render(pricedTree(holdings, provider));

    await emit(subs[0], { BTC: 60_000 });

    expect(valueOf("PEPE")).toBeUndefined();
    expect(priced().total).toBe(60_000);
    expect(Number.isNaN(priced().total)).toBe(false);
  });

  it("keeps the rest of the holding intact and stays referentially stable", async () => {
    const { provider, subs } = makeProvider();
    // Frozen so the hook can't mutate the caller's snapshot, and reused by
    // reference below so the memo is what makes the second render cheap.
    const holdings: readonly Holding[] = Object.freeze([
      Object.freeze({
        symbol: "ETH",
        amount: 3,
        valueUsd: 9_000,
        costBasisUsd: 1_800,
        changePct24h: -2.5,
      }),
    ]);
    const { rerender } = render(pricedTree(holdings, provider));
    await emit(subs[0], { ETH: 4_000 });

    // portfolio-holdings renders costBasisUsd / changePct24h off these rows, so
    // the spread has to carry them through beside the computed value.
    expect(priced().priced[0]).toEqual({
      symbol: "ETH",
      amount: 3,
      valueUsd: 9_000,
      costBasisUsd: 1_800,
      changePct24h: -2.5,
      value: 12_000,
    });

    // Same holdings reference + unmoved mids ⇒ the memo returns the SAME object,
    // so the allocation frame's chart props don't churn on every parent render.
    const before = priced();
    const rendersBefore = pricedRenders;
    rerender(pricedTree(holdings, provider));
    // The hook really ran again (so the identity below is the memo's doing, not
    // a render that never happened) and still handed back the same object.
    expect(pricedRenders).toBeGreaterThan(rendersBefore);
    expect(priced()).toBe(before);
    expect(priced().priced).toBe(before.priced);
  });

  it("treats missing holdings as an empty list and opens no subscription", () => {
    const { provider, subscribeMids } = makeProvider();
    render(pricedTree(undefined, provider));

    // The loading path hands this hook `portfolio?.holdings` — undefined must
    // not throw, and must not subscribe to nothing.
    expect(priced().priced).toEqual([]);
    expect(priced().total).toBe(0);
    expect(subscribeMids).not.toHaveBeenCalled();
  });
});

describe("usePricedHoldings — wrapped-asset mid aliases", () => {
  it("prices WETH off the ETH mid and WBTC off the BTC mid, not the snapshot", async () => {
    const { provider, subs } = makeProvider();
    const holdings: Holding[] = [
      // Deliberately stale snapshots: WETH at 1_000/unit, WBTC at 50_000/unit.
      { symbol: "WETH", amount: 3, valueUsd: 3_000 },
      { symbol: "WBTC", amount: 0.5, valueUsd: 25_000 },
    ];
    render(pricedTree(holdings, provider));

    // The alias reaches the subscription hint too: Hyperliquid quotes ETH/BTC
    // and neither wrapped symbol, so asking for "WETH" would return nothing.
    expect(subs[0].wanted).toEqual(["ETH", "BTC"]);

    await emit(subs[0], { ETH: 4_000, BTC: 100_000, WETH: 1, WBTC: 1 });

    // 3 × ETH mid and 0.5 × BTC mid — not the 3_000 / 25_000 snapshots, and not
    // the bogus wrapped keys (which the projection drops, since they were never
    // in the wanted list).
    expect(valueOf("WETH")).toBe(12_000);
    expect(valueOf("WBTC")).toBe(50_000);
    expect(priced().total).toBe(62_000);
    expect(priced().total).not.toBe(28_000);
  });

  it("matches the alias case-insensitively and reads unaliased symbols under the key it subscribed with", async () => {
    const { provider, subs } = makeProvider();
    const holdings: Holding[] = [
      // A lowercase symbol from a token list: the alias lookup uppercases.
      { symbol: "weth", amount: 2, valueUsd: 1_000 },
      // Not aliased, so it passes through verbatim — and because the SAME
      // mapping feeds the subscription and the lookup, the two keys always
      // agree (a venue quoting only "SOL" simply misses and falls back).
      { symbol: "sol", amount: 10, valueUsd: 500 },
    ];
    render(pricedTree(holdings, provider));

    expect(subs[0].wanted).toEqual(["ETH", "sol"]);

    await emit(subs[0], { ETH: 3_000, sol: 150 });

    expect(valueOf("weth")).toBe(6_000);
    expect(valueOf("sol")).toBe(1_500);
    expect(priced().total).toBe(7_500);
  });
});

describe("usePortfolioView — the wallet config gate", () => {
  it("reports needs-address without touching the provider or the network", async () => {
    const { provider, getPortfolio } = makeProvider();
    render(
      <FramesProvider providers={[provider]}>
        <ViewProbe address="   " />
      </FramesProvider>,
    );
    await flush();

    // The frames render the connect card off this state; a blank address must
    // never reach the provider (nor the keyed credential route).
    expect(view().state).toBe("needs-address");
    expect(getPortfolio).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the portfolio for a configured wallet, passing the trimmed source", async () => {
    const { provider, getPortfolio } = makeProvider();
    render(
      <FramesProvider providers={[provider]}>
        <ViewProbe address="  0xAbC123  " />
      </FramesProvider>,
    );
    // No credential check for a keyless source: it goes straight to loading.
    expect(view().state).toBe("loading");

    await flush();

    expect(getPortfolio).toHaveBeenCalledTimes(1);
    expect(getPortfolio).toHaveBeenCalledWith({
      kind: "wallet",
      address: "0xAbC123",
    });
    expect(view()).toEqual({ state: "live", portfolio: WALLET_PORTFOLIO });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports empty when the connected wallet holds nothing", async () => {
    const empty: Portfolio = {
      source: "wallet",
      holdings: [],
      asOf: 1_700_000_000_000,
    };
    const { provider } = makeProvider(empty);
    render(
      <FramesProvider providers={[provider]}>
        <ViewProbe address="0xAbC123" />
      </FramesProvider>,
    );
    await flush();

    // A distinct state from "error": the address resolved, it just has no
    // holdings, so the card says so instead of blaming the address.
    expect(view()).toEqual({ state: "empty", portfolio: empty });
  });
});
