"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { LiveFrame } from "@/app/lib/LiveFrame";
import { DrivenParallax, Reveal, useViewportProgress } from "@/app/lib/motion";
// The chapter/specimen casting lives in a shared, directive-free module so the
// SERVER landing page can enumerate it too — see showcase-chapters.ts. Slot
// min-heights arrive as a prop for the same reason: computing them here would
// import the ~285 Zod metas (frame-slot.ts → @zframes/frames/schemas) into the
// client bundle just to read a per-frame number.
import { CHAPTERS, type Chapter } from "@/app/lib/showcase-chapters";

// ── The frames chapter ──────────────────────────────────────────────────────
// The landing's second act: the vocabulary the agent composes from. The biggest
// frame families — traditional finance first (markets, macro & rates, filings,
// metals), then the crypto-native ones — each staged as a parallax collage of
// REAL frames (LiveFrame →
// the runtime's own FrameContent on shared providers) drifting at different
// rates around the family's copy, with a ghosted chapter numeral moving
// counter-scroll behind. The specimens are fed by frames.ts, but the section
// doesn't describe the catalogue, it IS the catalogue.

// Spelled-out counts keep the prose reading like prose while the NUMBERS stay
// derived — "Fourteen families" can no longer drift the way a typed one did.
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Giant scroll-scrubbed numeral: the frame count slides laterally and fades up
// as the intro crosses the viewport — the section's "big type" beat.
function CountMoment({ total }: { total: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { progress } = useViewportProgress(ref);
  const x = useTransform(progress, [0, 1], ["6%", "-6%"]);
  const opacity = useTransform(progress, [0, 0.35, 0.75, 1], [0, 1, 1, 0.4]);

  return (
    <div ref={ref} className="relative overflow-x-clip py-6 sm:py-10">
      <motion.div
        style={reduced ? undefined : { x, opacity }}
        className="select-none whitespace-nowrap text-center font-bold leading-none tracking-tighter"
      >
        <span className="bg-gradient-to-b from-white via-white/80 to-white/20 bg-clip-text text-[clamp(6rem,22vw,19rem)] text-transparent">
          {total}
        </span>
        <span className="ml-3 align-baseline font-mono text-[clamp(1rem,3vw,1.75rem)] font-medium tracking-normal text-indigo-300 sm:ml-6">
          frames
        </span>
      </motion.div>
    </div>
  );
}

function ChapterScene({
  chapter,
  index,
  count,
  slotMinHeights,
}: {
  chapter: Chapter;
  index: number;
  /** Frames in this family — derived server-side from the real catalogue. */
  count: number;
  /** Per-frame slot floor in px — derived server-side (see frame-slot.ts). */
  slotMinHeights: Record<string, number | undefined>;
}) {
  const flip = index % 2 === 1; // alternate copy side for scroll rhythm
  const numeral = String(index + 1).padStart(2, "0");
  // ONE viewport measurement per chapter; the ghost numeral and every specimen
  // derive their drift from it (DrivenParallax) instead of each carrying their
  // own scroll-linked layout reads. `cv-below-fold` skips layout+paint of
  // off-screen chapters entirely (the specimens' own IntersectionObservers
  // report not-intersecting inside a skipped subtree, so no data flows either).
  const sceneRef = useRef<HTMLDivElement>(null);
  const { progress } = useViewportProgress(sceneRef);

  return (
    <div
      ref={sceneRef}
      className="cv-below-fold relative mx-auto max-w-7xl px-6 py-12 sm:py-16"
    >
      {/* Ghost chapter numeral — drifts counter-scroll behind everything. */}
      <DrivenParallax
        progress={progress}
        distance={-70}
        className={`pointer-events-none absolute top-1/2 -z-10 hidden -translate-y-1/2 sm:block ${
          flip ? "right-0" : "left-0"
        }`}
      >
        <span className="select-none font-mono text-[16rem] font-bold leading-none text-white/[0.035]">
          {numeral}
        </span>
      </DrivenParallax>

      <div
        className={`flex flex-col items-center gap-10 lg:gap-16 ${
          flip ? "lg:flex-row-reverse" : "lg:flex-row"
        }`}
      >
        {/* Copy column. */}
        <div className="w-full lg:w-[38%]">
          <Reveal>
            <span className="zf-label mb-4">
              {numeral} · {chapter.label}
            </span>
            <h3 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {chapter.headline}
            </h3>
            <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
              {chapter.blurb}
            </p>
            <p className="mt-4 font-mono text-xs text-white/45">
              {count} {count === 1 ? "frame" : "frames"} in this family —
              rendering below
            </p>
          </Reveal>
        </div>

        {/* Specimen collage — live frames drifting at staggered rates. */}
        <div
          className={`relative flex w-full flex-wrap items-center gap-5 lg:w-[62%] ${
            flip ? "justify-start lg:-ml-4" : "justify-end lg:-mr-4"
          }`}
        >
          {chapter.specimens.map((s, i) => (
            <DrivenParallax
              key={s.frame}
              progress={progress}
              distance={s.drift}
              className="shrink-0"
            >
              <Reveal delay={i * 0.08} y={26}>
                <div
                  className={`glow-brand-soft ${s.className}`}
                  // The `h-*` in `className` sets the collage rhythm; this floor
                  // keeps that rhythm from sizing a specimen under its measured
                  // envelope, which clips it on the y-axis with no error.
                  style={{
                    minHeight: slotMinHeights[s.frame],
                    ...(s.tilt ? { rotate: `${s.tilt}deg` } : {}),
                  }}
                >
                  <LiveFrame
                    frame={s.frame}
                    config={s.config}
                    title={s.title}
                    className="h-full w-full"
                  />
                </div>
              </Reveal>
            </DrivenParallax>
          ))}
        </div>
      </div>
    </div>
  );
}

// The counts arrive as props from the server-component landing page — derived
// there from the real catalogue (allFrameMetas / FRAME_CATEGORIES), so they
// stay honest as frames land WITHOUT this client module importing the ~285
// Zod metas just to count them.
export function FramesShowcase({
  total,
  families,
  byFamily,
  slotMinHeights,
}: {
  /** Total frames in the catalogue. */
  total: number;
  /** Number of frame families (FRAME_CATEGORIES.length). */
  families: number;
  /** Frame count per family key. */
  byFamily: Record<string, number>;
  /** Per-specimen slot floor in px, keyed by frame name. */
  slotMinHeights: Record<string, number | undefined>;
}) {
  return (
    <section aria-label="The frame catalogue" className="overflow-x-clip">
      {/* Act intro — the giant count. */}
      <div className="mx-auto max-w-5xl px-6 pt-24 text-center sm:pt-32">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Those boards were composed from
          </h2>
        </Reveal>
      </div>
      <CountMoment total={total} />
      <div className="mx-auto max-w-2xl px-6 text-center">
        <Reveal>
          <p className="text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every frame below is the real component, rendering right now — not a
            screenshot. Hover one: treemaps, heatmaps, scatters, radial gauges
            and stacked areas, all on an in-house D3 chart layer with real
            tooltips. {sentenceCase(numberWord(families))} families; here are{" "}
            {numberWord(CHAPTERS.length)}.
          </p>
        </Reveal>
      </div>

      {/* The family chapters. */}
      <div className="mt-4 sm:mt-8">
        {CHAPTERS.map((c, i) => (
          <ChapterScene
            key={c.key}
            chapter={c}
            index={i}
            count={byFamily[c.key] ?? 0}
            slotMinHeights={slotMinHeights}
          />
        ))}
      </div>

      {/* Act outro — the long tail + catalogue CTA. */}
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-8 text-center sm:pt-12">
        <Reveal>
          <p className="text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            …plus on-chain cycle ratios, portfolios, decision journals,
            countdowns, calculators, headings, video — even idle games for when
            the market sleeps.
          </p>
          <Link
            href="/catalogue"
            className="glow-brand zf-cta mt-6 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
          >
            Browse all {total} frames — drag one around live →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
