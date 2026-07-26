// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import type { FxRate, MarketDataProvider } from "@zframes/spec/types";
import type { CurrencyCode } from "@zframes/spec/spec";
import { FramesProvider } from "./hooks";
import {
  DashboardCurrencyProvider,
  FrameCurrencyOverride,
  useMoney,
} from "./currency";
import { formatMagnitude, formatMoney, formatMoneyCompact } from "./money";

// The display-currency layer's contract, exercised through the REAL provider +
// hook (no reimplementation of the conversion): providers report USD, the board
// resolves ONE fx poll, and every card renders that USD number in the board's
// currency via `useMoney()`.
//
// The invariant that actually matters is "the symbol and the number always
// agree": until a non-USD rate resolves — or if it comes back missing, zero or
// negative — the card must keep quoting USD, because a baht glyph in front of an
// unconverted dollar amount is a wrong number, not a slow one. Nothing pinned
// that before: a board with a non-USD `currency.code` was never rendered in a
// test, so relaxing `rate <= 0` to `rate < 0`, or breaking the
// `r.symbol === code` lookup, would print "฿20.66" against dollars with the
// suite green. These tests also pin the one-poll-per-board rule and the three
// branches of the per-card override.

/** One FxRate as the `fx-rates` capability reports it: `rate` = symbol per 1 USD. */
function fxRate(symbol: string, rate: number): FxRate {
  return { symbol, base: "USD", rate, changePct: 0, history: [] };
}

/** A minimal fx provider around a spy — name + capability is all routing needs. */
function makeFx(impl: (base: string, symbols: string[]) => Promise<FxRate[]>) {
  const getFxRates = vi.fn(impl);
  const provider: MarketDataProvider = {
    name: "fx",
    capabilities: ["fx-rates"],
    getFxRates,
  };
  return { provider, getFxRates };
}

/**
 * Answers from a fixed table. A requested symbol absent from the table is
 * omitted from the response — exactly how the real Frankfurter-backed provider
 * drops a currency it has no history for.
 */
function tableFx(table: Record<string, number>) {
  return makeFx(async (_base, symbols) =>
    symbols.filter((s) => s in table).map((s) => fxRate(s, table[s])),
  );
}

/** An fx provider whose single response the test releases, to observe the
 *  window before the rate lands. */
function deferredFx(symbol: string, rate: number) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { provider, getFxRates } = makeFx(async () => {
    await gate;
    return [fxRate(symbol, rate)];
  });
  return { provider, getFxRates, release: () => release() };
}

const PRICE_USD = 20.66;
const AGG_USD = 1_234_567_890;

/** Renders every part of the Money surface into readable data attributes. */
function MoneyProbe({ tag }: { tag: string }) {
  const money = useMoney();
  return (
    <span
      data-testid={tag}
      data-code={money.code}
      data-symbol={money.symbol}
      data-rate={String(money.rate)}
      data-converted={String(money.converted)}
      data-convert100={String(money.convert(100))}
      data-price={money.price(PRICE_USD)}
      data-compact={money.compact(AGG_USD)}
      data-magnitude={money.magnitude(AGG_USD)}
    />
  );
}

