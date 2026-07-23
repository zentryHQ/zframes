"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// A full-bleed live example board — the real board rendered inside a same-origin
// <iframe src="/embed/{id}">, framed to fill one fullscreen panel of the landing's
// sticky scroll-stack (see StackPanel). Actual streaming data, not a screenshot.
// Two costs are actively bounded:
//   • WS cost — the iframe `src` is only set once the panel nears the viewport
//     (IntersectionObserver), so boards below the fold open no socket yet.
//   • scroll/interaction — the iframe is display-only (pointer-events:none,
//     scrolling off); a transparent full-panel <Link> owns the click → /d/{id}.
export function LiveBoardFrame({
  id,
  title,
  description,
  tags = [],
  frameCount,
}: {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  frameCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mounted) return;
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
  }, [mounted]);

  return (
    <div
      ref={ref}
      className="zf-surface hairline group relative h-full w-full overflow-hidden"
    >
      {/* The live board fills the frame. */}
      {mounted && (
        <iframe
          src={`/embed/${id}`}
          title={`${title} — live preview`}
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
            LOADING LIVE BOARD…
          </span>
        </div>
      )}

      {/* Whole-panel nav overlay → the full preview. Above the display-only
            iframe, below the caption chrome. Inside .group so it drives hover. */}
      <Link
        href={`/d/${id}`}
        aria-label={`Open ${title} live preview`}
        className="absolute inset-0 z-10"
      />

      {/* Top bar — LIVE pill + frame count. Visual only. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 sm:p-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" />
          Live
        </span>
        <span className="rounded-full border border-white/10 bg-black/45 px-2.5 py-1 font-mono text-[11px] text-white/70 backdrop-blur">
          {frameCount} {frameCount === 1 ? "frame" : "frames"}
        </span>
      </div>

      {/* Bottom caption — title, blurb, tags, and the open affordance. Visual
            only (pointer-events:none); the overlay link above owns the click. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-5 pb-6 pt-16 sm:px-8 sm:pb-8">
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
            Open live preview
            <span className="zf-arrow-reveal">→</span>
          </span>
        </div>
      </div>
    </div>
  );
}
