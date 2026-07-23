"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { allFrameMetas } from "@zframes/frames/schemas";
import { LiveFrame } from "@/app/lib/LiveFrame";
import { Parallax, Reveal, useViewportProgress } from "@/app/lib/motion";

// ── The frames chapter ──────────────────────────────────────────────────────
// The landing's second act: the vocabulary the agent composes from. Six frame
// families, each staged as a parallax collage of REAL live frames (LiveFrame →
// the runtime's own FrameContent on shared providers) drifting at different
// rates around the family's copy, with a ghosted chapter numeral moving
// counter-scroll behind. Every specimen is streaming real data — the section
// doesn't describe the catalogue, it IS the catalogue.

type Specimen = {
  frame: string;
  /** Extra config merged over schema defaults. */
  config?: Record<string, unknown>;
  title?: string;
  /** Tailwind sizing for the collage slot. */
  className: string;
  /** Parallax drift distance — vary per specimen for layered depth. */
  drift: number;
  /** Collage tilt, degrees. Subtle: the cards are real UI, not stickers. */
  tilt?: number;
};

type Chapter = {
  key: string;
  label: string;
  headline: string;
  blurb: string;
  specimens: Specimen[];
};

// Casting notes: keyless, non-proxied sources wherever possible (Hyperliquid,
// CoinGecko, DeFiLlama, mempool.space, Deribit, alternative.me, Frankfurter) so
// every specimen streams for every visitor; sized/tilted for collage rhythm.
const CHAPTERS: Chapter[] = [
  {
    key: "markets",
    label: "Prices & Markets",
    headline: "Stocks first. Crypto alongside.",
    blurb:
      "Live equity perps over Hyperliquid HIP-3 — TSLA and NVDA candles streaming next to the entire crypto universe, over one free socket. Charts, tickers, movers: the pulse of the tape.",
    specimens: [
      {
        frame: "price-chart",
        className: "w-[min(34rem,72vw)] h-72 sm:h-80",
        drift: 26,
        tilt: -1.2,
      },
      {
        frame: "top-movers",
        className: "w-64 h-80 hidden sm:block",
        drift: 78,
        tilt: 1.6,
      },
    ],
  },
  {
    key: "crypto",
    label: "Crypto & On-chain",
    headline: "The whole chain economy, mapped.",
    blurb:
      "Market caps as living treemaps, TVL across every protocol, DEX volume, dominance — DeFiLlama and CoinGecko, no keys, cached politely.",
    specimens: [
      {
        frame: "market-cap-treemap",
        className: "w-[min(32rem,72vw)] h-80",
        drift: 30,
        tilt: 1.2,
      },
      {
        frame: "bitcoin-dominance",
        className: "w-64 h-48 hidden sm:block",
        drift: 90,
        tilt: -1.8,
      },
    ],
  },
  {
    key: "bitcoin",
    label: "Bitcoin Network",
    headline: "Chain health, block by block.",
    blurb:
      "Hashrate, mempool depth, the live fee curve, difficulty epochs, Lightning — mempool.space wired straight into cards.",
    specimens: [
      {
        frame: "btc-hashrate",
        className: "w-[min(30rem,72vw)] h-64",
        drift: 24,
        tilt: -1.4,
      },
      {
        frame: "mempool-fee-curve",
        className: "w-72 h-56 hidden sm:block",
        drift: 82,
        tilt: 1.4,
      },
    ],
  },
  {
    key: "derivatives",
    label: "Derivatives & Options",
    headline: "Where leverage lives.",
    blurb:
      "Funding rates across venues, open interest, put/call positioning and volatility off Deribit's public feed — the positioning picture under the price.",
    specimens: [
      {
        frame: "funding-rate-chart",
        className: "w-[min(32rem,72vw)] h-72",
        drift: 28,
        tilt: 1.2,
      },
      {
        frame: "put-call-gauge",
        className: "w-60 h-52 hidden sm:block",
        drift: 86,
        tilt: -1.6,
      },
    ],
  },
  {
    key: "macro",
    label: "Macro & Rates",
    headline: "The official numbers, unofficial speed.",
    blurb:
      "Treasury yield curve, reference rates, FX crosses, inflation and jobs — straight from the primary sources, rendered like a terminal, not a press release.",
    specimens: [
      {
        frame: "yield-curve",
        className: "w-[min(32rem,72vw)] h-72",
        drift: 26,
        tilt: -1.2,
      },
      {
        frame: "dxy-chart",
        className: "w-64 h-52 hidden sm:block",
        drift: 80,
        tilt: 1.8,
      },
    ],
  },
  {
    key: "sentiment",
    label: "Sentiment & News",
    headline: "What the crowd is feeling.",
    blurb:
      "Fear & greed over time, live gauges, streaming headlines — the mood ring for the tape, refreshed all day.",
    specimens: [
      {
        frame: "fear-greed-chart",
        className: "w-[min(30rem,72vw)] h-64",
        drift: 30,
        tilt: 1.4,
      },
      {
        frame: "news-feed",
        className: "w-72 h-80 hidden sm:block",
        drift: 84,
        tilt: -1.4,
      },
    ],
  },
];

