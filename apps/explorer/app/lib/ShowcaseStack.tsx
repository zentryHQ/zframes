"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
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
// Half-width (in card slots) of the band where a board counts as centred. Must
// cover the whole dwell: the content scrubs across it, and a board whose own
// frames are scrolling past has to keep its scene alive.
const FOCUS_SETTLE_BAND = 0.34;

// ── Scroll-rate governors ───────────────────────────────────────────────────
// Every expensive thing in this stack is triggered by *crossing* a boundary, so
// its cost scales with scroll SPEED, not with scroll distance: a slow read pays
// each cost once, a flick pays all of them inside a few hundred milliseconds.
// The three constants below cap that rate. Measured on the four-board landing
// (126 frames across four same-origin embeds); see the note on each.

// How long a board must hold the focus band before its WebGL backdrop boots.
// Activating a board calls Unicorn's `addScene` inside that iframe — a GL
// context, a shader compile and a scene fetch — and a 700 ms flick through the
// stack used to fire that for EVERY board it passed (measured: four boots and
// four teardowns, none of which the visitor stopped to look at). A deliberate
// read enters a band and stays there for over a second; a flick crosses each
// band in ~120 ms, so gating on held-time alone spends nothing on a
// fly-through. Deactivation stays instant (the scene's own 1.2 s teardown grace
// in DashboardBackground absorbs the jitter at a handover).
const ACTIVATE_DWELL_MS = 240;
// Floor on the gap between narrowings of the visible window. This used to be a
// trailing debounce reset on every scroll frame, which meant it never fired
// while the page was moving: the window only ever WIDENED, so any sustained
// scroll ended with all four boards rendering and polling at once and only
// gave the memory back 400 ms after the visitor stopped. Age-based instead —
// one narrowing per interval, no matter how long the scroll runs — so the
// window still can't flip `content-visibility` on a ~30-frame board every
// boundary it crosses, but it also can't stay maxed out.
const NARROW_INTERVAL_MS = 320;
// Floor on the gap between iframe mounts. All four panels share one sticky box,
// so their IntersectionObservers fire on the same frame and `visibleRange`
// widens instantly — without a ratchet, a flick (or just landing on the page,
// where the 800px rootMargin already catches three panels) mounts several whole
// documents in a single frame. One at a time; mounting stays one-shot.
const MOUNT_STAGGER_MS = 320;
// Ceiling on boards rendering simultaneously — see the clamp in the widen below.
const MAX_LIVE_BOARDS = 3;

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
  const count = boards.length;

  // The board that is SETTLED at full (centred in the dwell band, and has held
  // it — see ACTIVATE_DWELL_MS). Only it runs its animated WebGL backdrop
  // (bgActive) and takes clicks; -1 while nothing has settled, so no scene
  // boots on a fast fly-through. Same-value bailout means scrolling re-renders
  // nothing until the focused board actually changes.
  const [activeIndex, setActiveIndex] = useState(0);
  // The window of boards whose CONTENT is on show (near enough to `t` to be
  // visible/crossfading). Boards outside it stop rendering + polling entirely
  // (content-visibility: hidden). The parent owns this: an iframe's own
  // IntersectionObserver can't see that a faded-out sibling is effectively gone.
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 1]);
  // How many boards may have mounted their iframe, ratcheted up one per
  // MOUNT_STAGGER_MS by the effect below. Board 0 is free — it is the one the
  // visitor sees first.
  const [mountBudget, setMountBudget] = useState(1);

  // Which band the scroll is currently sitting in, and the timer that promotes
  // it once it has been held. Refs: this runs on every scroll frame.
  const bandRef = useRef(0);
  const activateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNarrowAt = useRef(0);
  useEffect(
    () => () => {
      if (activateTimer.current) clearTimeout(activateTimer.current);
      if (narrowTimer.current) clearTimeout(narrowTimer.current);
    },
    [],
  );

  // The band `t` is in right now, or -1 between bands. Read fresh from the
  // motion value so a timer that fires after the scroll moved on re-checks
  // against where the page actually is, not where it was when armed.
  const bandNow = useCallback(() => {
    const t = focusT(progress.get(), count);
    const r = Math.round(t);
    return Math.abs(t - r) < FOCUS_SETTLE_BAND
      ? Math.min(count - 1, Math.max(0, r))
      : -1;
  }, [count, progress]);

  useMotionValueEvent(progress, "change", (p) => {
    const t = focusT(p, count);

    // ── Promotion: instant demote, dwell-gated promote ──
    const band = bandNow();
    if (band !== bandRef.current) {
      bandRef.current = band;
      // Nothing is active the moment focus leaves a band — the crossfade owns
      // the mid-transition look, and a scene the visitor is scrolling past
      // should stand down immediately.
      setActiveIndex((a) => (a === -1 ? a : -1));
      if (activateTimer.current) clearTimeout(activateTimer.current);
      activateTimer.current =
        band === -1
          ? null
          : setTimeout(() => {
              activateTimer.current = null;
              // Still here after the dwell? Then this is a board the visitor
              // actually stopped on, and it earns its scene.
              if (bandNow() === band) setActiveIndex(band);
            }, ACTIVATE_DWELL_MS);
    }

    // ── Visible window: widen now, narrow on a floor'd interval ──
    const lo = Math.max(0, Math.floor(t - 0.7));
    const hi = Math.min(count - 1, Math.ceil(t + 0.7));
    setVisibleRange((v) => {
      let wLo = Math.min(v[0], lo);
      let wHi = Math.max(v[1], hi);
      // Hard ceiling on how many boards may render at once, independent of how
      // fast the scroll is or how many boards the stack holds: widening is
      // monotonic between narrow ticks, so without this a flick can still stack
      // up every board inside one interval. Three is the target neighbourhood
      // (two crossfading) plus one board of slack.
      if (wHi - wLo > MAX_LIVE_BOARDS - 1) {
        if (wHi > v[1]) wLo = wHi - (MAX_LIVE_BOARDS - 1);
        else wHi = wLo + (MAX_LIVE_BOARDS - 1);
      }
      return wLo === v[0] && wHi === v[1] ? v : [wLo, wHi];
    });
    // Armed ONCE per interval and deliberately never reset by a later frame —
    // resetting is what stopped this from ever firing mid-scroll.
    if (!narrowTimer.current) {
      const wait = Math.max(
        60,
        NARROW_INTERVAL_MS - (performance.now() - lastNarrowAt.current),
      );
      narrowTimer.current = setTimeout(() => {
        narrowTimer.current = null;
        lastNarrowAt.current = performance.now();
        const tNow = focusT(progress.get(), count);
        const nLo = Math.max(0, Math.floor(tNow - 0.7));
        const nHi = Math.min(count - 1, Math.ceil(tNow + 0.7));
        setVisibleRange((v) => (v[0] === nLo && v[1] === nHi ? v : [nLo, nHi]));
      }, wait);
    }
  });

  // Mount ratchet — one document per tick, up to one slot past the visible
  // window. Re-arms itself as the budget rises because `mountBudget` is a dep.
  useEffect(() => {
    const want = Math.min(count, visibleRange[1] + 2);
    if (mountBudget >= want) return;
    const id = setTimeout(
      () => setMountBudget((b) => Math.min(want, b + 1)),
      MOUNT_STAGGER_MS,
    );
    return () => clearTimeout(id);
  }, [count, visibleRange, mountBudget]);

  if (count === 0) return null;

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
      style={{ height: `${count * FOCUS_SLOT_VH + 30}vh` }}
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
            count={count}
            active={i === activeIndex}
            boardVisible={i >= visibleRange[0] && i <= visibleRange[1]}
            mountEnabled={i < mountBudget}
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
  /** True for the currently-centred board (parent-decided); enables clicks. */
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
