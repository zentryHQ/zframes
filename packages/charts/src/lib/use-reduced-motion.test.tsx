// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useReducedMotion } from "./use-reduced-motion";

// jsdom's own matchMedia always answers `false` and can never change, so the
// only way to test the thing that was broken — reacting to a mid-session flip —
// is to stand in a list we can flip ourselves.

type Flip = (matches: boolean) => void;

function stubMatchMedia(initial: boolean): Flip {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        // A getter, not a snapshot: a real MediaQueryList's `matches` is live,
        // and the hook re-reads it from the list when the change fires.
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) =>
          listeners.delete(fn),
      }) as unknown as MediaQueryList,
  );
  return (next: boolean) => {
    matches = next;
    // Every list handed out shares the closure, so this is what a real
    // `change` event does to all of them at once.
    act(() => {
      for (const fn of listeners) fn();
    });
  };
}

function Probe({ seen }: { seen: (value: boolean) => void }) {
  seen(useReducedMotion());
  return null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useReducedMotion", () => {
  it("reports the preference as it stands at mount", () => {
    stubMatchMedia(true);
    const seen = vi.fn();
    render(<Probe seen={seen} />);
    expect(seen).toHaveBeenLastCalledWith(true);
  });

  it("re-renders when the preference is turned on mid-session", () => {
    const flip = stubMatchMedia(false);
    const seen = vi.fn();
    render(<Probe seen={seen} />);
    expect(seen).toHaveBeenLastCalledWith(false);
    flip(true);
    expect(seen).toHaveBeenLastCalledWith(true);
  });

  it("goes back to false when the preference is turned off again", () => {
    const flip = stubMatchMedia(true);
    const seen = vi.fn();
    render(<Probe seen={seen} />);
    flip(false);
    expect(seen).toHaveBeenLastCalledWith(false);
  });

  it("answers false, and does not throw, where matchMedia is absent", () => {
    vi.stubGlobal("matchMedia", undefined);
    const seen = vi.fn();
    render(<Probe seen={seen} />);
    expect(seen).toHaveBeenLastCalledWith(false);
  });
});
