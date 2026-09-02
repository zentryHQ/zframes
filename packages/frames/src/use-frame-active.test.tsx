// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useFrameActivity } from "./use-frame-active";

/**
 * The primitive behind the embed and game stand-down. It exists because the two
 * existing gates could not serve either case: `useVisibilityRef` answers into a
 * ref (deliberately no re-render, so a mounted-or-not decision cannot read it)
 * and it ignores the page axis, so a board left open in a background tab kept
 * a video decoding and a game looping.
 */
function Probe({ rootMargin }: { rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { active, everActive } = useFrameActivity(ref, rootMargin);
  return (
    <div ref={ref} data-active={active} data-ever={everActive}>
      {active ? "active" : "idle"}
    </div>
  );
}

/** An `IntersectionObserver` the test can fire by hand. jsdom ships none. */
function installObserver() {
  let callback: IntersectionObserverCallback | undefined;
  class Observer {
    constructor(cb: IntersectionObserverCallback) {
      callback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  return {
    scrollTo(isIntersecting: boolean) {
      act(() => {
        callback?.(
          [{ isIntersecting }] as unknown as IntersectionObserverEntry[],
          {} as IntersectionObserver,
        );
      });
    },
  };
}

/** Drive `document.hidden` and fire the event, as a tab switch would. */
function setPageHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setPageHidden(false);
});

describe("useFrameActivity", () => {
  it("assumes active on mount, before the observer's first callback", () => {
    // Otherwise every card would render its stood-down state for one frame and
    // an embed would flash a placeholder on a board the reader is looking at.
    installObserver();
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("active");
  });

  it("assumes active where there is no IntersectionObserver at all", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("active");
  });

  it("goes idle when the card leaves the viewport, and back on return", () => {
    const observer = installObserver();
    const { container } = render(<Probe />);
    observer.scrollTo(false);
    expect(container.textContent).toBe("idle");
    observer.scrollTo(true);
    expect(container.textContent).toBe("active");
  });

  it("goes idle when the TAB is hidden, with the card still in view", () => {
    // The axis that was missing everywhere: an on-screen card in a background
    // tab still had a player running and a game looping.
    installObserver();
    const { container } = render(<Probe />);
    setPageHidden(true);
    expect(container.textContent).toBe("idle");
    setPageHidden(false);
    expect(container.textContent).toBe("active");
  });

  it("reads the page state at mount rather than waiting for a change", () => {
    // The subscription fires only on CHANGE, so a card mounted into an
    // already-hidden tab would otherwise wait for a transition never coming.
    installObserver();
    setPageHidden(true);
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("idle");
  });

  it("latches everActive, so a deferred embed is never torn back down", () => {
    // What separates the whiteboard from the video: once mounted, the drawing
    // has to stay mounted, and `everActive` is what the frames key that on.
    const observer = installObserver();
    const { container } = render(<Probe />);
    const el = container.firstElementChild!;
    expect(el.getAttribute("data-ever")).toBe("true");
    observer.scrollTo(false);
    expect(el.getAttribute("data-active")).toBe("false");
    expect(el.getAttribute("data-ever")).toBe("true");
  });
});
