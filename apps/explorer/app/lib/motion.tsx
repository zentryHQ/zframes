"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

// Shared scroll-motion primitives for the landing. This is the ONE place `motion`
// (framer-motion's successor) is used — for scroll-driven orchestration CSS can't
// express cleanly (parallax, whileInView reveals). Micro-interactions (hover/press/
// ken-burns) stay in globals.css. Both primitives collapse to a static, no-transform
// render under prefers-reduced-motion, matching the CSS motion gates in globals.

// The site's signature quint ease-out (mirrors --zf-ease-out in globals.css).
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Fade + rise into place the first time the element scrolls into view. Once only
// (no re-trigger on scroll-back), so the page settles rather than flickering.
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

// Scroll-linked vertical drift. As the element travels through the viewport its
// content shifts from +distance to -distance, so it moves at a different rate than
// the page — the depth cue of parallax. Transform-only (GPU, off the main thread).
// Give sibling layers different `distance` values for layered depth.
export function Parallax({
  children,
  className,
  distance = 60,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Track this element's progress across the viewport: 0 as its top hits the
  // bottom edge, 1 as its bottom leaves the top edge.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

// Pointer-follow drift — the hero's depth cue at rest. The layer eases toward
// the cursor (or away, negative strength) with a soft spring, so stacked layers
// given different strengths read as a parallax volume even before any scroll.
// Off under reduced motion and on coarse pointers (no cursor to follow).
export function MouseParallax({
  children,
  className,
  strength = 12,
}: {
  children: ReactNode;
  className?: string;
  /** Max drift in px at the viewport edge; negative = counter-drift. */
  strength?: number;
}) {
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 50, damping: 18, mass: 0.6 });
  const y = useSpring(0, { stiffness: 50, damping: 18, mass: 0.6 });

  useEffect(() => {
    if (reduced) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const onMove = (e: MouseEvent) => {
      x.set((e.clientX / window.innerWidth - 0.5) * 2 * strength);
      y.set((e.clientY / window.innerHeight - 0.5) * 2 * strength);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduced, strength, x, y]);

  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div style={{ x, y }} className={className}>
      {children}
    </motion.div>
  );
}

// Scroll-scrubbed exit for the hero: content fades + eases up + shrinks a hair
// as its section scrolls off, so the hand-off to the next scene reads as one
// continuous camera move rather than a hard cut.
export function ScrollExit({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -48]);
  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }
  return (
    <motion.div ref={ref} style={{ opacity, scale, y }} className={className}>
      {children}
    </motion.div>
  );
}

// Progress of an element through the viewport, for bespoke scrubs (the giant
// frame-count numeral, chapter ghosts). Exposed as a hook so sections can wire
// several transforms off one measurement.
export function useViewportProgress(ref: React.RefObject<HTMLElement | null>): {
  progress: MotionValue<number>;
} {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  return { progress: scrollYProgress };
}

// ── Focus-scroll gallery ────────────────────────────────────────────────────
// A sequence of full-panel boards where scroll PROMOTES one at a time: each board
// grows from small into a full, un-clipped view (the whole dashboard visible),
// DWELLS there for a stretch of scroll, then shrinks and fades as the next board
// grows up in its place. All panels share ONE sticky viewport box (absolute,
// inset-0), so "full" == that box at scale 1 — nothing is ever clipped. One
// master scroll progress (useSectionProgress) maps to a continuous card position
// `t` (focusT); each FocusPanel derives its own scale/opacity/drift/z from its
// distance to `t`. Collapses to a plain vertical list under reduced motion (the
// parent skips FocusPanel entirely).

// Grow-in lead (in card slots) before card 0 is centred, so the first board also
// eases up from small rather than starting full.
const FOCUS_LEAD = 0.4;
// Half-width (card slots) of the DWELL band — a board holds full & opaque here.
// Wider = the focused board lingers longer before the next takes over.
const FOCUS_HOLD = 0.36;
// Slots over which a board fades/shrinks full → gone on each side of the dwell.
const FOCUS_TRANS = 0.3;
const FOCUS_MIN_SCALE = 0.82; // scale of a fully-demoted (edge) board
const FOCUS_RISE = 80; // px of vertical drift so passing boards don't ghost
// Opacity clears faster than scale (>1 exponent), so a demoting board is nearly
// gone by the crossfade midpoint — the two overlapping boards don't muddy.
const FOCUS_FADE_POW = 1.5;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// Continuous "which card is centred" position for scroll progress p∈[0,1].
// t≈i means card i is at full; the integer part is the focused board.
export function focusT(p: number, count: number): number {
  return p * count - FOCUS_LEAD;
}

// Master scroll progress for a focus-stack section: 0 as its top pins to the top,
// 1 as its bottom leaves. Feed the returned value to every FocusPanel below it.
export function useSectionProgress(
  ref: React.RefObject<HTMLElement | null>,
): MotionValue<number> {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return scrollYProgress;
}

// One board in a focus-scroll gallery. Absolutely fills its shared sticky box and
// scales/fades by its distance to the centred position `t`: full & opaque inside
// the dwell band, shrinking + fading to nothing beyond it. A small opposite-sign
// vertical drift keeps a demoting board and its promoting successor from ghosting
// through each other during the crossfade. `active` (the settled, centred board,
// decided by the parent) is the only one that takes pointer events, so its
// click-through overlay works. Not rendered under reduced motion.
export function FocusPanel({
  children,
  progress,
  index,
  count,
  active = false,
  className,
}: {
  children: ReactNode;
  progress: MotionValue<number>;
  index: number;
  count: number;
  /** True for the currently-centred board (parent-decided); enables clicks. */
  active?: boolean;
  className?: string;
}) {
  const amt = (p: number) =>
    clamp(
      (Math.abs(focusT(p, count) - index) - FOCUS_HOLD) / FOCUS_TRANS,
      0,
      1,
    );
  const scale = useTransform(progress, (p) => 1 - amt(p) * (1 - FOCUS_MIN_SCALE));
  const opacity = useTransform(progress, (p) => (1 - amt(p)) ** FOCUS_FADE_POW);
  const y = useTransform(
    progress,
    (p) => clamp(focusT(p, count) - index, -1, 1) * -FOCUS_RISE,
  );
  const zIndex = useTransform(progress, (p) =>
    Math.round(500 - Math.abs(focusT(p, count) - index) * 100),
  );
  return (
    <motion.div
      className={`absolute inset-0 ${className ?? ""}`}
      style={{
        scale,
        opacity,
        y,
        zIndex,
        transformOrigin: "center center",
        pointerEvents: active ? "auto" : "none",
        willChange: "transform, opacity",
      }}
    >
      {children}
    </motion.div>
  );
}
