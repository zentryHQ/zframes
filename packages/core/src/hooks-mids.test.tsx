// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { FramesProvider, useMids, useMidsState } from "./hooks";
import type { MarketDataProvider } from "@zframes/spec/types";

// `useMidsState` is the ONLY streaming hook in the repo — every live price card
// (price-ticker, price-liveline, price-chart, the journal frames, the portfolio
// frames) reads its quote from here, and nothing else in the suite touches the
// WebSocket path: frame-smoke's mock provider resolves promises. The four
// contracts pinned here:
//
//  1. Projection. A quote socket pushes the venue's WHOLE mid map (Hyperliquid's
//     allMids is thousands of symbols); the hook hands the frame only the
//     symbols it asked for, and passes that same filtered list to
//     `subscribeMids` as the widen-coverage hint.
//  2. Referential identity. allMids fans out several times a second. When no
//     WANTED symbol moved, the returned object must be the SAME reference, or
//     every live frame re-renders on every tick of every unrelated symbol —
//     price-liveline keys an effect off `mids` directly. The mirror case matters
//     as much: a wanted symbol that DISAPPEARS from the payload has to produce a
//     new object (the key-count comparison), otherwise its last price freezes on
//     the card forever.
//  3. Loading resolution. Loading clears on the first delivered message, and an
//     8s timeout clears it even if the stream never speaks — a card pinned to a
//     symbol this venue doesn't stream shows its empty state instead of spinning
//     a skeleton forever. A provider that can't stream at all (or an empty
//     symbol list) resolves synchronously with no subscription.
//  4. Cleanup. Unmount and a symbol change both unsubscribe and disarm the
//     pending timeout, and the retired subscription's callback is inert — a
//     socket that fans out to a stale closure must not write a dead frame's
//     symbol into the live one's map.
//
// Note on scope: the runtime's ticker tape deliberately does NOT use this hook
// (it keeps mids in a ref and flushes text on an interval, see
// apps/runtime/src/ticker-tape.tsx), so the identity guard is here for the
// frames, not the tape.

type Emit = (mids: Record<string, number>) => void;

/** One `subscribeMids` call: the socket callback, the hint, and its teardown. */
type Subscription = {
  emit: Emit;
  wanted: readonly string[] | undefined;
  unsubscribe: ReturnType<typeof vi.fn>;
};

/**
 * A quote-stream provider whose socket the test drives by hand. Every
 * subscription is recorded (not just the latest) so a retired one can still be
 * fired at the hook — the stale-callback case.
 */
function makeStreamProvider(name = "stream-venue") {
  const subs: Subscription[] = [];
  const subscribeMids = vi.fn((onMids: Emit, symbols?: readonly string[]) => {
    const unsubscribe = vi.fn();
    subs.push({ emit: onMids, wanted: symbols, unsubscribe });
    return unsubscribe;
  });
  const provider: MarketDataProvider = {
    name,
    capabilities: ["quote-stream"],
    subscribeMids,
  };
  return { provider, subs, subscribeMids };
}

type MidsState = ReturnType<typeof useMidsState>;

let latest: MidsState | null = null;
/** Commit counter — the identity guard's whole point is that this stops rising. */
let renders = 0;

function Probe({ symbols }: { symbols: readonly string[] }) {
  renders += 1;
  latest = useMidsState(symbols);
  return null;
}

/** The probe's most recent hook result (throws if it never rendered). */
function state(): MidsState {
  if (!latest) throw new Error("Probe did not render");
  return latest;
}

function tree(symbols: readonly string[], provider: MarketDataProvider) {
  return (
    <FramesProvider providers={[provider]}>
      <Probe symbols={symbols} />
    </FramesProvider>
  );
}

/** Push a payload down the socket, letting React commit what it triggers. */
async function emit(sub: Subscription, mids: Record<string, number>) {
  await act(async () => {
    sub.emit(mids);
  });
}

