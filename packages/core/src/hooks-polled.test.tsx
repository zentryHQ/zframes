// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { FramesProvider, useDayStatsState } from "./hooks";
import {
  FrameVisibilityContext,
  type FrameVisibility,
  type FrameVisibilityListener,
} from "./visibility";
import type { DayStats, MarketDataProvider } from "@zframes/spec/types";

// `usePolled` is the ONE polling engine behind every capability hook in this
// package (~60 of them). It is module-private, so all of its risky branches are
// pinned here through a real consumer — `useDayStatsState`, whose loader is
// `provider?.getDayStats ? … : null`:
//
//  1. The viewport gate. A 30-frame board scrolled off-screen must stop hitting
//     rate-limited keyless APIs, keep its last good value on the card, and
//     refresh IMMEDIATELY on scroll-back rather than waiting out the interval.
//  2. Error backoff. A transient first-fetch miss on a slow-poll frame (a 6h
//     one) used to stick as an empty "no data" card until a manual reload; the
//     fix keeps the last good value and retries at ~3s/6s/12s, capped at the
//     normal cadence. That is a shipped bug, and this file is its guard.
//  3. The `load === null` branch (a provider advertising the capability but
//     carrying no method) — the difference between a quiet empty state and a
//     permanent skeleton.
//
// Plus the effect-identity contract: the symbol key is sorted so ["ETH","BTC"]
// and ["BTC","ETH"] are ONE effect (and one downstream provider cache key),
// `undefined` means "full universe", and cleanup unsubscribes from the
// visibility pub/sub AND clears the timer so nothing polls after unmount.
//
// Every delay carries ±15% jitter (`0.85 + Math.random() * 0.3`), so timing
// assertions either step past the whole band or pin `Math.random` to 0.5
// (jitter = exactly 1×) where an exact cadence is the thing under test.

type GetDayStats = (symbols?: string[]) => Promise<Record<string, DayStats>>;

const STATS_A: Record<string, DayStats> = {
  BTC: { markPx: 100, prevDayPx: 90, changePct: 11.11 },
};
const STATS_B: Record<string, DayStats> = {
  BTC: { markPx: 200, prevDayPx: 90, changePct: 122.22 },
};

/** A day-stats provider whose loader the test drives directly. */
function makeProvider(getDayStats?: GetDayStats): MarketDataProvider {
  return { name: "test-venue", capabilities: ["day-stats"], getDayStats };
}

/**
 * A hand-built `FrameVisibility`, standing in for the card chrome's publisher
 * (`FrameContent`, which drives it off an IntersectionObserver).
 */
function makeVisibility(initiallyVisible = true) {
  const visibleRef = { current: initiallyVisible };
  const listeners = new Set<FrameVisibilityListener>();
  let unsubscribes = 0;
  const visibility: FrameVisibility = {
    visibleRef,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        unsubscribes += 1;
        listeners.delete(listener);
      };
    },
  };
  return {
    visibility,
    /** Move the frame in/out of view, as the IntersectionObserver would. */
    set(visible: boolean) {
      visibleRef.current = visible;
    },
    /** Notify subscribers — the card sets the ref first, then publishes. */
    publish(visible: boolean) {
      for (const listener of [...listeners]) listener(visible);
    },
    listenerCount: () => listeners.size,
    unsubscribeCount: () => unsubscribes,
  };
}

type ProbeProps = { symbols?: readonly string[]; refreshMs: number };
type DayStatsState = ReturnType<typeof useDayStatsState>;

let latest: DayStatsState | null = null;

function Probe({ symbols, refreshMs }: ProbeProps) {
  latest = useDayStatsState(symbols, refreshMs);
  return null;
}

/** The probe's most recent hook result (throws if it never rendered). */
function state(): DayStatsState {
  if (!latest) throw new Error("Probe did not render");
  return latest;
}

