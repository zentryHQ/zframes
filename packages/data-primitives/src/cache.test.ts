import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache";

describe("TtlCache", () => {
  afterEach(() => {
    vi.useRealTimers();
    // Drop any localStorage shim a persistence test installed.
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("serves a fresh value without re-calling load", async () => {
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000 });
    const load = vi.fn().mockResolvedValue(42);
    expect(await cache.get("k", load)).toBe(42);
    expect(await cache.get("k", load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-loads once the TTL has elapsed", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000 });
    let n = 0;
    const load = vi.fn().mockImplementation(() => Promise.resolve(++n));
    expect(await cache.get("k", load)).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(await cache.get("k", load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent loads for one key onto a single call", async () => {
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000 });
    let resolve!: (v: number) => void;
    const load = vi.fn().mockImplementation(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    const a = cache.get("k", load);
    const b = cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(1);
    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
  });

  it("keys are independent", async () => {
    const cache = new TtlCache<string>({ namespace: "t", ttlMs: 1000 });
    expect(await cache.get("a", () => Promise.resolve("A"))).toBe("A");
    expect(await cache.get("b", () => Promise.resolve("B"))).toBe("B");
  });

  it("serves the last good value when a later load throws (stale-on-error)", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000 });
    expect(await cache.get("k", () => Promise.resolve(1))).toBe(1);
    vi.advanceTimersByTime(1500); // entry is now stale
    expect(await cache.get("k", () => Promise.reject(new Error("boom")))).toBe(
      1,
    );
  });

  it("does not cache a failure: the next call retries", async () => {
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000 });
    await expect(
      cache.get("k", () => Promise.reject(new Error("first"))),
    ).rejects.toThrow("first");
    // No prior good value existed, so the failure isn't served — the retry runs.
    expect(await cache.get("k", () => Promise.resolve(9))).toBe(9);
  });

  it("re-throws when staleOnError is off and load fails", async () => {
    const cache = new TtlCache<number>({
      namespace: "t",
      ttlMs: 1000,
      staleOnError: false,
    });
    expect(await cache.get("k", () => Promise.resolve(1))).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    // Force a stale read by constructing a zero-TTL cache view is overkill; instead
    // assert the off-switch path directly with a fresh, immediately-stale cache.
    const strict = new TtlCache<number>({
      namespace: "t",
      ttlMs: 0,
      staleOnError: false,
    });
    expect(await strict.get("k", () => Promise.resolve(1))).toBe(1);
    await expect(
      strict.get("k", () => Promise.reject(new Error("nope"))),
    ).rejects.toThrow("nope");
  });

  it("persists across instances through localStorage when enabled", async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;

    const first = new TtlCache<{ n: number }>({
      namespace: "zframes:test",
      ttlMs: 60_000,
      persist: true,
    });
    await first.get("k", () => Promise.resolve({ n: 5 }));
    expect(store.has("zframes:test:k")).toBe(true);

    // A fresh instance (simulating a reload) hydrates from localStorage and
    // serves the value without calling load.
    const second = new TtlCache<{ n: number }>({
      namespace: "zframes:test",
      ttlMs: 60_000,
      persist: true,
    });
    const load = vi.fn().mockResolvedValue({ n: 99 });
    expect(await second.get("k", load)).toEqual({ n: 5 });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects a persisted value the revive guard refuses", async () => {
    const store = new Map<string, string>([
      ["zframes:test:k", JSON.stringify({ at: Date.now(), value: "corrupt" })],
    ]);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;

    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:test",
      ttlMs: 60_000,
      persist: true,
      revive: (v) =>
        v && typeof (v as { n?: unknown }).n === "number"
          ? (v as { n: number })
          : null,
    });
    const load = vi.fn().mockResolvedValue({ n: 1 });
    // The stored string fails revive → treated as a miss → load runs.
    expect(await cache.get("k", load)).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
