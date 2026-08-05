import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache";

// What this file pins: the two try/catch GUARDS around TtlCache's opt-in
// localStorage persistence. `cache.test.ts` already covers the mainline (TTL,
// in-flight dedup, stale-on-error, a happy-path persist round-trip, a revive
// rejection); this file covers only what happens when localStorage misbehaves,
// because both guards look like dead code to a cleanup pass and their failure
// modes are asymmetric:
//
//  - `write` runs AFTER a successful `load`. If a quota-exceeded `setItem`, or a
//    value `JSON.stringify` refuses, escaped the catch, the throw would
//    propagate out of `get` — turning a good fetch into an error card on every
//    persisted provider (CoinGecko, Treasury, fx) while the data sits in hand.
//  - `read` runs SYNCHRONOUSLY at the top of `get`, before any promise exists. A
//    corrupt stored entry must read as a cache MISS; if it threw, it would throw
//    at the provider call site, which no frame can render as a rejected promise.
//
// Both paths must also leave the in-memory memo intact, so a storage hiccup
// never costs an extra rate-limited load inside the TTL.

/**
 * Install a controllable `globalThis.localStorage`. `seed` pre-loads raw stored
 * strings (an entry left behind by an older build), and `hooks` can make a call
 * throw the way a real browser does on a quota or security error.
 */
function installStorage(
  seed: Record<string, string> = {},
  hooks: {
    onGetItem?: (key: string) => void;
    onSetItem?: (key: string, raw: string) => void;
  } = {},
) {
  const store = new Map<string, string>(Object.entries(seed));
  const getItem = vi.fn((key: string) => {
    hooks.onGetItem?.(key);
    return store.get(key) ?? null;
  });
  const setItem = vi.fn((key: string, raw: string) => {
    hooks.onSetItem?.(key, raw);
    store.set(key, raw);
  });
  const removeItem = vi.fn((key: string) => void store.delete(key));
  // `length` + `key(i)` are what the size trim enumerates the namespace with. A
  // stub missing them makes the trim a silent no-op (the loop just never runs
  // inside its catch), so the cap would look enforced while nothing was pruned.
  vi.stubGlobal("localStorage", {
    getItem,
    setItem,
    removeItem,
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  } as unknown as Storage);
  return { store, getItem, setItem, removeItem };
}

/**
 * The three ways a stored entry's `at` can be unusable: a serialised date string,
 * a field an older schema never wrote, and an explicit `null`. `read`'s
 * `typeof parsed?.at !== "number"` guard must reject all three as a cache MISS.
 *
 * Why the shapes are exercised as a set: a freshness-only check would ALSO
 * re-load on each of them (`Date.now() - "…"`/`- undefined` is NaN, so
 * `< ttlMs` is false; `Date.now() - null` is absurdly large, so it reads as
 * stale). Miss and stale therefore look identical on a successful load and only
 * diverge when `load` FAILS — a stale entry is served as the stale-on-error
 * fallback, a miss must reject. That is the assertion each shape needs.
 */
const CORRUPT_AT_ENTRIES = [
  { key: "string", at: '"2026-07-25T00:00:00Z"' },
  { key: "missing", at: undefined }, // `at` dropped entirely by an older schema
  { key: "null", at: "null" },
] as const;

/** Seed all three corrupt shapes under `namespace`, one per key. */
function seedCorruptAt(namespace: string): Record<string, string> {
  return Object.fromEntries(
    CORRUPT_AT_ENTRIES.map(({ key, at }, i) => [
      `${namespace}:${key}`,
      at === undefined
        ? `{"value":{"n":${i + 1}}}`
        : `{"at":${at},"value":{"n":${i + 1}}}`,
    ]),
  );
}