function tree(
  props: ProbeProps,
  provider: MarketDataProvider,
  visibility: FrameVisibility | null,
) {
  const probe = <Probe {...props} />;
  return (
    <FramesProvider providers={[provider]}>
      {visibility ? (
        <FrameVisibilityContext.Provider value={visibility}>
          {probe}
        </FrameVisibilityContext.Provider>
      ) : (
        probe
      )}
    </FramesProvider>
  );
}

/** Let the loader's promise chain and React's resulting state updates settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Move the fake clock, settling each timer's promise chain as it fires. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Pin the ±15% delay jitter to exactly 1×, so a delay lands on its nominal
 * value. Every test that counts ticks across MORE THAN ONE advance window needs
 * this: the jitter slack compounds per window, so after a few hops "one
 * interval" and "two intervals" overlap and the count goes non-deterministic.
 * The jitter band itself is asserted with real randomness in the error tests.
 */
function pinJitter() {
  vi.spyOn(Math, "random").mockReturnValue(0.5); // 0.85 + 0.5 * 0.3 = 1.0
}

/**
 * Drive `document.hidden` + fire `visibilitychange`, as a tab switch would.
 * jsdom's `hidden` is a read-only getter, so it is redefined rather than
 * assigned; `setVisibility(false)` in afterEach restores the default so a test
 * that hides the page can't leak that state into the next one.
 */
function setVisibility(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

function hide() {
  setVisibility(true);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function show() {
  setVisibility(false);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  latest = null;
  setVisibility(false);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  setVisibility(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePolled viewport gate (via useDayStatsState)", () => {
  it("pauses the fetch while off-screen and keeps the last good value", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const view = makeVisibility(true);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        view.visibility,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);
    expect(state().stats).toEqual(STATS_A);
    expect(state().isLoading).toBe(false);

    // Scrolled away: the loop keeps ticking, but must skip the round-trip.
    view.set(false);
    getDayStats.mockResolvedValue(STATS_B);
    await advance(60_000); // six skipped ticks at the pinned 10s cadence
    expect(getDayStats).toHaveBeenCalledTimes(1);
    expect(state().stats).toEqual(STATS_A); // the last good value survived
    expect(state().isLoading).toBe(false);

    // Back in view: the SAME loop resumes on the normal cadence (it was paused,
    // not torn down), and the fresher payload lands.
    view.set(true);
    await advance(10_000);
    expect(getDayStats).toHaveBeenCalledTimes(2);
    expect(state().stats).toEqual(STATS_B);
  });

  it("fetches immediately on scroll-back instead of waiting out the interval", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const view = makeVisibility(true);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 5 * 60_000 },
        makeProvider(getDayStats),
        view.visibility,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);
    getDayStats.mockResolvedValue(STATS_B);

    // A publish that reports "still off-screen" must not fetch.
    view.set(false);
    await act(async () => {
      view.publish(false);
    });
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);
    expect(state().stats).toEqual(STATS_A);

    // Scrolled back into view: refresh NOW, with the clock untouched — the
    // 5-minute interval would otherwise leave a stale card on screen.
    view.set(true);
    await act(async () => {
      view.publish(true);
    });
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2);
    expect(state().stats).toEqual(STATS_B);
  });

  it("never pauses when no card publishes visibility (the Storybook case)", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        null, // context stays at its null default → no gating
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);

    // Three uninterrupted intervals: with no publisher there is nothing that
    // could gate the loop, so every tick fetches.
    for (const expected of [2, 3, 4]) {
      await advance(10_000);
      expect(getDayStats).toHaveBeenCalledTimes(expected);
    }
  });
});

