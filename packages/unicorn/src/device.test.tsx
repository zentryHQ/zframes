// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { useLowEndDevice, useReducedMotion } from "./device";

// The two device / preference gates every zframes host consults before spending
// GPU + bandwidth on the full-screen WebGL backdrop. Both are easy to get
// subtly wrong and impossible to spot in review, because a wrong answer is
// never an error — it is either a missing signature look or a silently taxed
// phone. What this file pins:
//
//  1. **Default-to-high-end.** `deviceMemory` and `hardwareConcurrency` are
//     Chromium-only, so the source defaults each MISSING value to 8 — Firefox
//     and Safari never downgrade on hardware alone. Turning `?? 8` into `?? 0`
//     (or `<=` into `<`) is a one-character change that strips the backdrop
//     from two whole browsers, and the opposite slip ships a WebGL scene to the
//     weak phones the gate exists to spare. The no-signal case AND both sides
//     of the `<= 4` boundary are asserted.
//  2. **Every signal flips it independently** — Save-Data, prefers-reduced-data,
//     weak memory, few cores, and a small COARSE-pointer screen (a phone, not
//     an iPad: hence the `and (max-width: 768px)` half of that query, which is
//     pinned as an exact string).
//  3. **It stays reactive and lets go on unmount.** Reduced-data / reduced-
//     motion can flip mid-session, so a `change` event must re-read the
//     snapshot; the listener removed must be the exact one added, or a
//     long-lived host leaks one per mount.
//  4. **The server snapshot is false**, so an SSR host (the Next.js explorer)
//     never pre-renders the downgraded state and then hydrates into the
//     opposite.
//
// `device.ts` holds no module-level state (only its three query constants), so
// every test shares one import; what does need resetting is the globals it
// reads. jsdom defines a REAL `navigator.hardwareConcurrency` — the host
// machine's core count, so 12 here and possibly 4 on a CI runner — so each case
// shadows the capability signals with own properties rather than trusting the
// environment, or the same test would answer differently per machine.
// `matchMedia` is stubbed with working add/removeEventListener so subscriptions
// are observable. Nothing here touches the network or a real media query.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const REDUCED_DATA = "(prefers-reduced-data: reduce)";
const SMALL_TOUCH = "(pointer: coarse) and (max-width: 768px)";

type ChangeListener = () => void;
type ListenerMock = Mock<(type: string, fn: ChangeListener) => void>;

interface FakeQueryList {
  media: string;
  matches: boolean;
  listeners: Set<ChangeListener>;
  addEventListener: ListenerMock;
  removeEventListener: ListenerMock;
}

/**
 * A `matchMedia` stub with real listener bookkeeping, plus `set()` to flip a
 * query and notify its listeners the way a browser MediaQueryList would.
 */
function installMatchMedia(matching: readonly string[] = []) {
  const lists = new Map<string, FakeQueryList>();
  const listFor = (media: string): FakeQueryList => {
    const existing = lists.get(media);
    if (existing) return existing;
    const listeners = new Set<ChangeListener>();
    const list: FakeQueryList = {
      media,
      matches: matching.includes(media),
      listeners,
      addEventListener: vi.fn((type: string, fn: ChangeListener) => {
        if (type === "change") listeners.add(fn);
      }),
      removeEventListener: vi.fn((type: string, fn: ChangeListener) => {
        if (type === "change") listeners.delete(fn);
      }),
    };
    lists.set(media, list);
    return list;
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => listFor(media) as unknown as MediaQueryList),
  );
  return {
    lists,
    listFor,
    set(media: string, matches: boolean) {
      const list = listFor(media);
      list.matches = matches;
      for (const fn of [...list.listeners]) fn();
    },
  };
}

