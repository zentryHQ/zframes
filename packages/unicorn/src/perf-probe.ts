// Measured performance tier: the sixth low-end signal, for hardware the
// capability signals can't see (Safari/Firefox never report deviceMemory; an
// old Intel i7 reports 8+ logical cores; an old iPad is wider than 768px).
// One short rAF-delta probe per page load, run after `load` while the page's
// real workload (engine boot, landing hydration) is in flight; the verdict is
// persisted so later visits downgrade synchronously, before a scene mounts.
//
// Deliberate asymmetry: once a device is lite, it renders the light page, so
// a re-probe would measure the light workload and pass. The 14-day TTL is the
// re-entry path (browser/OS upgrades); its cost is one heavy first second per
// fortnight on a genuinely weak device.

export const PROBE_STORAGE_KEY = "zf-perf-tier";
export const PROBE_SETTLE_MS = 1000;
export const PROBE_SAMPLES = 40;
export const PROBE_LITE_MEDIAN_MS = 28;
export const PROBE_VERDICT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredVerdict {
  v: 1;
  lite: boolean;
  at: number;
}

let verdict: boolean | null = null;
let loadedFromStorage = false;
let probeArmed = false;
const listeners = new Set<() => void>();

function readStorage(): void {
  if (loadedFromStorage) return;
  loadedFromStorage = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PROBE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StoredVerdict> | null;
    if (
      !parsed ||
      parsed.v !== 1 ||
      typeof parsed.lite !== "boolean" ||
      typeof parsed.at !== "number"
    )
      return;
    if (Date.now() - parsed.at > PROBE_VERDICT_TTL_MS) return;
    verdict = parsed.lite;
  } catch {
    // Storage unavailable (private mode): probe every session instead.
  }
}

function persist(lite: boolean): void {
  try {
    window.localStorage.setItem(
      PROBE_STORAGE_KEY,
      JSON.stringify({ v: 1, lite, at: Date.now() } satisfies StoredVerdict),
    );
  } catch {
    // Best-effort only.
  }
}

function settle(lite: boolean): void {
  persist(lite);
  verdict = lite;
  // Only a lite verdict can change useLowEndDevice's answer mid-session
  // (unknown and false both snapshot to false).
  if (lite) for (const cb of listeners) cb();
}

function runProbe(): void {
  let last = -1;
  let raf = 0;
  const deltas: number[] = [];
  const onHidden = () => {
    if (document.hidden) cancel();
  };
  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener("visibilitychange", onHidden);
  };
  const frame = (now: number) => {
    raf = 0;
    if (last >= 0) deltas.push(now - last);
    last = now;
    if (deltas.length >= PROBE_SAMPLES) {
      cancel();
      const sorted = [...deltas].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      settle(median >= PROBE_LITE_MEDIAN_MS);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  document.addEventListener("visibilitychange", onHidden);
  raf = requestAnimationFrame(frame);
}

function armProbe(): void {
  if (probeArmed) return;
  probeArmed = true;
  if (typeof window === "undefined") return;
  readStorage();
  if (verdict !== null) return; // fresh persisted verdict, no probe needed
  const start = () => {
    if (document.hidden) {
      const onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", onVisible);
        setTimeout(runProbe, PROBE_SETTLE_MS);
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
    setTimeout(runProbe, PROBE_SETTLE_MS);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/** Persisted/measured lite-tier verdict; false while unknown or probing. */
export function perfLite(): boolean {
  readStorage();
  return verdict === true;
}

/** Subscribe to probe completion; arms the probe on the first subscriber. */
export function subscribePerfProbe(onChange: () => void): () => void {
  armProbe();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