describe("usePolled page-visibility gate", () => {
  // The second, coarser axis: the viewport gate above pauses ONE card, this
  // stands the whole board down when the tab goes away. It is a battery
  // guarantee, so the assertions are about what does NOT happen — a laptop with
  // a dashboard open in a background tab must hold no polling timer at all.
  it("holds no timer while hidden, and refetches immediately on return", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        null,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);

    hide();
    // Ten intervals' worth of wall clock. Not merely "fewer fetches" — the loop
    // must be fully stopped, so the count cannot move at all.
    await advance(100_000);
    expect(getDayStats).toHaveBeenCalledTimes(1);
    expect(state().stats).toEqual(STATS_A); // last good value still on the card
    expect(state().isLoading).toBe(false);

    // Coming back refreshes at once rather than waiting out the interval — the
    // whole point of stopping the loop is that returning must not show a
    // minutes-stale price while a timer runs down.
    getDayStats.mockResolvedValue(STATS_B);
    show();
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2);
    expect(state().stats).toEqual(STATS_B);
  });

  it("cancels the in-flight interval on hide, so no tick leaks through", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        null,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);

    // Hide PART-WAY through an interval. The already-scheduled timer is the
    // regression risk here: without clearing it on the way out it still fires
    // once in the background before any guard can stand it down.
    await advance(6_000);
    hide();
    await advance(60_000);
    expect(getDayStats).toHaveBeenCalledTimes(1);
  });

  it("resumes the normal cadence after returning, not a doubled-up loop", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        null,
      ),
    );
    await flush();
    hide();
    await advance(30_000);
    show();
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2); // the immediate catch-up fetch

    // One loop, not two: a hide/show cycle must not leave an extra timer behind,
    // which would double the poll rate on every subsequent visit.
    for (const expected of [3, 4, 5]) {
      await advance(10_000);
      expect(getDayStats).toHaveBeenCalledTimes(expected);
    }
  });

  it("stays paused across repeated hide/show while off-screen too", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const view = makeVisibility(true);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        view.visibility,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);

    // Both gates engaged at once. Returning to the tab must NOT wake a card that
    // is still scrolled out of view — the two gates compose, and the coarser one
    // lifting doesn't override the finer one.
    view.set(false);
    hide();
    await advance(30_000);
    show();
    await flush();
    await advance(30_000);
    expect(getDayStats).toHaveBeenCalledTimes(1);

    // Only when both say "visible" does it fetch again.
    view.set(true);
    view.publish(true);
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2);
  });
});

describe("usePolled cleanup", () => {
  it("unsubscribes and clears the timer on unmount — nothing polls after", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const view = makeVisibility(true);
    const { unmount } = render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(getDayStats),
        view.visibility,
      ),
    );
    await flush();
    expect(view.listenerCount()).toBe(1);
    expect(view.unsubscribeCount()).toBe(0);
    expect(getDayStats).toHaveBeenCalledTimes(1);

    unmount();
    expect(view.unsubscribeCount()).toBe(1);
    expect(view.listenerCount()).toBe(0);

    // Neither the interval nor a late scroll-back can revive a dead frame.
    await advance(60_000);
    view.publish(true);
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);
  });

  it("retires the previous subscription + timer when the symbol key changes", async () => {
    pinJitter();
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const provider = makeProvider(getDayStats);
    const view = makeVisibility(true);
    const { rerender } = render(
      tree({ symbols: ["BTC"], refreshMs: 10_000 }, provider, view.visibility),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);

    rerender(
      tree({ symbols: ["ETH"], refreshMs: 10_000 }, provider, view.visibility),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2);
    expect(getDayStats.mock.calls[1][0]).toEqual(["ETH"]);
    // Exactly one live subscription — the old one was released, not leaked.
    expect(view.unsubscribeCount()).toBe(1);
    expect(view.listenerCount()).toBe(1);

    // The retired chain's timer was cleared: one interval yields ONE fetch, not
    // two racing chains both re-fetching.
    await advance(10_000);
    expect(getDayStats).toHaveBeenCalledTimes(3);
  });
});