// Frames per family, from the real catalogue — the numbers stay honest as
// frames land.
function familyCount(key: string) {
  return allFrameMetas.filter((m) => m.category === key).length;
}

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
          live frames
        </span>
      </motion.div>
    </div>
  );
}

function ChapterScene({ chapter, index }: { chapter: Chapter; index: number }) {
  const flip = index % 2 === 1; // alternate copy side for scroll rhythm
  const count = familyCount(chapter.key);
  const numeral = String(index + 1).padStart(2, "0");

  return (
    <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-24">
      {/* Ghost chapter numeral — drifts counter-scroll behind everything. */}
      <Parallax
        distance={-70}
        className={`pointer-events-none absolute top-1/2 -z-10 hidden -translate-y-1/2 sm:block ${
          flip ? "right-0" : "left-0"
        }`}
      >
        <span className="select-none font-mono text-[16rem] font-bold leading-none text-white/[0.035]">
          {numeral}
        </span>
      </Parallax>

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
              streaming live below
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
            <Parallax key={s.frame} distance={s.drift} className="shrink-0">
              <Reveal delay={i * 0.08} y={26}>
                <div
                  className={`glow-brand-soft ${s.className}`}
                  style={s.tilt ? { rotate: `${s.tilt}deg` } : undefined}
                >
                  <LiveFrame
                    frame={s.frame}
                    config={s.config}
                    title={s.title}
                    className="h-full w-full"
                  />
                </div>
              </Reveal>
            </Parallax>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FramesShowcase() {
  const total = allFrameMetas.length;

  return (
    <section aria-label="The frame catalogue" className="overflow-x-clip">
      {/* Act intro — kicker + the giant count. */}
      <div className="mx-auto max-w-5xl px-6 pt-24 text-center sm:pt-32">
        <Reveal>
          <span className="zf-label mb-3 justify-center">The vocabulary</span>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Your agent composes from
          </h2>
        </Reveal>
      </div>
      <CountMoment total={total} />
      <div className="mx-auto max-w-2xl px-6 text-center">
        <Reveal>
          <p className="text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every frame below is the real component, rendering live data right
            now — not a screenshot, not a mock. Twelve families; here are six.
          </p>
        </Reveal>
      </div>

      {/* The six family chapters. */}
      <div className="mt-4 sm:mt-8">
        {CHAPTERS.map((c, i) => (
          <ChapterScene key={c.key} chapter={c} index={i} />
        ))}
      </div>

      {/* Act outro — the long tail + catalogue CTA. */}
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-8 text-center sm:pt-12">
        <Reveal>
          <p className="text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            …plus portfolios, decision journals, countdowns, calculators,
            headings, video — even idle games for when the market sleeps.
          </p>
          <Link
            href="/catalogue"
            className="zf-press mt-6 inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
          >
            Browse all {total} frames — drag one around live →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