/** Move the fake clock, settling whatever the fired timer schedules. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  latest = null;
  renders = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useMidsState — subscription + projection", () => {
  it("subscribes once with the filtered wanted list and projects only those symbols", async () => {
    const { provider, subs, subscribeMids } = makeStreamProvider();
    // The blank entry stands in for a half-edited config field; `filter(Boolean)`
    // must drop it before the list reaches the provider.
    const { rerender } = render(tree(["BTC", "", "ETH"], provider));

    expect(subscribeMids).toHaveBeenCalledTimes(1);
    expect(subs[0].wanted).toEqual(["BTC", "ETH"]);
    expect(state().mids).toEqual({});
    expect(state().isLoading).toBe(true);

    // A realistic allMids frame: the venue's whole universe, of which this card
    // asked for two symbols.
    await emit(subs[0], { BTC: 100, ETH: 50, SOL: 9, "xyz:TSLA": 400 });

    expect(state().mids).toEqual({ BTC: 100, ETH: 50 });
    expect(Object.keys(state().mids)).toEqual(["BTC", "ETH"]);
    expect(state().isLoading).toBe(false);

    // Re-rendering with the same symbol list must not re-open the socket.
    rerender(tree(["BTC", "", "ETH"], provider));
    expect(subscribeMids).toHaveBeenCalledTimes(1);
    expect(subs).toHaveLength(1);
  });

  it("omits a wanted symbol the stream doesn't carry rather than writing undefined", async () => {
    const { provider, subs } = makeStreamProvider();
    render(tree(["BTC", "PEPE"], provider));

    // PEPE isn't listed on this venue: the key must be absent, so the frame's
    // `mids[symbol] ?? stats[symbol]?.markPx` fallback can take over.
    await emit(subs[0], { BTC: 100 });

    expect(state().mids).toEqual({ BTC: 100 });
    expect("PEPE" in state().mids).toBe(false);
    // A message that carries none of the wanted symbols still counts as the
    // stream speaking, so the card drops out of its skeleton.
    expect(state().isLoading).toBe(false);
  });
});

describe("useMidsState — referential identity guard", () => {
  it("returns the SAME object, and stops re-rendering, when no wanted symbol moved", async () => {
    const { provider, subs } = makeStreamProvider();
    render(tree(["BTC", "ETH"], provider));
    await emit(subs[0], { BTC: 100, ETH: 50 });

    const first = state().mids;

    // Socket frames in which BTC and ETH hold still and only unrelated symbols
    // move — what the large majority of allMids pushes look like. The first one
    // after a commit still re-invokes the component (React's eager-bailout path
    // needs an idle fiber), so steady state is measured from there.
    await emit(subs[0], { BTC: 100, ETH: 50, SOL: 1 });
    const settled = renders;
    for (const sol of [2, 3, 4, 5, 6]) {
      await emit(subs[0], { BTC: 100, ETH: 50, SOL: sol, DOGE: sol * 2 });
    }

    // Five idle ticks, zero renders: the identical-object return is what lets
    // React bail out instead of reconciling every live card several times a
    // second.
    expect(renders).toBe(settled);
    expect(state().mids).toBe(first);

    // One wanted symbol actually ticks → a new object, and the frame re-renders.
    await emit(subs[0], { BTC: 101, ETH: 50, SOL: 6 });

    expect(state().mids).not.toBe(first);
    expect(state().mids).toEqual({ BTC: 101, ETH: 50 });
    expect(renders).toBeGreaterThan(settled);
  });

  it("returns a new object when a wanted symbol drops out of the payload", async () => {
    const { provider, subs } = makeStreamProvider();
    render(tree(["BTC", "ETH"], provider));
    await emit(subs[0], { BTC: 100, ETH: 50 });
    const first = state().mids;

    // ETH stops being quoted (delisted, or its HIP-3 dex dropped off the
    // socket). Every value-vs-value check passes here — only the key-count
    // comparison notices, and without it ETH's last price would sit frozen on
    // the card for the rest of the session.
    await emit(subs[0], { BTC: 100, SOL: 9 });

    expect(state().mids).not.toBe(first);
    expect(state().mids).toEqual({ BTC: 100 });
    expect("ETH" in state().mids).toBe(false);

    // …and it comes back when the venue starts quoting it again.
    await emit(subs[0], { BTC: 100, ETH: 51 });
    expect(state().mids).toEqual({ BTC: 100, ETH: 51 });
  });
});

describe("useMidsState — loading resolution", () => {
  it("clears isLoading on the first message and disarms the 8s timeout", async () => {
    const { provider, subs } = makeStreamProvider();
    render(tree(["BTC"], provider));

    // Exactly one pending timer: the 8s fallback.
    expect(state().isLoading).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    await emit(subs[0], { BTC: 100 });
    expect(state().isLoading).toBe(false);
    // Cleared, not merely superseded — nothing is left to fire later.
    expect(vi.getTimerCount()).toBe(0);

    const settled = state().mids;
    const rendersAfterTick = renders;
    await advance(20_000);
    // No late state change once the stream is live.
    expect(state().mids).toBe(settled);
    expect(state().isLoading).toBe(false);
    expect(renders).toBe(rendersAfterTick);
  });

  it("gives up the skeleton after 8s of silence, and still accepts a late tick", async () => {
    const { provider, subs } = makeStreamProvider();
    render(tree(["BTC"], provider));
    expect(subs).toHaveLength(1);

    await advance(7_999);
    expect(state().isLoading).toBe(true);

    await advance(1);
    // The card renders its empty state instead of spinning forever — this is the
    // "symbol the venue doesn't stream" path.
    expect(state().isLoading).toBe(false);
    expect(state().mids).toEqual({});

    // The timeout only resolves the flag; the subscription is still live, so a
    // quote that finally arrives lands.
    await emit(subs[0], { BTC: 100 });
    expect(state().mids).toEqual({ BTC: 100 });
    expect(subs[0].unsubscribe).not.toHaveBeenCalled();
  });

  it("resolves non-loading with no subscription when no provider can stream", () => {
    // Advertises the capability but carries no method — the shape a partially
    // implemented provider takes.
    render(
      tree(["BTC"], { name: "meta-only", capabilities: ["quote-stream"] }),
    );
    expect(state().isLoading).toBe(false);
    expect(state().mids).toEqual({});
    expect(vi.getTimerCount()).toBe(0);

    cleanup();
    latest = null;

    // Nobody covers quote-stream at all: same quiet resolution, no crash.
    render(tree(["BTC"], { name: "stats-only", capabilities: ["day-stats"] }));
    expect(state().isLoading).toBe(false);
    expect(state().mids).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves non-loading without subscribing when the symbol list is empty", () => {
    const { provider, subscribeMids } = makeStreamProvider();
    const { rerender } = render(tree([], provider));

    expect(subscribeMids).not.toHaveBeenCalled();
    expect(state().isLoading).toBe(false);
    expect(state().mids).toEqual({});
    expect(vi.getTimerCount()).toBe(0);

    // A list of blanks is the same nothing once `filter(Boolean)` runs.
    rerender(tree(["", ""], provider));
    expect(subscribeMids).not.toHaveBeenCalled();
    expect(state().isLoading).toBe(false);

    // Contrast, so the zeros above are a real absence and not an artefact: the
    // same provider with one real symbol subscribes and arms the one timer.
    rerender(tree(["BTC"], provider));
    expect(subscribeMids).toHaveBeenCalledTimes(1);
    expect(state().isLoading).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("useMidsState — cleanup", () => {
  it("unsubscribes and disarms the timeout on unmount; a late tick is inert", async () => {
    const { provider, subs } = makeStreamProvider();
    const { unmount } = render(tree(["BTC"], provider));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    // The socket may already be mid-fan-out when the frame goes away: the
    // `cancelled` guard has to swallow the callback rather than setState into a
    // dead fiber.
    const rendersAfterUnmount = renders;
    await emit(subs[0], { BTC: 100 });
    await advance(20_000);
    expect(renders).toBe(rendersAfterUnmount);
  });

  it("retires the old subscription on a symbol change and ignores its stale ticks", async () => {
    const { provider, subs, subscribeMids } = makeStreamProvider();
    const { rerender } = render(tree(["BTC"], provider));
    await emit(subs[0], { BTC: 100 });
    expect(state().mids).toEqual({ BTC: 100 });

    rerender(tree(["ETH"], provider));

    expect(subscribeMids).toHaveBeenCalledTimes(2);
    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subs[1].wanted).toEqual(["ETH"]);
    // The card blanks rather than showing the previous symbol's price under the
    // new symbol's label.
    expect(state().mids).toEqual({});

    // The retired closure is inert even though the provider still holds it.
    await emit(subs[0], { BTC: 999 });
    expect(state().mids).toEqual({});

    await emit(subs[1], { ETH: 50, BTC: 999 });
    expect(state().mids).toEqual({ ETH: 50 });
  });

  it("re-subscribes when the symbol ORDER changes (this key is not sorted)", async () => {
    // Unlike useDayStatsState, which sorts its key so ["ETH","BTC"] and
    // ["BTC","ETH"] collapse to one effect, useMidsState joins verbatim — a
    // reordered config array reopens the subscription. Pinned as-is: it is a
    // cadence detail, not a correctness one (the projected map is identical
    // either way), but a future sort here would be a deliberate change.
    const { provider, subs, subscribeMids } = makeStreamProvider();
    const { rerender } = render(tree(["BTC", "ETH"], provider));
    expect(subs[0].wanted).toEqual(["BTC", "ETH"]);

    rerender(tree(["ETH", "BTC"], provider));

    expect(subscribeMids).toHaveBeenCalledTimes(2);
    expect(subs[1].wanted).toEqual(["ETH", "BTC"]);
    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);

    // Same set either way, so the projection is order-independent.
    await emit(subs[1], { BTC: 100, ETH: 50, SOL: 9 });
    expect(state().mids).toEqual({ BTC: 100, ETH: 50 });
  });
});

describe("useMids", () => {
  it("hands back the mids map itself, with the identity guard intact", async () => {
    // price-liveline lists `mids` in an effect's dep array, so this thin wrapper
    // inherits the whole perf contract — an object that changed identity on
    // every unrelated tick would re-run that effect several times a second.
    const { provider, subs } = makeStreamProvider();
    let seen: Record<string, number> | null = null;
    function MidsProbe() {
      seen = useMids(["BTC"]);
      return null;
    }
    render(
      <FramesProvider providers={[provider]}>
        <MidsProbe />
      </FramesProvider>,
    );
    expect(seen).toEqual({});

    await emit(subs[0], { BTC: 100, ETH: 50 });
    expect(seen).toEqual({ BTC: 100 });
    const first = seen;

    await emit(subs[0], { BTC: 100, ETH: 51 });
    expect(seen).toBe(first);

    await emit(subs[0], { BTC: 101 });
    expect(seen).not.toBe(first);
    expect(seen).toEqual({ BTC: 101 });
  });
});
