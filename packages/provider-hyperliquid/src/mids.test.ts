// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperliquidProvider as HyperliquidProviderType } from "./index";

// The allMids stream is the one live loop a browser does NOT throttle when the
// tab goes away: hidden-tab timers get clamped and rAF suspends, but socket
// messages keep arriving, and allMids pushes the whole perp universe
// continuously. Left open, a backgrounded dashboard wakes the CPU several times
// a second forever to merge prices into a map nobody is rendering — the largest
// single background drain in the app.
//
// These tests pin the suspend/resume lifecycle. They matter beyond the battery
// win because the change threads a second reason for the socket to be closed
// through code that already had one (`closedByUser`), and getting that wrong
// fails in the two worst directions: a stream that never comes back (a board
// showing frozen prices with no error), or one that reconnects while hidden and
// quietly undoes the saving.

type Ctor = new () => HyperliquidProviderType;

/** Every socket the provider has opened, in order. */
let sockets: FakeSocket[] = [];

class FakeSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 1;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    sockets.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  /**
   * Deliver a `close` event on its own, modelling the real browser: `close()`
   * returns immediately and `onclose` lands a tick or more later. A handler the
   * provider detached on the way out must not run.
   */
  fireClose() {
    this.onclose?.();
  }

  /** Drive the engine's open handshake, as the browser would. */
  open() {
    this.onopen?.();
  }

  /** Push one allMids frame. */
  push(mids: Record<string, string>) {
    this.onmessage?.({
      data: JSON.stringify({ channel: "allMids", data: { mids } }),
    });
  }

  /** The `subscribe` frames sent on this socket, by dex ("" = default). */
  subscribedDexes(): string[] {
    return this.sent
      .map((raw) => JSON.parse(raw) as { subscription?: { dex?: string } })
      .map((msg) => msg.subscription?.dex ?? "");
  }
}

/** The socket most recently opened (throws if none was). */
function socket(): FakeSocket {
  const last = sockets.at(-1);
  if (!last) throw new Error("no socket was opened");
  return last;
}

function live(): FakeSocket[] {
  return sockets.filter((s) => !s.closed);
}

async function freshProvider(): Promise<HyperliquidProviderType> {
  vi.resetModules();
  const mod = await import("./index");
  const Provider = mod.HyperliquidProvider as unknown as Ctor;
  return new Provider();
}

// Unsubscribe fns for everything a test subscribes, drained in afterEach.
// REQUIRED for isolation, and the reason is the behaviour under test: a live
// subscription holds a `visibilitychange` listener on the shared jsdom
// `document`, and that listener is only detached when the LAST listener leaves
// (correct for the app, where a provider lives as long as the page). Left
// subscribed, every earlier test's provider also resumes on the next test's
// `show()` and opens its own socket, so the counts climb test over test.
const subscriptions: Array<() => void> = [];

function subscribe(
  provider: HyperliquidProviderType,
  onMids: (mids: Record<string, number>) => void,
  symbols?: readonly string[],
) {
  const unsubscribe = provider.subscribeMids(onMids, symbols);
  subscriptions.push(unsubscribe);
  return unsubscribe;
}