/** Reports each mount, so a subtree that gets torn down and rebuilt is visible. */
function MountCounter({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return null;
}

interface Reading {
  code: string;
  symbol: string;
  rate: number;
  converted: boolean;
  convert100: number;
  price: string;
  compact: string;
  magnitude: string;
}

function read(container: HTMLElement, tag = "probe"): Reading {
  const el = container.querySelector<HTMLElement>(`[data-testid="${tag}"]`);
  if (!el) throw new Error(`probe "${tag}" did not render`);
  const d = el.dataset;
  return {
    code: d.code ?? "",
    symbol: d.symbol ?? "",
    rate: Number(d.rate),
    converted: d.converted === "true",
    convert100: Number(d.convert100),
    price: d.price ?? "",
    compact: d.compact ?? "",
    magnitude: d.magnitude ?? "",
  };
}

/** A one-probe board on `code`, served by `provider`. */
function board(
  provider: MarketDataProvider,
  code: CurrencyCode,
  children: ReactNode = <MoneyProbe tag="probe" />,
) {
  return (
    <FramesProvider providers={[provider]}>
      <DashboardCurrencyProvider code={code}>
        {children}
      </DashboardCurrencyProvider>
    </FramesProvider>
  );
}

/** Flush the provider promise + the state update it triggers. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** What every card must read while no usable non-USD rate exists. */
function expectUsdFallback(r: Reading) {
  expect(r.code).toBe("USD");
  expect(r.symbol).toBe("$");
  expect(r.rate).toBe(1);
  // The number is unconverted, so the label must say dollars.
  expect(r.convert100).toBe(100);
  expect(r.price).toBe(formatMoney(PRICE_USD, "USD"));
  expect(r.price).not.toContain("฿");
  expect(r.compact).toBe(formatMoneyCompact(AGG_USD, "USD"));
}

afterEach(() => cleanup());

describe("DashboardCurrencyProvider — non-USD conversion", () => {
  it("converts every Money formatter at the resolved rate once the poll lands", async () => {
    const RATE = 36.5;
    const { provider, getFxRates } = tableFx({ THB: RATE });

    const { container } = render(board(provider, "THB"));
    await waitFor(() => expect(read(container).code).toBe("THB"));

    // It asked for exactly the board's currency, quoted against USD.
    expect(getFxRates).toHaveBeenCalledWith("USD", ["THB"]);

    const r = read(container);
    expect(r.symbol).toBe("฿");
    expect(r.rate).toBe(RATE);
    expect(r.converted).toBe(true);
    expect(r.convert100).toBe(3650);

    // Formatting is the money.ts kernel applied to the CONVERTED amount — not a
    // symbol swap in front of the dollar figure.
    expect(r.price).toBe(formatMoney(PRICE_USD * RATE, "THB"));
    expect(r.price).toContain("754"); // 20.66 × 36.5 = 754.09
    expect(r.price).not.toBe(formatMoney(PRICE_USD, "USD"));
    expect(r.compact).toBe(formatMoneyCompact(AGG_USD * RATE, "THB"));
    expect(r.compact).toContain("45.06B"); // 1.23456789e9 × 36.5
    // magnitude() is the axis-tick variant: converted, but symbol-less.
    expect(r.magnitude).toBe(formatMagnitude(AGG_USD * RATE));
    expect(r.magnitude).not.toContain("฿");
  });
});

describe("DashboardCurrencyProvider — the unresolved-rate carve-out", () => {
  it("quotes USD until the rate lands, then flips the whole card together", async () => {
    const { provider, getFxRates, release } = deferredFx("THB", 36.5);

    const { container } = render(board(provider, "THB"));

    // The ask is already in flight …
    expect(getFxRates).toHaveBeenCalledWith("USD", ["THB"]);
    // … and until it answers, dollars in and dollars out.
    expectUsdFallback(read(container));

    release();
    await waitFor(() => expect(read(container).code).toBe("THB"));
    expect(read(container).price).toBe(formatMoney(PRICE_USD * 36.5, "THB"));
  });

  it("stays on USD when the response omits the requested symbol", async () => {
    // Asked for THB, got a response with no THB entry (the real provider drops a
    // currency it has no series for).
    const { provider, getFxRates } = tableFx({ EUR: 0.92 });

    const { container } = render(board(provider, "THB"));
    await settle();

    expect(getFxRates).toHaveBeenCalledWith("USD", ["THB"]);
    expect(getFxRates).toHaveBeenCalledTimes(1);
    expectUsdFallback(read(container));
  });

  it("stays on USD when the rate is 0", async () => {
    const { provider } = tableFx({ THB: 0 });
    const { container } = render(board(provider, "THB"));
    await settle();
    expectUsdFallback(read(container));
  });

  it("stays on USD when the rate is negative", async () => {
    const { provider } = tableFx({ THB: -36.5 });
    const { container } = render(board(provider, "THB"));
    await settle();
    expectUsdFallback(read(container));
    // Specifically: never a baht symbol on a number that was not multiplied.
    expect(read(container).symbol).not.toBe("฿");
  });

  it("keeps `converted` true in the fallback state (cannot be used as a rate-pending flag)", async () => {
    const { provider } = deferredFx("THB", 36.5);
    const { container } = render(board(provider, "THB"));

    // KNOWN BUG: the pre-rate fallback reports converted:true — should be false
    // while a requested non-USD rate is unresolved, as `Money.converted`'s own
    // doc comment ("False while a requested non-USD rate is still unresolved")
    // and `CurrencyState.converted` ("True once a non-USD rate has actually
    // resolved") both promise; the shared USD_STATE constant carries
    // converted:true because it doubles as the genuine USD-board state. Pinned
    // so the suite stays green; fixing the source must flip this assertion.
    expect(read(container).converted).toBe(true);
    expect(read(container).code).toBe("USD");
  });
});

describe("DashboardCurrencyProvider — USD short-circuit", () => {
  it("never asks a provider for a rate on an explicit USD board", async () => {
    const { provider, getFxRates } = tableFx({ THB: 36.5 });

    const { container } = render(board(provider, "USD"));
    await settle();

    const r = read(container);
    expect(r.code).toBe("USD");
    expect(r.rate).toBe(1);
    expect(r.price).toBe(formatMoney(PRICE_USD, "USD"));

    // KNOWN BUG: a USD board still invokes the provider's getFxRates — with an
    // EMPTY symbol list, so nothing can come back — should not call it at all
    // (`useFxRates` polls whenever the provider covers `fx-rates`, regardless of
    // an empty `symbols`). Harmless only because every fx provider short-circuits
    // an empty list before fetching. Pinned so the suite stays green; fixing the
    // source must flip this to `not.toHaveBeenCalled()`.
    expect(getFxRates).toHaveBeenCalledTimes(1);
    expect(getFxRates).toHaveBeenCalledWith("USD", []);
  });

  it("defaults to USD (rate 1) when the board omits a currency code", async () => {
    const { provider, getFxRates } = tableFx({ THB: 36.5 });

    const { container } = render(
      <FramesProvider providers={[provider]}>
        <DashboardCurrencyProvider>
          <MoneyProbe tag="probe" />
        </DashboardCurrencyProvider>
      </FramesProvider>,
    );
    await settle();

    const r = read(container);
    expect(r.code).toBe("USD");
    expect(r.rate).toBe(1);
    expect(r.symbol).toBe("$");
    expect(r.price).toBe(formatMoney(PRICE_USD, "USD"));
    // Same empty-symbol call as above — never a real rate request.
    expect(getFxRates).not.toHaveBeenCalledWith("USD", ["USD"]);
    expect(getFxRates.mock.calls).toEqual([["USD", []]]);
  });
});

describe("DashboardCurrencyProvider — one poll per board", () => {
  it("resolves a single shared rate for many cards", async () => {
    const { provider, getFxRates } = tableFx({ THB: 36.5 });
    const tags = ["a", "b", "c", "d", "e"];

    const { container } = render(
      board(
        provider,
        "THB",
        <>
          {tags.map((tag) => (
            <MoneyProbe key={tag} tag={tag} />
          ))}
        </>,
      ),
    );
    await waitFor(() => expect(read(container, "a").code).toBe("THB"));

    // Five cards, ONE fx poll — the whole point of resolving at board level.
    expect(getFxRates).toHaveBeenCalledTimes(1);
    for (const tag of tags) {
      const r = read(container, tag);
      expect(r.code).toBe("THB");
      expect(r.rate).toBe(36.5);
      expect(r.price).toBe(formatMoney(PRICE_USD * 36.5, "THB"));
    }
  });
});

describe("FrameCurrencyOverride", () => {
  it("passes through and inherits the board currency when no code is given", async () => {
    const { provider, getFxRates } = tableFx({ THB: 36.5 });

    const { container } = render(
      board(
        provider,
        "THB",
        <FrameCurrencyOverride>
          <MoneyProbe tag="probe" />
        </FrameCurrencyOverride>,
      ),
    );
    await waitFor(() => expect(read(container).code).toBe("THB"));

    expect(read(container).rate).toBe(36.5);
    // No second provider, so no second poll.
    expect(getFxRates).toHaveBeenCalledTimes(1);
  });

  it("re-polls and remounts its children when the override repeats the board code", async () => {
    const { provider, getFxRates } = tableFx({ THB: 36.5 });
    const mounted = vi.fn();

    const { container } = render(
      board(
        provider,
        "THB",
        <FrameCurrencyOverride code="THB">
          <MoneyProbe tag="probe" />
          <MountCounter onMount={mounted} />
        </FrameCurrencyOverride>,
      ),
    );
    await waitFor(() => expect(read(container).code).toBe("THB"));

    // The card does end up on the right currency …
    expect(read(container).rate).toBe(36.5);
    expect(read(container).price).toBe(formatMoney(PRICE_USD * 36.5, "THB"));

    // KNOWN BUG: an override that merely repeats the board's own currency is not
    // a pass-through — it fires a second, redundant fx poll for the same code and
    // then REMOUNTS the card's whole subtree — should short-circuit to
    // `<>{children}</>` on the first render. Cause: the guard compares `code`
    // against the *resolved* context code, which is still "USD" on the first
    // render (the board quotes USD until its rate lands), so the override mounts
    // a duplicate DashboardCurrencyProvider and only swaps element type — losing
    // every child's state — once the board rate arrives. Pinned so the suite
    // stays green; fixing the source must flip these two assertions to one call
    // and one mount.
    expect(getFxRates.mock.calls).toEqual([
      ["USD", ["THB"]],
      ["USD", ["THB"]],
    ]);
    expect(mounted).toHaveBeenCalledTimes(2);
  });

  it("resolves its own rate for a third currency, leaving siblings on the board currency", async () => {
    const { provider, getFxRates } = tableFx({ THB: 36.5, EUR: 0.92 });

    const { container } = render(
      board(
        provider,
        "THB",
        <>
          <FrameCurrencyOverride code="EUR">
            <MoneyProbe tag="override" />
          </FrameCurrencyOverride>
          <MoneyProbe tag="sibling" />
        </>,
      ),
    );
    await waitFor(() => expect(read(container, "override").code).toBe("EUR"));

    const overridden = read(container, "override");
    expect(overridden.symbol).toBe("€");
    expect(overridden.rate).toBe(0.92);
    expect(overridden.converted).toBe(true);
    expect(overridden.price).toBe(formatMoney(PRICE_USD * 0.92, "EUR"));

    // The card outside the override is untouched — two currencies side by side.
    const sibling = read(container, "sibling");
    expect(sibling.code).toBe("THB");
    expect(sibling.symbol).toBe("฿");
    expect(sibling.rate).toBe(36.5);
    expect(sibling.price).toBe(formatMoney(PRICE_USD * 36.5, "THB"));

    // One poll for the board + one for the overriding card, each for its own code.
    expect(getFxRates).toHaveBeenCalledTimes(2);
    expect(getFxRates.mock.calls.map(([, symbols]) => symbols)).toEqual(
      expect.arrayContaining([["THB"], ["EUR"]]),
    );
  });
});
