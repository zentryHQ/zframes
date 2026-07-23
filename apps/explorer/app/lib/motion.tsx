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

// The visible top strip (px) of each card left peeking behind the one in front —
// the "stacked cards" tell. Bigger = more of each card's header/border shows.
const STACK_PEEK = 30;

// One card in a stacked-card scroll. Each card is a distinct bordered panel that
// pins near the top of the viewport and STAYS pinned (they share one containing
// section, so they accumulate rather than scroll away). Successive cards pin
// `STACK_PEEK` px lower and one z-index higher, so the next card rises up and
// covers the previous, leaving its top strip (border + a sliver of chrome) showing
// — a growing stack. No scaling/clipping, so nothing gets cut off; the front card
// is always fully visible. Pure CSS (sticky), so it's identical under reduced
// motion. `total` sizes the cards to fit once the full stack is offset.
export function StackPanel({
  children,
  index,
  total,
  className,
}: {
  children: ReactNode;
  index: number;
  total: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Progress as this card scrolls in from the bottom: 0 when its top is at the
  // viewport bottom, ~1 by the time it reaches its pinned position at the top.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });
  // Enters FULL-BLEED (scaled wide, spilling past the gutters — the section clips
  // the overspill) then shrinks into its framed card as it settles. origin TOP so
  // the top edge stays anchored and nothing is ever clipped off the top. Settled
  // (scale 1) a hair before the pin (≈0.9) so it rests crisp, not mid-zoom.
  const scale = useTransform(scrollYProgress, [0, 0.9], [1.32, 1]);

  const top = 57 + index * STACK_PEEK; // header is 57px
  const inner = (
    <div
      className="mx-auto w-full max-w-6xl px-4 sm:px-6"
      // Fit the card so that even the front-most (lowest) one clears the viewport
      // bottom once the whole stack's peek offset is accounted for.
      style={{
        height: `calc(100vh - 57px - ${(total - 1) * STACK_PEEK}px - 2rem)`,
      }}
    >
      {children}
    </div>
  );

  return (
    <div
      ref={ref}
      className={`sticky ${className ?? ""}`}
      style={{ top, zIndex: index + 1 }}
    >
      {reduced ? (
        inner
      ) : (
        <motion.div style={{ scale, transformOrigin: "top center" }}>
          {inner}
        </motion.div>
      )}
    </div>
  );
}