describe("TtlCache — write-side persist guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the loaded value when setItem throws (quota exceeded)", async () => {
    const fake = installStorage(
      {},
      {
        onSetItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    );
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:quota",
      ttlMs: 60_000,
      persist: true,
    });

    // The load succeeded, so `get` must resolve — the persist attempt is
    // best-effort and its failure is invisible to the caller.
    await expect(
      cache.get("k", () => Promise.resolve({ n: 5 })),
    ).resolves.toEqual({ n: 5 });
    // It really did try to persist the freshly loaded entry — the throw came
    // from the write attempt, not from skipping it. (No `store.size` assertion
    // here: the mock throws before `store.set`, so an empty store is the mock's
    // own doing and could never fail. That nothing landed is proven by the
    // next test's fresh instance finding nothing to hydrate.)
    expect(fake.setItem).toHaveBeenCalledTimes(1);
    expect(fake.setItem.mock.calls[0][0]).toBe("zframes:quota:k");
    expect(fake.setItem.mock.calls[0][1]).toContain('"value":{"n":5}');
  });

  it("keeps serving from memory after a failed write (no extra load in the TTL)", async () => {
    installStorage(
      {},
      {
        onSetItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    );
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:quota",
      ttlMs: 60_000,
      persist: true,
    });
    const load = vi.fn().mockResolvedValue({ n: 5 });

    expect(await cache.get("k", load)).toEqual({ n: 5 });
    expect(await cache.get("k", load)).toEqual({ n: 5 });
    expect(load).toHaveBeenCalledTimes(1);

    // Only the in-memory memo survived: a fresh instance (a reload) has nothing
    // to hydrate from, so the failure is session-scoped, not cached as a miss.
    const reloaded = new TtlCache<{ n: number }>({
      namespace: "zframes:quota",
      ttlMs: 60_000,
      persist: true,
    });
    const afterReload = vi.fn().mockResolvedValue({ n: 6 });
    expect(await reloaded.get("k", afterReload)).toEqual({ n: 6 });
    expect(afterReload).toHaveBeenCalledTimes(1);
  });

  it("resolves when the value cannot be serialised (JSON.stringify throws)", async () => {
    const fake = installStorage();
    type Circular = { n: number; self?: Circular };
    const value: Circular = { n: 1 };
    value.self = value; // JSON.stringify → TypeError, before setItem is reached
    const cache = new TtlCache<Circular>({
      namespace: "zframes:circular",
      ttlMs: 60_000,
      persist: true,
    });
    const load = vi.fn().mockResolvedValue(value);

    expect(await cache.get("k", load)).toBe(value);
    // `JSON.stringify` is inside the try, so it threw before `setItem` — which
    // also means nothing could have landed in the store (no separate
    // `store.size` assertion: it would only restate this one).
    expect(fake.setItem).not.toHaveBeenCalled();
    // Memo still holds the exact object, so the next get inside the TTL is free.
    expect(await cache.get("k", load)).toBe(value);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("persists a Map lossily as {} instead of throwing — why values must be JSON-safe", async () => {
    const fake = installStorage();
    const options = {
      namespace: "zframes:map",
      ttlMs: 60_000,
      persist: true,
    } as const;
    const map = new Map([["a", 1]]);
    const first = new TtlCache<Map<string, number>>(options);
    expect(await first.get("k", () => Promise.resolve(map))).toBe(map);
    // JSON.stringify does not throw on a Map — it writes an empty object.
    expect(fake.store.get("zframes:map:k")).toContain('"value":{}');

    // Documented caveat (not a bug — the docblock requires JSON-serialisable
    // values and offers `revive` as the guard): a reload rehydrates the lossy
    // `{}` as a cache HIT, so a Map-valued cache silently loses its contents.
    const reloaded = new TtlCache<Map<string, number>>(options);
    const load = vi.fn().mockResolvedValue(map);
    const rehydrated = await reloaded.get("k", load);
    expect(rehydrated instanceof Map).toBe(false);
    expect(rehydrated).toEqual({});
    expect(load).not.toHaveBeenCalled();
  });
});

