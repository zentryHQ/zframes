"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import type { BoardSummary } from "@/app/lib/board-summary";
import { LiveBoardFrame } from "@/app/lib/LiveBoardFrame";
import {
  FocusPanel,
  focusT,
  useFocusDwellProgress,
  useSectionProgress,
} from "@/app/lib/motion";

// The landing's Act II focus gallery — the ONE part of the page that needs
// page-level client state (scroll progress → activeIndex/visibleRange), split
// out of LandingView so the rest of the landing can render as server HTML
// instead of hydrating a 650-line client tree.

// The focus-gallery's shared sticky box sits below the header (57px) with a
// little air. Every board renders full inside this box; scale/opacity animate.
const FOCUS_STICKY_TOP = 72;
// Scroll depth (vh) allotted to each board's slot. Generous on purpose: the dwell
// band is a fixed fraction of the slot, so this is the dial that decides how long
// a board holds focus — and therefore how gently its own frames scroll past.
const FOCUS_SLOT_VH = 300;

/**
 * The sticky card-stack of live board embeds. Under reduced motion it collapses
 * to a plain vertical list (no scrub, no crossfade). Renders nothing with no
 * boards — an unseeded database used to be impossible (they were compiled in),
 * and an empty sticky container would be 30vh of blank scroll.
 */
export function ShowcaseStack({ boards }: { boards: BoardSummary[] }) {
  const reduced = useReducedMotion();
  const stackRef = useRef<HTMLElement>(null);
  const progress = useSectionProgress(stackRef);
  // The board that is SETTLED at full (centred in the dwell band). Only it runs
  // its animated WebGL backdrop (bgActive) and takes clicks; -1 mid-transition
  // so no scene boots on a fast fly-through. Same-value bailout means scrolling
  // re-renders nothing until the focused board actually changes.
  const [activeIndex, setActiveIndex] = useState(0);
  // The window of boards whose CONTENT is on show (near enough to `t` to be
  // visible/crossfading). Boards outside it stop rendering + polling entirely
  // (content-visibility: hidden). The parent owns this: an iframe's own
  // IntersectionObserver can't see that a faded-out sibling is effectively gone.
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 1]);
  const demoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (demoteTimer.current) clearTimeout(demoteTimer.current);
    },
    [],
  );

  useMotionValueEvent(progress, "change", (p) => {
    const n = boards.length;
    const t = focusT(p, n);
    const r = Math.round(t);
    // Settled only while resting in a board's dwell band; else nothing is
    // "active" (the crossfade owns the mid-transition look, no scene needed).
    // The band has to cover the whole dwell — the content scrubs across it, and
    // a board whose own frames are scrolling past must keep its scene alive.
    const settled =
      Math.abs(t - r) < 0.34 ? Math.min(n - 1, Math.max(0, r)) : -1;
    setActiveIndex((a) => (a === settled ? a : settled));
    const lo = Math.max(0, Math.floor(t - 0.7));
    const hi = Math.min(n - 1, Math.ceil(t + 0.7));
    // Hysteresis: widen the visible window immediately (a board must be
    // rendering before it crossfades in), but DEMOTE only after the scroll has
    // settled for 400 ms. Each demotion flips `content-visibility` on a
    // ~30-frame board inside its iframe — a full relayout — and a fast
    // fly-through used to trigger that on every boundary it crossed, which is
    // exactly the "fast scroll = lag" signature.
    setVisibleRange((v) => {
      const wLo = Math.min(v[0], lo);
      const wHi = Math.max(v[1], hi);
      return wLo === v[0] && wHi === v[1] ? v : [wLo, wHi];
    });
    if (demoteTimer.current) clearTimeout(demoteTimer.current);
    demoteTimer.current = setTimeout(() => {
      setVisibleRange((v) => (v[0] === lo && v[1] === hi ? v : [lo, hi]));
    }, 400);
  });

  if (boards.length === 0) return null;

  if (reduced) {
    return (
      <section className="mx-auto max-w-[88rem] space-y-6 px-4 pb-[8vh] sm:px-6">
        {boards.map((d) => (
          <div key={d.id} className="h-[78vh]">
            <LiveBoardFrame
              id={d.id}
              title={d.title}
              description={d.description}
              tags={d.tags}
              frameCount={d.frameCount}
              bgActive={false}
              boardVisible
            />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section
      ref={stackRef}
      className="relative overflow-x-clip"
      // One scroll "slot" per board (plus lead-in/out); the sticky box below
      // stays pinned across the whole range while the boards crossfade. The
      // slot is deliberately deep — most of it is dwell, and the dwell is
      // what scrolls the board's own frames past (FOCUS_SLOT_VH).
      style={{ height: `${boards.length * FOCUS_SLOT_VH + 30}vh` }}
    >
      <div
        className="sticky mx-auto w-full max-w-[88rem] px-4 sm:px-6"
        style={{
          top: FOCUS_STICKY_TOP,
          height: `calc(100svh - ${FOCUS_STICKY_TOP}px - 2rem)`,
        }}
      >
        {boards.map((d, i) => (
          <ShowcaseBoard
            key={d.id}
            board={d}
            progress={progress}
            index={i}
            count={boards.length}
            active={i === activeIndex}
            boardVisible={i >= visibleRange[0] && i <= visibleRange[1]}
            // Stage the iframe mounts: all four panels share one sticky box,
            // so their IntersectionObservers fire on the SAME frame — four
            // documents, ~126 frames, all mounting at once. Gate each mount
            // on scroll proximity instead (one slot ahead of the visible
            // window); mounting stays one-shot inside LiveBoardFrame.
            mountEnabled={i <= visibleRange[1] + 1}
          />
        ))}
      </div>
    </section>
  );
}

// One board in the focus stack. Exists as its own component only because the
// dwell-scrub is a hook: each board derives its own 0..1 content progress from
// the shared section scroll, and hands it to the embed (see LiveBoardFrame).
// Memoized: activeIndex/visibleRange changes re-render the parent several times
// per scroll gesture, and only the boards whose flags changed should pay.
const ShowcaseBoard = memo(function ShowcaseBoard({
  board,
  progress,
  index,
  count,
  active,
  boardVisible,
  mountEnabled,
}: {
  board: BoardSummary;
  progress: MotionValue<number>;
  index: number;
  count: number;
  active: boolean;
  boardVisible: boolean;
  mountEnabled: boolean;
}) {
  const contentScroll = useFocusDwellProgress(progress, index, count);
  return (
    <FocusPanel progress={progress} index={index} count={count} active={active}>
      <LiveBoardFrame
        id={board.id}
        title={board.title}
        description={board.description}
        tags={board.tags}
        frameCount={board.frameCount}
        bgActive={active}
        boardVisible={boardVisible}
        mountEnabled={mountEnabled}
        scrollProgress={contentScroll}
      />
    </FocusPanel>
  );
});
