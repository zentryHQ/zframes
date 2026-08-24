// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The measured lite-tier probe: one rAF-delta sample per page load, verdict
// persisted for a fortnight. Everything here is invisible in review and
// decides whether a weak device gets the light page, so the mechanics are
// pinned: the probe waits for `load` plus a settle, judges on the MEDIAN
// delta (a couple of GC spikes on a healthy machine must not false-positive),
// persists both verdicts but notifies only on lite, never measures a hidden
// tab (background rAF throttling is browser policy, not hardware), and
// treats a throwing localStorage (private mode) as "probe every session",
// never as an error.
//
// The module holds state (`verdict`, `probeArmed`), so every test takes a
// fresh copy via `vi.resetModules()` + dynamic import. `requestAnimationFrame`
// is stubbed with a manual queue so each test drives frame timestamps
// explicitly, and the settle timer runs on fake timers.

type ProbeModule = typeof import("./perf-probe");

/** A manual rAF queue: the test fires frames with explicit timestamps. */
function installRaf() {
  const pending = new Map<number, FrameRequestCallback>();
  let seq = 0;
  let total = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      seq += 1;
      total += 1;
      pending.set(seq, cb);
      return seq;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      pending.delete(id);
    }),
  );
  return {
    get pendingCount() {
      return pending.size;
    },
    get totalScheduled() {
      return total;
    },
    fire(now: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(now);
    },
  };
}

let raf: ReturnType<typeof installRaf>;

/** jsdom's `document.hidden` is a read-only getter — redefine, don't assign. */
function setVisibility(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

/** Pin `readyState` to "loading" so arming always goes through the `load` path. */
function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => state,
  });
}

/** A fresh module → fresh `verdict` / `probeArmed` / listener set. */
async function loadProbe(): Promise<ProbeModule> {
  vi.resetModules();
  return import("./perf-probe");
}

/** Subscribe (arms the probe), fire window `load`, run out the settle timer. */
function armThroughSettle(mod: ProbeModule, listener: () => void) {
  const unsubscribe = mod.subscribePerfProbe(listener);
  window.dispatchEvent(new Event("load"));
  vi.advanceTimersByTime(mod.PROBE_SETTLE_MS);
  return unsubscribe;
}

/** One anchor frame (no delta yet), then one frame per delta. */
function driveFrames(deltas: readonly number[]) {
  let now = 100_000;
  raf.fire(now);
  for (const d of deltas) {
    now += d;
    raf.fire(now);
  }
}

const frames = (count: number, delta: number): number[] =>
  Array.from({ length: count }, () => delta);

beforeEach(() => {
  vi.useFakeTimers();
  raf = installRaf();
  setVisibility(false);
  setReadyState("loading");
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  setVisibility(false);
});