function setVisibility(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

function hide() {
  setVisibility(true);
  document.dispatchEvent(new Event("visibilitychange"));
}

function show() {
  setVisibility(false);
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Past the hidden grace period, so a suspend that is due has happened. */
function pastGrace() {
  vi.advanceTimersByTime(21_000);
}

beforeEach(() => {
  sockets = [];
  setVisibility(false);
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  while (subscriptions.length) subscriptions.pop()!();
  setVisibility(false);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("allMids hidden-tab suspension", () => {
  it("closes the socket once the tab has been hidden past the grace period", async () => {
    const provider = await freshProvider();
    const onMids = vi.fn();
    subscribe(provider, onMids, ["BTC"]);
    socket().open();
    socket().push({ BTC: "100" });
    vi.advanceTimersByTime(200);
    expect(onMids).toHaveBeenCalled();
    expect(live()).toHaveLength(1);

    hide();
    // Still streaming during the grace window — a quick glance at another tab
    // must not cost a reconnect.
    expect(live()).toHaveLength(1);

    pastGrace();
    expect(live()).toHaveLength(0);
  });

  it("does not close on a brief hide/show flick", async () => {
    const provider = await freshProvider();
    subscribe(provider, vi.fn(), ["BTC"]);
    socket().open();
    const first = socket();

    hide();
    vi.advanceTimersByTime(5_000);
    show();
    pastGrace();

    // Same socket throughout: no handshake, no full-universe resend. The pending
    // grace timer must be cancelled on return, or it fires and kills a socket
    // the user is actively looking at.
    expect(sockets).toHaveLength(1);
    expect(first.closed).toBe(false);
  });

  it("reopens and re-subscribes every wanted dex on return", async () => {
    const provider = await freshProvider();
    subscribe(provider, vi.fn(), ["BTC", "xyz:TSLA"]);
    socket().open();
    expect(socket().subscribedDexes().sort()).toEqual(["", "xyz"]);

    hide();
    pastGrace();
    expect(live()).toHaveLength(0);

    show();
    expect(sockets).toHaveLength(2);
    socket().open();
    // The HIP-3 dex subscription has to come back too. `subscribedDexes` is
    // reset on close, so a resume that only reopened the socket would leave the
    // equity board silently unfed while crypto ticked on.
    expect(socket().subscribedDexes().sort()).toEqual(["", "xyz"]);
  });

  it("keeps serving the last known mids while suspended", async () => {
    const provider = await freshProvider();
    const onMids = vi.fn();
    subscribe(provider, onMids, ["BTC"]);
    socket().open();
    socket().push({ BTC: "100" });
    vi.advanceTimersByTime(200);

    hide();
    pastGrace();
    show();
    socket().open();
    socket().push({ ETH: "50" });
    vi.advanceTimersByTime(200);

    // BTC survived the suspend: cards show their final quote going stale rather
    // than blanking to zero, and the board is already populated on return
    // before the first new frame lands.
    const latest = onMids.mock.calls.at(-1)?.[0] as Record<string, number>;
    expect(latest).toMatchObject({ BTC: 100, ETH: 50 });
  });

  it("does not auto-reconnect while suspended", async () => {
    const provider = await freshProvider();
    subscribe(provider, vi.fn(), ["BTC"]);
    socket().open();

    hide();
    pastGrace();
    // The close handler's 2s reconnect must not fire here — that timer exists
    // for a dropped connection, and treating a deliberate suspend as one would
    // reopen the stream seconds later and undo the whole saving.
    vi.advanceTimersByTime(60_000);
    expect(live()).toHaveLength(0);
    expect(sockets).toHaveLength(1);
  });

  it("stays closed on return once the last listener has unsubscribed", async () => {
    const provider = await freshProvider();
    const unsubscribe = subscribe(provider, vi.fn(), ["BTC"]);
    socket().open();

    hide();
    pastGrace();
    unsubscribe();
    show();

    // Nobody is listening, so returning to the tab must not resurrect a stream.
    expect(live()).toHaveLength(0);
    expect(sockets).toHaveLength(1);
  });

  it("skips the suspend entirely if the last listener left during the grace window", async () => {
    const provider = await freshProvider();
    const unsubscribe = subscribe(provider, vi.fn(), ["BTC"]);
    socket().open();

    hide();
    unsubscribe(); // teardown already closed it
    expect(live()).toHaveLength(0);
    pastGrace();
    show();
    expect(sockets).toHaveLength(1);
  });

  it("ignores the suspended socket's close event arriving after a resume", async () => {
    const provider = await freshProvider();
    const onMids = vi.fn();
    subscribe(provider, onMids, ["BTC"]);
    socket().open();
    const stale = socket();

    hide();
    pastGrace();
    show();
    const fresh = socket();
    fresh.open();
    fresh.push({ BTC: "100" });

    // The old socket's close event lands late, after the new one is already
    // live. Unguarded it would clear the FRESH socket's pending buffer (losing
    // the flush below) and arm a reconnect against a healthy connection.
    stale.fireClose();
    vi.advanceTimersByTime(200);
    expect(onMids.mock.calls.at(-1)?.[0]).toMatchObject({ BTC: 100 });

    vi.advanceTimersByTime(10_000);
    expect(live()).toEqual([fresh]);
    expect(sockets).toHaveLength(2);
  });

  it("still reconnects normally on an unexpected drop while visible", async () => {
    const provider = await freshProvider();
    subscribe(provider, vi.fn(), ["BTC"]);
    socket().open();

    // A real network drop, not a suspend — the reconnect must be untouched by the
    // visibility plumbing. The wait is jittered ±20% around the 2 s base, so the
    // window is 1.6–2.4 s: below the floor nothing has fired, past the ceiling
    // exactly one attempt has. Advancing to the bare base would be a coin flip.
    socket().close();
    vi.advanceTimersByTime(1_500);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  // A flat retry is the failure mode this pins: every tab on every machine drops
  // at the same instant in a venue outage, so a fixed delay has them all knocking
  // in the same slot forever. Backoff has to actually grow, and — the half that
  // silently rots — it has to come back down, or one bad afternoon leaves every
  // tab on a 30 s reconnect for the rest of the session.
  it("doubles the reconnect wait per failed attempt, and resets on an open", async () => {
    const provider = await freshProvider();
    subscribe(provider, vi.fn(), ["BTC"]);
    socket().open();

    socket().close();
    vi.advanceTimersByTime(2_500);
    expect(sockets).toHaveLength(2);

    // Socket 2 never opens, so the next wait is the doubled 4 s (3.2–4.8 s with
    // jitter) — the first window must pass with no third attempt.
    socket().close();
    vi.advanceTimersByTime(2_500);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(2_500);
    expect(sockets).toHaveLength(3);

    // Socket 3 opens, so the ladder is back at the base for the next drop.
    socket().open();
    socket().close();
    vi.advanceTimersByTime(2_500);
    expect(sockets).toHaveLength(4);
  });
});
