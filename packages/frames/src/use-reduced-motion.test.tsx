// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

afterEach(cleanup);

type Listener = () => void;

/**
 * A `matchMedia` whose answer can be CHANGED, which jsdom's cannot: its stub
 * always reports `matches: false` and never fires. Without one of these there
 * is no way to test the thing that was actually wrong — the preference being
 * sampled once at mount, so a mid-session flip never reached a card already on
 * screen.
 *
 * Installed before the module under test is imported, because it caches the
 * `MediaQueryList` on first use (one query per board, not one per frame).
 */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    set(next: boolean) {
      matches = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReducedMotion", () => {
  it("reports the preference as it stands at mount", async () => {
    installMatchMedia(true);
    const { useReducedMotion } = await import("./use-reduced-motion");
    function Probe() {
      return <span>{useReducedMotion() ? "still" : "moving"}</span>;
    }
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("still");
  });

  it("follows a flip made after mount", async () => {
    // THE regression. Everything in this package that reads the preference from
    // JS goes through this hook precisely so a card that is already rendered
    // stops moving the moment the setting changes.
    const media = installMatchMedia(false);
    const { useReducedMotion } = await import("./use-reduced-motion");
    function Probe() {
      return <span>{useReducedMotion() ? "still" : "moving"}</span>;
    }
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("moving");
    act(() => media.set(true));
    expect(container.textContent).toBe("still");
    act(() => media.set(false));
    expect(container.textContent).toBe("moving");
  });

  it("drops its listener when the last reader unmounts", async () => {
    const media = installMatchMedia(false);
    const { useReducedMotion } = await import("./use-reduced-motion");
    function Probe() {
      useReducedMotion();
      return null;
    }
    const { unmount } = render(<Probe />);
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("answers false where there is no matchMedia at all", async () => {
    // A server render, and any host without the API. The frames it gates must
    // keep their normal motion rather than crash.
    vi.stubGlobal("matchMedia", undefined);
    const { useReducedMotion } = await import("./use-reduced-motion");
    function Probe() {
      return <span>{useReducedMotion() ? "still" : "moving"}</span>;
    }
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("moving");
  });
});

describe("FrameStatus under reduced motion", () => {
  it("pulses the loading skeleton by default", async () => {
    installMatchMedia(false);
    const { FrameStatus } = await import("./ui");
    const { container } = render(<FrameStatus loading>loading…</FrameStatus>);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(container.querySelector(".animate-ping")).not.toBeNull();
  });

  it("drops the pulse AND the ping when reduced motion is on", async () => {
    // The shared placeholder was the one loading state in the product that
    // ignored the preference — the equivalent fill in the card chrome gates
    // itself in CSS, so a board showed one animating and one still.
    installMatchMedia(true);
    const { FrameStatus } = await import("./ui");
    const { container } = render(<FrameStatus loading>loading…</FrameStatus>);
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(container.querySelector(".animate-ping")).toBeNull();
  });

  it("still marks itself busy for the thumbnail capture", async () => {
    // Reduced motion must not change the machine-readable contract.
    installMatchMedia(true);
    const { FrameStatus } = await import("./ui");
    const { container } = render(<FrameStatus loading>loading…</FrameStatus>);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