describe("probing", () => {
  it("arms on first subscribe, waits for load + settle, and persists a lite verdict", async () => {
    const mod = await loadProbe();
    const listener = vi.fn();
    expect(mod.perfLite()).toBe(false); // unknown answers false, never blocks

    mod.subscribePerfProbe(listener);
    // Nothing samples before the page has loaded AND settled: the probe
    // exists to measure the real post-load workload, not the loading screen.
    expect(raf.totalScheduled).toBe(0);
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(mod.PROBE_SETTLE_MS - 1);
    expect(raf.totalScheduled).toBe(0);
    vi.advanceTimersByTime(1);
    expect(raf.totalScheduled).toBe(1);

    // 40 consecutive frames at 33ms: below ~36fps, so the verdict is lite.
    driveFrames(frames(mod.PROBE_SAMPLES, 33));
    expect(mod.perfLite()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const raw = window.localStorage.getItem(mod.PROBE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw as string) as Record<string, unknown>;
    expect(stored).toMatchObject({ v: 1, lite: true });
    expect(typeof stored.at).toBe("number");
  });

  it("persists a non-lite verdict at 16ms frames and does NOT notify", async () => {
    const mod = await loadProbe();
    const listener = vi.fn();
    armThroughSettle(mod, listener);

    driveFrames(frames(mod.PROBE_SAMPLES, 16));
    expect(mod.perfLite()).toBe(false);
    // Unknown and false both snapshot to false, so a pass changes nothing
    // mid-session and nobody needs to hear about it.
    expect(listener).not.toHaveBeenCalled();
    const stored = JSON.parse(
      window.localStorage.getItem(mod.PROBE_STORAGE_KEY) as string,
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({ v: 1, lite: false });
  });

  it("decides on the MEDIAN delta, so a minority of slow frames cannot tip it", async () => {
    // 21 of 40 slow: the median sample is a slow one, verdict lite.
    const first = await loadProbe();
    expect(first.PROBE_SAMPLES).toBe(40); // the 21/19 splits below assume it
    armThroughSettle(first, vi.fn());
    driveFrames([...frames(21, 30), ...frames(19, 16)]);
    expect(first.perfLite()).toBe(true);

    // 19 of 40 slow: the median sample is a fast one, verdict stays full.
    window.localStorage.clear();
    const second = await loadProbe();
    armThroughSettle(second, vi.fn());
    driveFrames([...frames(19, 30), ...frames(21, 16)]);
    expect(second.perfLite()).toBe(false);
  });

  it("aborts without persisting when the document goes hidden mid-probe", async () => {
    const mod = await loadProbe();
    const listener = vi.fn();
    armThroughSettle(mod, listener);

    // A few healthy samples land, then the tab goes hidden.
    driveFrames(frames(3, 16));
    expect(raf.pendingCount).toBe(1);
    setVisibility(true);
    document.dispatchEvent(new Event("visibilitychange"));
    // The in-flight frame was cancelled, and coming back does not resume:
    // this page load's probe is spent, a hidden-tab measurement would have
    // judged browser throttling policy instead of the hardware.
    expect(raf.pendingCount).toBe(0);
    setVisibility(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(10_000);
    expect(raf.pendingCount).toBe(0);
    expect(window.localStorage.getItem(mod.PROBE_STORAGE_KEY)).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(mod.perfLite()).toBe(false);
  });
});

describe("persisted verdicts", () => {
  it("answers true immediately from a fresh stored lite verdict, scheduling no rAF", async () => {
    window.localStorage.setItem(
      "zf-perf-tier",
      JSON.stringify({ v: 1, lite: true, at: Date.now() }),
    );
    const mod = await loadProbe();
    expect(mod.PROBE_STORAGE_KEY).toBe("zf-perf-tier");
    expect(mod.perfLite()).toBe(true);

    // The whole point of persisting: the next visit downgrades synchronously,
    // before any scene mounts, and never pays for a probe.
    mod.subscribePerfProbe(vi.fn());
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(mod.PROBE_SETTLE_MS * 2);
    expect(raf.totalScheduled).toBe(0);
  });

  it("ignores a stored verdict older than the TTL and re-probes", async () => {
    const ttlMs = 14 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      "zf-perf-tier",
      JSON.stringify({ v: 1, lite: true, at: Date.now() - ttlMs - 1 }),
    );
    const mod = await loadProbe();
    expect(mod.PROBE_VERDICT_TTL_MS).toBe(ttlMs);
    // Stale is the re-entry path (browser/OS upgrades since the verdict).
    expect(mod.perfLite()).toBe(false);

    armThroughSettle(mod, vi.fn());
    expect(raf.totalScheduled).toBe(1);
    driveFrames(frames(mod.PROBE_SAMPLES, 16));
    const stored = JSON.parse(
      window.localStorage.getItem(mod.PROBE_STORAGE_KEY) as string,
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({ v: 1, lite: false });
  });

  it("treats a throwing localStorage as probe-every-session, never as an error", async () => {
    // Safari private mode: reads and writes both throw.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    const mod = await loadProbe();
    const listener = vi.fn();
    // The throwing read answers false and the probe still arms.
    expect(mod.perfLite()).toBe(false);
    armThroughSettle(mod, listener);
    expect(raf.totalScheduled).toBe(1);

    // The throwing write is swallowed: the in-memory verdict still settles
    // and notifies, so THIS session downgrades even though nothing persists.
    driveFrames(frames(mod.PROBE_SAMPLES, 33));
    expect(setItem).toHaveBeenCalled();
    expect(mod.perfLite()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
