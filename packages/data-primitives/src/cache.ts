/**
 * Shared cache primitive for market-data providers. Every provider reads a free,
 * rate-limited public API, so each one wants the same freshness / de-duplication /
 * stale-on-error behaviour — which they used to hand-roll five slightly different
 * ways (value vs promise caching, with/without in-flight dedup, persist, or
 * stale fallback). This centralises that one concern so every source behaves
 * identically and a fix lands once.
 *
 * One {@link TtlCache} instance backs one logical data source. A `key`
 * distinguishes argument variants of that source (a BLS series id, a SEC CIK, a
 * Treasury page size); a source with a single value just uses a constant key.
 *
 * Behaviour, all in one place:
 *  - **Freshness (`ttlMs`):** a value younger than `ttlMs` is served without
 *    calling `load` — saving a rate-limit token on editor reloads and on extra
 *    frames that want the same data. Keep `ttlMs` a little under the hook's poll
 *    interval so scheduled background polls still refresh.
 *  - **In-flight dedup:** concurrent `get`s for one key share a single `load`,
 *    so N frames on the same symbol (and React StrictMode's double-invoke) make
 *    one request, not N.
 *  - **Stale-on-error (default on):** when `load` throws, the last good value is
 *    served (even past its TTL) instead of surfacing an error — a few-minutes-old
 *    number beats a blank card. Its timestamp is left stale so the next call
 *    retries; failures are never written, so a failure is never cached.
 *  - **Persistence (opt-in `persist`):** resolved values round-trip through
 *    localStorage so a cold reload shows the last value immediately. Browser-only
 *    and best-effort: a no-op in Node/CLI (the in-memory memo suffices) and
 *    silently skipped on quota / serialisation errors. Persisted values must be
 *    JSON-serialisable (e.g. plain objects, not `Map`s).
 *
 * React-free on purpose (deep export `@zframes/data-primitives/cache`) so providers use it
 * without pulling React into their bundle, exactly like `@zframes/data-primitives/fetch`.
 */
export interface TtlCacheOptions<T> {
  /** Prefix for localStorage keys, and a stable label, e.g. "zframes:coingecko". */
  namespace: string;
  /** Freshness window in ms: a value younger than this is served without re-fetching. */
  ttlMs: number;
  /** Round-trip resolved values through localStorage (browser-only, opt-in). Values must be JSON-serialisable. */
  persist?: boolean;
  /** Serve the last good value past its TTL when `load` throws (default true). */
  staleOnError?: boolean;
  /**
   * Validate a value rehydrated from localStorage before trusting it; return
   * null to reject a corrupt or schema-changed entry. Only used on the persist path.
   */
  revive?: (value: unknown) => T | null;
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly namespace: string;
  private readonly ttlMs: number;
  private readonly persist: boolean;
  private readonly staleOnError: boolean;
  private readonly revive?: (value: unknown) => T | null;

  constructor(options: TtlCacheOptions<T>) {
    this.namespace = options.namespace;
    this.ttlMs = options.ttlMs;
    this.persist = options.persist ?? false;
    this.staleOnError = options.staleOnError ?? true;
    this.revive = options.revive;
  }

  /**
   * Resolve the value for `key`, calling `load` only on a miss or a stale entry.
   * Serves a fresh cached value with no network call, coalesces concurrent loads
   * onto one promise, and (by default) serves the last good value if `load` throws.
   */
  get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.read(key);
    if (entry && Date.now() - entry.at < this.ttlMs)
      return Promise.resolve(entry.value);

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = load()
      .then((value) => {
        this.write(key, value);
        return value;
      })
      .catch((error: unknown) => {
        // Last-good value beats an error card; leave its timestamp stale so the
        // next call retries. `write` only runs on success, so we never cache a failure.
        if (this.staleOnError && entry) return entry.value;
        throw error;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }

  /** Hydrate from memo, falling back to localStorage on a cold (persisted) read. */
  private read(key: string): CacheEntry<T> | null {
    const memo = this.entries.get(key);
    if (memo) return memo;
    if (!this.persist || typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(this.storageKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry<unknown>;
      if (typeof parsed?.at !== "number") return null;
      let value: T;
      if (this.revive) {
        const revived = this.revive(parsed.value);
        if (revived === null) return null;
        value = revived;
      } else {
        value = parsed.value as T;
      }
      const entry: CacheEntry<T> = { at: parsed.at, value };
      this.entries.set(key, entry);
      return entry;
    } catch {
      return null; // corrupt / inaccessible → treat as a miss
    }
  }

  private write(key: string, value: T): void {
    const entry: CacheEntry<T> = { at: Date.now(), value };
    this.entries.set(key, entry);
    if (!this.persist || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(this.storageKey(key), JSON.stringify(entry));
    } catch {
      // ignore quota / serialisation errors — the in-memory memo still helps this session
    }
  }

  private storageKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}
