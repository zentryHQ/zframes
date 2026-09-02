import { useEffect, useState, type RefObject } from "react";
import { isPageHidden, onPageVisibilityChange } from "@zframes/core";

/**
 * "Is anyone actually looking at this card?" as RENDER STATE — the viewport
 * gate and the page-visibility gate answered together.
 *
 * The data frames already stand down on both axes, but through primitives that
 * deliberately avoid re-rendering: `useVisibilityRef` (`./live-tick`) hands back
 * a ref for a per-tick `if`, and `usePolled` reads the frame-visibility context
 * inside its own timer. That shape is wrong for the two things this hook exists
 * for — a third-party iframe that must be mounted or not, and a canvas game
 * loop that lives in an effect — because both need the flag in the render pass
 * or in a dep array. One state flip per scroll-past is nothing next to an
 * off-screen YouTube player still decoding audio.
 *
 * Deliberately NOT wired to `areLiveUpdatesPaused()`, the third tick-gating
 * axis: that one fires while a host animates the board (the explorer's landing
 * scrub) and is expected to resume by itself, whereas the games treat a pause
 * as "wait for the player", so a scrub would leave a board full of games
 * demanding a tap.
 *
 * Defaults to active, so a freshly-mounted in-view card works before the
 * observer's first async callback — and on a platform (or a jsdom) with no
 * `IntersectionObserver`, where the honest answer is "assume it is seen".
 *
 * @param ref The frame's own outer element. Pass the ref the frame already has
 *   (the games' `containerRef`) rather than adding a second wrapper.
 * @param rootMargin Grown box for the intersection test. The default is exact:
 *   an embed's audio should stop when the card leaves the screen, not 200px
 *   later like a data poll that wants to be warm before it is seen.
 */
export function useFrameActivity(
  ref: RefObject<Element | null>,
  rootMargin = "0px",
): { active: boolean; everActive: boolean } {
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [everActive, setEverActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  useEffect(() => {
    // Read first, then subscribe: the subscription fires only on CHANGE, so a
    // card mounted into an already-hidden tab would otherwise wait for a
    // transition that never comes.
    setPageVisible(!isPageHidden());
    return onPageVisibilityChange((hidden) => setPageVisible(!hidden));
  }, []);

  const active = inView && pageVisible;

  useEffect(() => {
    if (active) setEverActive(true);
  }, [active]);

  return { active, everActive };
}
