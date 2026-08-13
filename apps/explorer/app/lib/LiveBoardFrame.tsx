"use client";

import Link from "next/link";
import {
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { getDataMode } from "@/app/lib/data-mode";

// A full-bleed live example board — the real board rendered inside a same-origin
// <iframe src="/embed/{id}">, framed to fill one fullscreen panel of the landing's
// focus-scroll gallery (see FocusPanel). Actual streaming data, not a screenshot.
// Three costs are actively bounded:
//   • WS cost — the iframe `src` is only set once the panel nears the viewport
//     (IntersectionObserver), so boards below the fold open no socket yet.
//   • GPU cost — `bgActive` (computed by the landing from the stack's scroll
//     state) is pushed into the embed via postMessage; an inactive board tears
//     down its animated WebGL backdrop, so only the visible card(s) hold a live
//     scene no matter how many are stacked.
//   • scroll/interaction — the iframe is display-only (pointer-events:none,
//     scrolling off); a transparent full-panel <Link> owns the click → /dashboard/{id}.
export const LiveBoardFrame = memo(function LiveBoardFrame({
  id,
  title,
  description,
  tags = [],
  frameCount,
  bgActive = true,
  boardVisible = true,
  mountEnabled = true,
  scrollProgress,
}: {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  frameCount: number;
  /** Whether this board's animated backdrop should be live (see above). */
  bgActive?: boolean;
  /**
   * Whether the board's CONTENT is on show. False for cards covered by the
   * stack (or a fully scrolled-past stack) — the embed then stops rendering
   * and polling entirely (`content-visibility: hidden`), not just its scene.
   */
  boardVisible?: boolean;
  /**
   * Extra gate on mounting the iframe, owned by the parent. In the landing's
   * focus stack every panel shares ONE sticky box, so all four
   * IntersectionObservers fire on the same frame — without this gate four
   * documents (~126 frames) mount in a single burst right as the user scrolls
   * into the stack. Once true and intersected, the mount is one-shot.
   */
  mountEnabled?: boolean;
  /**
   * How far through the board's OWN content to scrub, 0..1. A real board is
   * several viewports tall, so while the panel dwells in focus the landing
   * scrolls the content through this fixed frame — the whole board gets seen
   * without the panel moving. Omitted (gallery, reduced motion) → the board
   * just shows its top, as before.
   */
  scrollProgress?: MotionValue<number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // The top-bar pill must not claim LIVE over a demo-mode board. Resolved in
  // an effect (SSR renders the demo shape; see DataModeToggle for the pattern).
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(getDataMode() === "live");
  }, []);

  useEffect(() => {
    if (mounted || !mountEnabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true); // one-shot: mount the WS once, keep it after
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, mountEnabled]);

  // Board control channel into the embed (same-origin). Push on every change,
  // and answer the embed's `zf:bg-hello` — sent once it has hydrated and is
  // actually listening — so the initial state can't be lost to the load race.
  const stateRef = useRef({ bgActive, boardVisible });
  useEffect(() => {
    stateRef.current = { bgActive, boardVisible };
  }, [bgActive, boardVisible]);
  const post = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      message,
      window.location.origin,
    );
  }, []);
  const sendState = useCallback(
    (sceneActive: boolean, visible: boolean) => {
      post({ type: "zf:board", sceneActive, visible });
    },
    [post],
  );
  useEffect(() => {
    sendState(bgActive, boardVisible);
  }, [bgActive, boardVisible, sendState]);

  // Content scrub — fires on every scroll frame while this board dwells, so it
  // never touches React state. Coalesced to at most ONE postMessage per
  // animation frame (a cross-document structured-clone dispatch per motion
  // update stacked up under fast scroll), carrying the latest value. The last
  // value is kept so the embed's hello can be answered with it too, exactly
  // like the board state above.
  const scrollRef = useRef(0);
  const scrollRafRef = useRef(0);
  const sendScroll = useCallback(
    (progress: number) => {
      scrollRef.current = progress;
      post({ type: "zf:scroll", progress });
    },
    [post],
  );
  const queueScroll = useCallback(
    (progress: number) => {
      scrollRef.current = progress;
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        post({ type: "zf:scroll", progress: scrollRef.current });
      });
    },
    [post],
  );
  useEffect(
    () => () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );
  const fallbackScroll = useMotionValue(0);
  useMotionValueEvent(scrollProgress ?? fallbackScroll, "change", queueScroll);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      if ((e.data as { type?: unknown } | null)?.type === "zf:bg-hello") {
        const s = stateRef.current;
        sendState(s.bgActive, s.boardVisible);
        sendScroll(scrollRef.current);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendScroll, sendState]);

  return (
    <div
      ref={ref}
      className="zf-surface hairline group relative h-full w-full overflow-hidden"
    >
      {/* The live board fills the frame. */}
      {mounted && (
        <iframe
          ref={iframeRef}
          src={`/embed/${id}`}
          title={`${title} — board preview`}
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full border-0"
        />
      )}

      {/* Skeleton until first paint. */}
      {!loaded && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-white/[0.03] to-transparent">
          <span className="animate-pulse font-mono text-xs tracking-widest text-white/40">
            LOADING BOARD…
          </span>
        </div>
      )}

      {/* Whole-panel nav overlay → the full preview. Above the display-only
            iframe, below the caption chrome. Inside .group so it drives hover. */}
      <Link
        href={`/dashboard/${id}`}
        aria-label={`Open ${title} preview`}
        className="absolute inset-0 z-10"
      />

      {/* Top bar — LIVE/DEMO pill + frame count. Visual only. The pill follows
          the browser's data mode: claiming LIVE over simulated numbers is the
          exact mislabelling the demo-by-default posture forbids. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 sm:p-5">
        {/* Solid fills, deliberately not backdrop-blur: 3 chips × 4 boards =
            12 blur layers each re-sampling a live, repainting iframe every
            frame. Over a dark board the solid is visually equivalent. */}
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/85">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Demo
          </span>
        )}
        <span className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white/70">
          {frameCount} {frameCount === 1 ? "frame" : "frames"}
        </span>
      </div>

      {/* Bottom caption — title, blurb, tags, and the open affordance. Visual
            only (pointer-events:none); the overlay link above owns the click.
            The scrim runs deep and near-opaque at the foot because the board's
            own frames now travel underneath it (scrollProgress) — a thin one let
            passing card titles collide with the caption text. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-5 pb-6 pt-24 sm:px-8 sm:pb-8">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-indigo-200 sm:text-2xl">
              {title}
            </h3>
            {description && (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/70">
                {description}
              </p>
            )}
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="glow-brand hidden shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg sm:inline-flex">
            Open full preview
            <span className="zf-arrow-reveal">→</span>
          </span>
        </div>
      </div>
    </div>
  );
});