describe("TtlCache — read-side persist guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an unparseable stored entry as a miss, without throwing synchronously", async () => {
    const fake = installStorage({ "zframes:corrupt:k": '{"at":123,"value"' });
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:corrupt",
      ttlMs: 60_000,
      persist: true,
    });
    const load = vi.fn().mockResolvedValue({ n: 7 });

    // `read` runs synchronously inside `get`: a regression throws HERE, at the
    // provider call site, rather than rejecting a promise a frame could render.
    let pending!: Promise<{ n: number }>;
    expect(() => {
      pending = cache.get("k", load);
    }).not.toThrow();
    expect(await pending).toEqual({ n: 7 });
    expect(load).toHaveBeenCalledTimes(1);

    // The fresh load replaced the corrupt string rather than leaving it to fail
    // again on the next reload.
    const stored = JSON.parse(fake.store.get("zframes:corrupt:k") as string);
    expect(stored.value).toEqual({ n: 7 });
    expect(typeof stored.at).toBe("number");

    // And the memo now answers, so localStorage is not re-read inside the TTL.
    expect(await cache.get("k", load)).toEqual({ n: 7 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(fake.getItem).toHaveBeenCalledTimes(1);
  });

  it("re-loads over a stored entry whose `at` is not a number, healing the raw", async () => {
    const fake = installStorage(seedCorruptAt("zframes:at"));
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:at",
      ttlMs: 60_000,
      persist: true,
    });

    // An unusable timestamp cannot be freshness-checked, so the stored value is
    // never served — each key loads instead of answering 1 / 2 / 3, and the
    // fresh write replaces the raw with a numeric `at` so the entry heals rather
    // than being re-rejected on every future reload. (This pins the write half
    // only; whether the read was a MISS or a trusted-but-stale entry is settled
    // by the next test, since both re-load.)
    for (const { key } of CORRUPT_AT_ENTRIES) {
      const load = vi.fn().mockResolvedValue({ n: 99 });
      expect(await cache.get(key, load)).toEqual({ n: 99 });
      expect(load).toHaveBeenCalledTimes(1);
      const stored = JSON.parse(fake.store.get(`zframes:at:${key}`) as string);
      expect(typeof stored.at).toBe("number");
      expect(stored.value).toEqual({ n: 99 });
    }
  });

  it("never resurrects an `at`-rejected stored entry as the stale-on-error fallback", async () => {
    installStorage(seedCorruptAt("zframes:stale"));
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:stale",
      ttlMs: 60_000,
      persist: true,
    });

    // `read` returned null for every shape, so `get` captured no last-good
    // entry: a failing load must reject instead of serving the untrusted body.
    // This is the half of the `at` guard a NaN/huge freshness comparison would
    // silently paper over — without it the corrupt entry is handed out forever,
    // on every failed poll, having never passed a freshness check. Distinct
    // messages per shape prove it is that shape's own load that rejected.
    for (const { key } of CORRUPT_AT_ENTRIES) {
      await expect(
        cache.get(key, () => Promise.reject(new Error(`boom:${key}`))),
      ).rejects.toThrow(`boom:${key}`);
    }
  });

  it("treats a non-object stored body (null, a scalar) as a miss", async () => {
    installStorage({
      "zframes:scalar:nothing": "null",
      "zframes:scalar:number": "42",
    });
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:scalar",
      ttlMs: 60_000,
      persist: true,
    });

    // `parsed?.at` on a `null` body reads as a miss without raising; dropping the
    // optional chain would raise a TypeError that `read`'s own catch converts
    // into the same miss, so what a caller can observe — never a throw out of
    // `get`, never a served body — is what these assert.
    for (const key of ["nothing", "number"]) {
      // A MISS, not a trusted-but-stale entry: with no last-good value captured,
      // a failing load rejects. Asserted because both readings re-load, so the
      // resolving case below cannot tell them apart — and for `"42"` a
      // stale-fallback path would hand a frame `parsed.value`, i.e. `undefined`.
      await expect(
        cache.get(key, () => Promise.reject(new Error(`boom:${key}`))),
      ).rejects.toThrow(`boom:${key}`);

      const load = vi.fn().mockResolvedValue({ n: 4 });
      let pending!: Promise<{ n: number }>;
      expect(() => {
        pending = cache.get(key, load);
      }).not.toThrow();
      expect(await pending).toEqual({ n: 4 });
      expect(load).toHaveBeenCalledTimes(1);
    }
  });

  it("treats a throwing localStorage.getItem as a miss (storage disabled)", async () => {
    const fake = installStorage(
      {},
      {
        onGetItem: () => {
          throw new Error("SecurityError: storage is disabled");
        },
      },
    );
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:blocked",
      ttlMs: 60_000,
      persist: true,
    });
    const load = vi.fn().mockResolvedValue({ n: 3 });

    let pending!: Promise<{ n: number }>;
    expect(() => {
      pending = cache.get("k", load);
    }).not.toThrow();
    expect(await pending).toEqual({ n: 3 });
    expect(fake.getItem).toHaveBeenCalledTimes(1);

    // The write half of the same storage still works, and the memo answers the
    // second get — one load total despite the unreadable store.
    expect(fake.store.get("zframes:blocked:k")).toContain('"value":{"n":3}');
    expect(await cache.get("k", load)).toEqual({ n: 3 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("treats a throwing revive as a miss rather than propagating it", async () => {
    installStorage({
      "zframes:revive:k": JSON.stringify({ at: Date.now(), value: { n: 1 } }),
    });
    const revive = vi.fn(() => {
      // A caller-supplied guard written against a newer shape can throw on an
      // entry from an older build; that must not escape `read`.
      throw new Error("unexpected shape");
    });
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:revive",
      ttlMs: 60_000,
      persist: true,
      revive,
    });
    const load = vi.fn().mockResolvedValue({ n: 8 });

    let pending!: Promise<{ n: number }>;
    expect(() => {
      pending = cache.get("k", load);
    }).not.toThrow();
    expect(await pending).toEqual({ n: 8 });
    expect(revive).toHaveBeenCalledWith({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("skips localStorage entirely in Node, where persist is a no-op", async () => {
    // No storage installed: `typeof localStorage === "undefined"` short-circuits
    // both read and write, so a persisted provider still works under the CLI.
    expect(typeof globalThis.localStorage).toBe("undefined");
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:node",
      ttlMs: 60_000,
      persist: true,
    });
    const load = vi.fn().mockResolvedValue({ n: 2 });

    expect(await cache.get("k", load)).toEqual({ n: 2 });
    expect(await cache.get("k", load)).toEqual({ n: 2 });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

// The unbounded-growth guard. Several providers key on a value that DRIFTS: a
// candle/funding key embeds the caller's `startTimeMs`, which frames compute as
// `Date.now() - window` once per mount — so the same chart mints a fresh key on
// every reload. Without a cap that is a leak in two places at once: the memo Map
// grows for the life of the tab, and (with persist on) localStorage grows across
// reloads until the ~5 MB origin quota, at which point `setItem` throws and the
// write guard above swallows it — persistence stops working with no symptom.
describe("TtlCache — bounded key count", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Write `count` drifting keys, the way successive mounts of one chart would. */
  async function writeDrifting(cache: TtlCache<{ n: number }>, count: number) {
    for (let i = 0; i < count; i += 1)
      await cache.get(`BTC|1h|${1_700_000_000_000 + i}`, async () => ({
        n: i,
      }));
  }

  it("evicts the oldest memo entries past maxEntries", async () => {
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:memo",
      ttlMs: 60_000,
      maxEntries: 3,
    });
    await writeDrifting(cache, 5);

    // The two oldest keys are gone, so they re-load; the newest three are served
    // from the memo without one.
    const reload = vi.fn().mockResolvedValue({ n: 99 });
    expect(await cache.get("BTC|1h|1700000000000", reload)).toEqual({ n: 99 });
    const fresh = vi.fn().mockResolvedValue({ n: 99 });
    expect(await cache.get("BTC|1h|1700000000004", fresh)).toEqual({ n: 4 });
    expect(fresh).not.toHaveBeenCalled();
  });

  it("trims this namespace's localStorage entries to the cap, oldest first", async () => {
    const { store } = installStorage();
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:hyperliquid:candles",
      ttlMs: 60_000,
      persist: true,
      maxEntries: 3,
    });
    await writeDrifting(cache, 6);

    const mine = [...store.keys()].filter((k) =>
      k.startsWith("zframes:hyperliquid:candles:"),
    );
    expect(mine).toHaveLength(3);
    // Newest three survive (each write stamps a later `at` than the last).
    expect(mine.map((k) => k.split("|")[2]).sort()).toEqual([
      "1700000000003",
      "1700000000004",
      "1700000000005",
    ]);
  });

  it("prunes entries left by an earlier page load, not just this session's", async () => {
    // The accumulation this guard exists to stop is cross-reload: a fresh cache
    // starts with an empty memo, so pruning driven off the memo alone would never
    // touch the pile a previous session left behind.
    const seed = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `zframes:stale:BTC|1h|${i}`,
        JSON.stringify({ at: 1_600_000_000_000 + i, value: { n: i } }),
      ]),
    );
    const { store } = installStorage(seed);
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:stale",
      ttlMs: 60_000,
      persist: true,
      maxEntries: 3,
    });

    await cache.get("BTC|1h|new", async () => ({ n: 100 }));

    const mine = [...store.keys()].filter((k) =>
      k.startsWith("zframes:stale:"),
    );
    expect(mine).toHaveLength(3);
    expect(mine).toContain("zframes:stale:BTC|1h|new");
  });

  it("never evicts another namespace's entries", async () => {
    const { store } = installStorage({
      "zframes:other:keep": JSON.stringify({ at: 1, value: { n: 0 } }),
    });
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:mine",
      ttlMs: 60_000,
      persist: true,
      maxEntries: 2,
    });
    await writeDrifting(cache, 5);

    expect(store.has("zframes:other:keep")).toBe(true);
  });

  it("leaves a bounded cache's keys alone (the common case)", async () => {
    const { store, removeItem } = installStorage();
    const cache = new TtlCache<{ n: number }>({
      namespace: "zframes:bounded",
      ttlMs: 60_000,
      persist: true,
    });
    // A handful of real argument variants, well under the default cap.
    for (const key of ["BTC", "ETH", "SOL"])
      await cache.get(key, async () => ({ n: 1 }));

    expect(store.size).toBe(3);
    expect(removeItem).not.toHaveBeenCalled();
  });
});