interface CapabilitySignals {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

const SIGNAL_KEYS = [
  "deviceMemory",
  "hardwareConcurrency",
  "connection",
] as const;

/** Shadow all three capability signals — an omitted one becomes `undefined`. */
function setSignals(signals: CapabilitySignals) {
  for (const key of SIGNAL_KEYS)
    Object.defineProperty(navigator, key, {
      value: signals[key],
      configurable: true,
      writable: true,
    });
}

function clearSignals() {
  for (const key of SIGNAL_KEYS)
    delete (navigator as unknown as Record<string, unknown>)[key];
}

function signalsOf(): CapabilitySignals {
  return navigator as unknown as CapabilitySignals;
}

function LowEndProbe() {
  const lowEnd = useLowEndDevice();
  return <span>{String(lowEnd)}</span>;
}

function ReducedMotionProbe() {
  const reduced = useReducedMotion();
  return <span>{String(reduced)}</span>;
}

/** A capable desktop: both hardware signals present and comfortably high. */
const CAPABLE: CapabilitySignals = { deviceMemory: 8, hardwareConcurrency: 8 };

/** Render the low-end probe under one device profile; returns its text. */
function lowEndUnder(
  signals: CapabilitySignals,
  matching: readonly string[] = [],
): string {
  installMatchMedia(matching);
  setSignals(signals);
  return render(<LowEndProbe />).container.textContent ?? "";
}

// `react-dom` ships no type declarations and `@types/react-dom` is not a
// dependency of @zframes/unicorn (adding one is a package.json edit this file
// has no business making), so the server renderer is reached through a variable
// specifier and cast: real at runtime, quiet at typecheck.
const SERVER_ENTRY = "react-dom/server";

async function serverRender(node: ReactNode): Promise<string> {
  const { renderToString } = (await import(SERVER_ENTRY)) as {
    renderToString: (node: ReactNode) => string;
  };
  return renderToString(node);
}

afterEach(() => {
  cleanup();
  clearSignals();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useLowEndDevice — defaults to high-end", () => {
  it("returns false when NO signal is present (the Firefox/Safari case)", () => {
    const mm = installMatchMedia();
    setSignals({});

    // The shadowing must actually hold, or jsdom's own core count would be
    // answering these tests instead of the hook's `?? 8` defaults.
    expect(signalsOf().deviceMemory).toBeUndefined();
    expect(signalsOf().hardwareConcurrency).toBeUndefined();

    const { container } = render(<LowEndProbe />);
    expect(container.textContent).toBe("false");

    // Exactly the two queries the gate documents were consulted — including the
    // `and (max-width: 768px)` half that keeps an iPad's coarse pointer from
    // counting as a phone — and reduced-MOTION is not one of them.
    expect(new Set(mm.lists.keys())).toEqual(
      new Set([REDUCED_DATA, SMALL_TOUCH]),
    );
    expect(mm.lists.has(REDUCED_MOTION)).toBe(false);
  });

  it("keeps the scene on a capable machine (8 GB / 8 cores)", () => {
    expect(lowEndUnder(CAPABLE)).toBe("false");
  });

  it("trips at 4 GB of memory but not at 5 (the `<= 4` boundary)", () => {
    expect(lowEndUnder({ ...CAPABLE, deviceMemory: 2 })).toBe("true");
    expect(lowEndUnder({ ...CAPABLE, deviceMemory: 4 })).toBe("true");
    expect(lowEndUnder({ ...CAPABLE, deviceMemory: 5 })).toBe("false");
    expect(lowEndUnder({ ...CAPABLE, deviceMemory: 16 })).toBe("false");
  });

  it("trips at 4 logical cores but not at 5 (the `<= 4` boundary)", () => {
    expect(lowEndUnder({ ...CAPABLE, hardwareConcurrency: 2 })).toBe("true");
    expect(lowEndUnder({ ...CAPABLE, hardwareConcurrency: 4 })).toBe("true");
    expect(lowEndUnder({ ...CAPABLE, hardwareConcurrency: 5 })).toBe("false");
    expect(lowEndUnder({ ...CAPABLE, hardwareConcurrency: 16 })).toBe("false");
  });

  it("still defaults to high-end when only ONE hardware signal is missing", () => {
    // Chromium reports both; a browser reporting just cores must not be
    // downgraded because `deviceMemory` is absent (and vice versa).
    expect(lowEndUnder({ hardwareConcurrency: 8 })).toBe("false");
    expect(lowEndUnder({ deviceMemory: 8 })).toBe("false");
  });
});

describe("useLowEndDevice — each signal flips it independently", () => {
  it("Save-Data: navigator.connection.saveData", () => {
    expect(lowEndUnder({ ...CAPABLE, connection: { saveData: true } })).toBe(
      "true",
    );
    expect(lowEndUnder({ ...CAPABLE, connection: { saveData: false } })).toBe(
      "false",
    );
    // An absent `connection` (Safari) must not throw or downgrade.
    expect(lowEndUnder({ ...CAPABLE, connection: undefined })).toBe("false");
  });

  it("prefers-reduced-data, on otherwise capable hardware", () => {
    expect(lowEndUnder(CAPABLE, [REDUCED_DATA])).toBe("true");
  });

  it("a small coarse-pointer screen, on otherwise capable hardware", () => {
    expect(lowEndUnder(CAPABLE, [SMALL_TOUCH])).toBe("true");
  });

  it("ignores an unrelated matching query (reduced-motion is a separate gate)", () => {
    expect(lowEndUnder(CAPABLE, [REDUCED_MOTION])).toBe("false");
  });
});

describe("useLowEndDevice — reactivity", () => {
  it("re-reads the gate when prefers-reduced-data flips mid-session", () => {
    const mm = installMatchMedia();
    setSignals(CAPABLE);
    const { container } = render(<LowEndProbe />);
    expect(container.textContent).toBe("false");

    act(() => mm.set(REDUCED_DATA, true));
    expect(container.textContent).toBe("true");

    // …and back: the snapshot is re-derived, never latched.
    act(() => mm.set(REDUCED_DATA, false));
    expect(container.textContent).toBe("false");
  });

  it("re-reads the gate when the small-touch query flips (a rotation)", () => {
    const mm = installMatchMedia();
    setSignals(CAPABLE);
    const { container } = render(<LowEndProbe />);
    expect(container.textContent).toBe("false");

    act(() => mm.set(SMALL_TOUCH, true));
    expect(container.textContent).toBe("true");
  });

  it("removes the exact listeners it added, on both queries, at unmount", () => {
    const mm = installMatchMedia();
    setSignals(CAPABLE);
    const { unmount } = render(<LowEndProbe />);

    for (const media of [REDUCED_DATA, SMALL_TOUCH]) {
      const list = mm.listFor(media);
      expect(list.listeners.size).toBe(1);
      expect(list.addEventListener).toHaveBeenCalledTimes(1);
      expect(list.addEventListener.mock.calls[0][0]).toBe("change");
      expect(list.removeEventListener).not.toHaveBeenCalled();
    }

    unmount();

    for (const media of [REDUCED_DATA, SMALL_TOUCH]) {
      const list = mm.listFor(media);
      expect(list.listeners.size).toBe(0);
      // The same function object — not a fresh closure, which would leave the
      // real listener attached for the life of the page.
      expect(list.removeEventListener.mock.calls[0][1]).toBe(
        list.addEventListener.mock.calls[0][1],
      );
    }
  });
});

describe("useReducedMotion", () => {
  it("mirrors prefers-reduced-motion and subscribes to nothing else", () => {
    const mm = installMatchMedia([REDUCED_MOTION]);
    setSignals(CAPABLE);
    const { container } = render(<ReducedMotionProbe />);
    expect(container.textContent).toBe("true");
    expect(new Set(mm.lists.keys())).toEqual(new Set([REDUCED_MOTION]));
  });

  it("is independent of the low-end gate — same device, opposite answers", () => {
    installMatchMedia([REDUCED_DATA, SMALL_TOUCH]);
    setSignals({ deviceMemory: 1, hardwareConcurrency: 1 });
    const { container } = render(
      <>
        <LowEndProbe />
        <ReducedMotionProbe />
      </>,
    );
    expect(container.textContent).toBe("truefalse");
  });

  it("updates when the preference flips mid-session", () => {
    const mm = installMatchMedia();
    setSignals(CAPABLE);
    const { container } = render(<ReducedMotionProbe />);
    expect(container.textContent).toBe("false");

    act(() => mm.set(REDUCED_MOTION, true));
    expect(container.textContent).toBe("true");

    act(() => mm.set(REDUCED_MOTION, false));
    expect(container.textContent).toBe("false");
  });

  it("removes the exact listener it added at unmount", () => {
    const mm = installMatchMedia([REDUCED_MOTION]);
    setSignals(CAPABLE);
    const { unmount } = render(<ReducedMotionProbe />);
    const list = mm.listFor(REDUCED_MOTION);
    expect(list.listeners.size).toBe(1);

    unmount();
    expect(list.listeners.size).toBe(0);
    expect(list.removeEventListener.mock.calls[0][1]).toBe(
      list.addEventListener.mock.calls[0][1],
    );
  });
});

describe("server snapshot", () => {
  it("both hooks render false on the server, whatever the client would say", async () => {
    installMatchMedia([REDUCED_DATA, SMALL_TOUCH, REDUCED_MOTION]);
    setSignals({
      deviceMemory: 2,
      hardwareConcurrency: 2,
      connection: { saveData: true },
    });

    // Every client signal screams "downgrade"…
    const client = render(
      <>
        <LowEndProbe />
        <ReducedMotionProbe />
      </>,
    );
    expect(client.container.textContent).toBe("truetrue");

    // …yet the server markup is the high-end one, so an SSR host never ships
    // the fallback and then hydrates into the scene (or vice versa).
    expect(await serverRender(<LowEndProbe />)).toBe("<span>false</span>");
    expect(await serverRender(<ReducedMotionProbe />)).toBe(
      "<span>false</span>",
    );
  });
});