describe("usePolled error handling", () => {
  it("keeps the last good value and retries in ~3s, not a full interval", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const view = makeVisibility(true);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 6 * 60 * 60_000 },
        makeProvider(getDayStats),
        view.visibility,
      ),
    );
    await flush();
    expect(state().stats).toEqual(STATS_A);

    // Fail from here on. Publishing a scroll-back gives us a failing tick at a
    // known clock time (0) without burning the 6h interval first — that timer is
    // replaced by the backoff one.
    getDayStats.mockRejectedValue(new Error("429 Too Many Requests"));
    await act(async () => {
      view.publish(true);
    });
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2);
    // The card keeps its numbers instead of blanking to the {} fallback …
    expect(state().stats).toEqual(STATS_A);
    expect(state().isLoading).toBe(false);

    // … and retries inside the jitter band around 3000ms (0.85–1.15 ×), rather
    // than sitting empty-handed for another six hours.
    await advance(2_540); // below the 2550ms floor
    expect(getDayStats).toHaveBeenCalledTimes(2);
    await advance(910); // clock now 3450ms — the band's ceiling
    expect(getDayStats).toHaveBeenCalledTimes(3);
  });

  it("resolves empty with no timer armed when the provider has no getDayStats", async () => {
    // Advertises "day-stats" but carries no method → `load === null`.
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        { name: "meta-only", capabilities: ["day-stats"] },
        makeVisibility(true).visibility,
      ),
    );
    // Synchronous: the effect resolves the loading flag with no promise in play,
    // so the frame shows its empty state instead of a permanent skeleton.
    expect(state().isLoading).toBe(false);
    expect(state().stats).toEqual({});
    expect(vi.getTimerCount()).toBe(0);

    await advance(120_000);
    expect(state().isLoading).toBe(false);
    expect(state().stats).toEqual({});

    // Contrast: a provider that CAN load arms exactly the one poll timer, so the
    // zero above is a real absence, not an artefact of the counter.
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 10_000 },
        makeProvider(vi.fn<GetDayStats>().mockResolvedValue(STATS_A)),
        makeVisibility(true).visibility,
      ),
    );
    await flush();
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("usePolled backoff cadence (jitter pinned to 1×)", () => {
  // Delays land exactly on their nominal value, so the doubling, the cap, and
  // the post-success reset can each be asserted to the millisecond.
  beforeEach(pinJitter);

  /** Assert the next fetch lands at exactly `delay`, not a millisecond earlier. */
  async function expectFetchAt(
    getDayStats: ReturnType<typeof vi.fn<GetDayStats>>,
    delay: number,
    callsAfter: number,
  ) {
    await advance(delay - 1);
    expect(getDayStats).toHaveBeenCalledTimes(callsAfter - 1);
    await advance(1);
    expect(getDayStats).toHaveBeenCalledTimes(callsAfter);
  }

  it("escalates the retry 3s → 6s → 12s across a failure streak", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 60_000 },
        makeProvider(getDayStats),
        makeVisibility(true).visibility,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);

    getDayStats.mockRejectedValue(new Error("429"));
    await advance(60_000); // the normal cadence fires and fails
    expect(getDayStats).toHaveBeenCalledTimes(2);

    await expectFetchAt(getDayStats, 3_000, 3);
    await expectFetchAt(getDayStats, 6_000, 4);
    await expectFetchAt(getDayStats, 12_000, 5);
  });

  it("clamps the retry delay to refreshMs (the Math.min cap)", async () => {
    // refreshMs 4000 < 6000, so the streak's 2nd and 3rd delays clamp to 4000
    // instead of doubling to 6000 / 12 000.
    const getDayStats = vi
      .fn<GetDayStats>()
      .mockRejectedValue(new Error("503 Service Unavailable"));
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 4_000 },
        makeProvider(getDayStats),
        makeVisibility(true).visibility,
      ),
    );
    await flush();
    // First fetch already failed: no data, but not stuck loading either.
    expect(getDayStats).toHaveBeenCalledTimes(1);
    expect(state().stats).toEqual({});
    expect(state().isLoading).toBe(false);

    await expectFetchAt(getDayStats, 3_000, 2); // min(3000, 60000, 4000)
    await expectFetchAt(getDayStats, 4_000, 3); // min(6000, 60000, 4000)
    await expectFetchAt(getDayStats, 4_000, 4); // min(12000, 60000, 4000)
  });

  it("returns to the plain refreshMs cadence after one success", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    render(
      tree(
        { symbols: ["BTC"], refreshMs: 20_000 },
        makeProvider(getDayStats),
        makeVisibility(true).visibility,
      ),
    );
    await flush();

    getDayStats.mockRejectedValue(new Error("429"));
    await advance(20_000); // 2nd fetch fails → streak 1 → 3000ms
    expect(getDayStats).toHaveBeenCalledTimes(2);
    await advance(3_000); // 3rd fails → streak 2 → 6000ms
    expect(getDayStats).toHaveBeenCalledTimes(3);

    getDayStats.mockResolvedValue(STATS_B);
    await advance(6_000); // 4th succeeds → streak resets
    expect(getDayStats).toHaveBeenCalledTimes(4);
    expect(state().stats).toEqual(STATS_B);

    // The next poll is a full interval away, not 12 000ms.
    getDayStats.mockRejectedValue(new Error("429"));
    await expectFetchAt(getDayStats, 20_000, 5);
    // …and the streak counter reset with it: the retry is 3000ms again.
    await expectFetchAt(getDayStats, 3_000, 6);
  });
});

