// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { onHeartbeat, useVisibilityRef } from "./live-tick";
import { formatCountdownCs, useCountdown } from "./use-countdown";

// The shared liveness layer is a perf contract: many live frames must collapse
// onto ONE timer, viewport-gate their work, and the clock's segment math must be
// exact. These tests exercise the real exported primitives — not a reimplementation
// — so each fails if the fan-out, the single-timer lifecycle, or the math regresses.

// ── onHeartbeat: one shared 1 Hz timer fans out to every appender ────────────
describe("onHeartbeat", () => {
  // The unregister fns for everything a test registers, drained in afterEach so
  // the module-level Set + interval always return to a clean slate (the timer is
  // module singleton state that would otherwise leak across tests).
  const cleanups: Array<() => void> = [];
  const track = (cb: () => void) => {
    const un = onHeartbeat(cb);
    cleanups.push(un);
    return un;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("drives many callbacks from a single interval, every second", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    track(a);
    track(b);
    track(c);

    // Three appenders, ONE underlying interval — the whole point of the shared
    // heartbeat (20 live frames = 1 timer, not 20).
    expect(setInterval).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    expect(c).toHaveBeenCalledTimes(2);
  });

  it("does not tick before a full second elapses", () => {
    const a = vi.fn();
    track(a);
    vi.advanceTimersByTime(999);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("stops firing a callback once it unregisters, keeps the rest", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unA = track(a);
    track(b);

    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unA();
    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(1); // dropped
    expect(b).toHaveBeenCalledTimes(2); // still ticking
  });

  it("clears the interval when the last callback unregisters, and restarts on re-register", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const clearInterval = vi.spyOn(globalThis, "clearInterval");

    const a = vi.fn();
    const unA = track(a);
    expect(setInterval).toHaveBeenCalledTimes(1);

    unA();
    // The last appender leaving must tear the timer down — an idle dashboard
    // holds no interval.
    expect(clearInterval).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(a).not.toHaveBeenCalled();

    const b = vi.fn();
    track(b);
    expect(setInterval).toHaveBeenCalledTimes(2); // a fresh interval, not a dead one
    vi.advanceTimersByTime(1_000);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("snapshots the callback set so unregistering mid-tick is safe", () => {
    const b = vi.fn();
    let unB: () => void = () => {};
    // `a` removes `b` while the tick is iterating.
    const a = vi.fn(() => unB());
    track(a);
    unB = track(b);

    vi.advanceTimersByTime(1_000);
    // Snapshot taken before the loop → both still fire on the tick where a drops b.
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1); // gone on the next tick
  });
});

// ── useVisibilityRef: IntersectionObserver-backed gate flag ──────────────────
type IOCallback = (entries: { isIntersecting: boolean }[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  options: IntersectionObserverInit;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: IOCallback, options: IntersectionObserverInit = {}) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

describe("useVisibilityRef", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });
  afterEach(() => {
    cleanup();
  });

  const lastIO = () =>
    MockIntersectionObserver.instances[
      MockIntersectionObserver.instances.length - 1
    ];

  it("defaults to visible, observes with a 200px rootMargin, and flips with intersection", () => {
    let api: ReturnType<typeof useVisibilityRef<HTMLDivElement>> | null = null;
    function Probe() {
      api = useVisibilityRef<HTMLDivElement>();
      return <div ref={api.ref} />;
    }
    render(<Probe />);

    // A freshly-mounted in-view frame reads visible before the observer's first
    // async callback (and on platforms without IntersectionObserver).
    expect(api!.visibleRef.current).toBe(true);
    const io = lastIO();
    expect(io.observed).toHaveLength(1);
    expect(io.options.rootMargin).toBe("200px"); // warm ~200px before scroll

    act(() => io.trigger(false));
    expect(api!.visibleRef.current).toBe(false);

    act(() => io.trigger(true));
    expect(api!.visibleRef.current).toBe(true);
  });

  it("honours a custom rootMargin", () => {
    function Probe() {
      const { ref } = useVisibilityRef<HTMLDivElement>("50px");
      return <div ref={ref} />;
    }
    render(<Probe />);
    expect(lastIO().options.rootMargin).toBe("50px");
  });

  it("disconnects the observer on unmount", () => {
    function Probe() {
      const { ref } = useVisibilityRef<HTMLDivElement>();
      return <div ref={ref} />;
    }
    const { unmount } = render(<Probe />);
    const io = lastIO();
    expect(io.disconnected).toBe(false);
    unmount();
    expect(io.disconnected).toBe(true);
  });
});

// ── formatCountdownCs: HH:MM:SS:cs segment math ──────────────────────────────
describe("formatCountdownCs", () => {
  it("formats zero as four padded zero segments", () => {
    expect(formatCountdownCs(0)).toBe("00:00:00:00");
  });

  it("splits hours / minutes / seconds correctly", () => {
    // 1h 2m 3s
    expect(formatCountdownCs(3_723_000)).toMatch(/^01:02:03:\d{2}$/);
  });

  it("zero-pads single-digit segments", () => {
    // 5s
    expect(formatCountdownCs(5_000)).toMatch(/^00:00:05:\d{2}$/);
  });

  it("does not clamp hours to a day — they keep accumulating", () => {
    // 25h — a countdown longer than a day must read 25, not roll over to 01.
    expect(formatCountdownCs(90_000_000)).toMatch(/^25:00:00:\d{2}$/);
  });

  it("always emits four two-digit colon-separated segments", () => {
    for (const ms of [0, 1, 999, 61_000, 3_600_000, 123_456_789]) {
      expect(formatCountdownCs(ms)).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
    }
  });
});

// ── useCountdown: viewport-gated, ref-writing global tick ────────────────────
// Drives the real module-level 24fps tick (created on import under jsdom). The
// tick writes straight to the node's textContent — no React state — so we assert
// on the DOM and gate purely on the element's on-screen rect.
describe("useCountdown", () => {
  afterEach(() => {
    cleanup();
  });

  /** A clock whose element reports a fixed viewport-top via a stubbed rect. */
  function Clock({ top, remaining }: { top: number; remaining: number }) {
    const ref = useRef<HTMLDivElement>(null);
    useCountdown({
      ref,
      getRemainingMs: () => remaining,
      format: (ms) => `REM:${ms}`,
    });
    return (
      <div
        ref={(el) => {
          ref.current = el;
          if (el)
            el.getBoundingClientRect = () =>
              ({
                top,
                left: 0,
                right: 0,
                bottom: 0,
                width: 0,
                height: 0,
                x: 0,
                y: 0,
                toJSON: () => ({}),
              }) as DOMRect;
        }}
      />
    );
  }

  it("writes the formatted remaining time to an on-screen clock's node", async () => {
    const { container } = render(<Clock top={0} remaining={4_000} />);
    const node = container.querySelector("div")!;
    await waitFor(() => expect(node.textContent).toBe("REM:4000"));
  });

  it("skips the write for an off-screen clock while updating an on-screen sibling", async () => {
    const { container } = render(
      <>
        <Clock top={0} remaining={1_000} />
        <Clock top={5_000} remaining={2_000} />
      </>,
    );
    const [onScreen, offScreen] = [...container.querySelectorAll("div")];

    // Both share the one global tick, so once the on-screen node has been written
    // the off-screen node has been offered the SAME tick — and correctly skipped.
    await waitFor(() => expect(onScreen.textContent).toBe("REM:1000"));
    expect(offScreen.textContent).toBe("");
  });
});