describe("useDayStatsState symbol keying", () => {
  it("sorts the symbol key so order-variant tuples are ONE effect", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const provider = makeProvider(getDayStats);
    const view = makeVisibility(true);
    // Mount with the UNSORTED tuple, so the outgoing order is observable: the
    // render that is expected NOT to re-fetch can't witness it, and an
    // already-sorted input would hold whether or not the hook sorts at all.
    const passed = ["ETH", "BTC"];
    const { rerender } = render(
      tree({ symbols: passed, refreshMs: 10_000 }, provider, view.visibility),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);
    // Sorted on the way out too, so the provider's own cache key collapses.
    expect(getDayStats.mock.calls[0][0]).toEqual(["BTC", "ETH"]);
    // …and sorted on a COPY: a frame handing over its config array must not find
    // it reordered underneath it.
    expect(passed).toEqual(["ETH", "BTC"]);

    rerender(
      tree(
        { symbols: ["BTC", "ETH"], refreshMs: 10_000 },
        provider,
        view.visibility,
      ),
    );
    await flush();
    // Same set, different order → no re-fetch and no effect teardown. (The
    // effect-identity half is symmetric, so swapping which order mounts first
    // costs nothing.)
    expect(getDayStats).toHaveBeenCalledTimes(1);
    expect(view.unsubscribeCount()).toBe(0);

    // A genuinely different set does re-fire — and it too goes out sorted.
    rerender(
      tree(
        { symbols: ["SOL", "ETH"], refreshMs: 10_000 },
        provider,
        view.visibility,
      ),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(2);
    expect(getDayStats.mock.calls[1][0]).toEqual(["ETH", "SOL"]);
  });

  it("asks for the full universe on undefined symbols, and [] is a distinct request", async () => {
    const getDayStats = vi.fn<GetDayStats>().mockResolvedValue(STATS_A);
    const provider = makeProvider(getDayStats);
    const view = makeVisibility(true);
    const { rerender } = render(
      tree({ refreshMs: 10_000 }, provider, view.visibility),
    );
    await flush();
    expect(getDayStats).toHaveBeenCalledTimes(1);
    // The "*" key forwards `undefined` — the provider's full-universe request.
    expect(getDayStats.mock.calls[0][0]).toBeUndefined();

    rerender(
      tree({ symbols: [], refreshMs: 10_000 }, provider, view.visibility),
    );
    await flush();
    // "*" → "" is a real key change: an empty array asks for nothing, which is
    // NOT the same call as asking for everything.
    expect(getDayStats).toHaveBeenCalledTimes(2);
    expect(getDayStats.mock.calls[1][0]).toEqual([]);
  });
});
