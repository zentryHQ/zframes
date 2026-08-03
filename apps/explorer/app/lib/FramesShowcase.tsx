"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { FRAME_CATEGORIES } from "@zframes/core";
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
//
// It closes on a SPOTLIGHT band (see below) — the newest batch of frames named
// outright, because a raw catalogue total tells a visitor nothing about which
// frames are worth looking at first.

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

// Casting notes: keyless sources, browser-direct wherever possible (Hyperliquid,
// CoinGecko, DeFiLlama, mempool.space, Deribit, alternative.me, Frankfurter,
// Zillow) so every specimen streams for every visitor; sized/tilted for collage
// rhythm. The proxied official sources (FRED, Treasury, FHFA) are fine here too
// — the explorer ships the relay at /api/zframes-proxy, edge-cached per host.
//
// One cost worth knowing before adding a specimen: Zillow publishes ZHVI as a
// single uncompressed ~4.4 MB CSV with no per-region endpoint, so the FIRST
// ZHVI card on the page pays that download and every later one is free (the
// provider caches the parsed table under a constant key). Cast Zillow freely,
// but know the first one is not cheap.
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
        className: "w-[min(28rem,80vw)] h-72",
        drift: 22,
        tilt: -1.2,
      },
      {
        frame: "top-movers",
        className: "w-60 h-72 hidden sm:block",
        drift: 64,
        tilt: 1.6,
      },
      {
        frame: "market-hours",
        className: "w-72 h-60 hidden sm:block",
        drift: 96,
        tilt: 1.2,
      },
      {
        frame: "price-ticker",
        className: "w-[min(26rem,80vw)] h-24 hidden md:block",
        drift: 44,
        tilt: -0.8,
      },
    ],
  },
  {
    key: "crypto",
    label: "Crypto & On-chain",
    headline: "The whole chain economy, mapped.",
    blurb:
      "Market caps as living treemaps, TVL across every protocol, trending coins, dominance — DeFiLlama and CoinGecko, no keys, cached politely.",
    specimens: [
      {
        frame: "market-cap-treemap",
        className: "w-[min(28rem,80vw)] h-72",
        drift: 26,
        tilt: 1.2,
      },
      {
        frame: "trending-coins",
        className: "w-60 h-72 hidden sm:block",
        drift: 70,
        tilt: -1.4,
      },
      {
        frame: "bitcoin-dominance",
        className: "w-64 h-48 hidden sm:block",
        drift: 98,
        tilt: -1.8,
      },
      {
        frame: "protocol-tvl-chart",
        className: "w-80 h-56 hidden md:block",
        drift: 48,
        tilt: 1.6,
      },
    ],
  },
  {
    key: "bitcoin",
    label: "Bitcoin Network",
    headline: "Chain health, block by block.",
    blurb:
      "Hashrate, mempool depth, the live fee curve, fresh blocks, difficulty epochs, Lightning — mempool.space wired straight into cards.",
    specimens: [
      {
        frame: "btc-hashrate",
        className: "w-[min(26rem,80vw)] h-64",
        drift: 22,
        tilt: -1.4,
      },
      {
        frame: "mempool-fee-curve",
        className: "w-72 h-56 hidden sm:block",
        drift: 68,
        tilt: 1.4,
      },
      {
        frame: "btc-fees",
        className: "w-56 h-44 hidden sm:block",
        drift: 100,
        tilt: 1.8,
      },
      {
        frame: "btc-blocks",
        className: "w-80 h-48 hidden md:block",
        drift: 46,
        tilt: -1,
      },
    ],
  },
  {
    key: "derivatives",
    label: "Derivatives & Options",
    headline: "Where leverage lives.",
    blurb:
      "Funding rates across venues, open interest, strike ladders, put/call positioning and volatility off Deribit's public feed — the positioning picture under the price.",
    specimens: [
      {
        frame: "funding-rate-chart",
        className: "w-[min(28rem,80vw)] h-64",
        drift: 24,
        tilt: 1.2,
      },
      {
        frame: "options-oi-strike",
        className: "w-80 h-56 hidden sm:block",
        drift: 66,
        tilt: -1.4,
      },
      {
        frame: "put-call-gauge",
        className: "w-56 h-48 hidden sm:block",
        drift: 98,
        tilt: -1.6,
      },
      {
        frame: "open-interest",
        className: "w-64 h-28 hidden md:block",
        drift: 44,
        tilt: 1.6,
      },
    ],
  },
  {
    key: "macro",
    label: "Macro & Rates",
    headline: "The official numbers, unofficial speed.",
    blurb:
      "The Treasury yield curve, corporate credit spreads, FX crosses — and what a home actually costs, in dollars. The Fed's own series, Zillow's and the FHFA's, straight from the primary sources and rendered like a terminal, not a press release.",
    specimens: [
      {
        frame: "yield-curve",
        className: "w-[min(28rem,80vw)] h-64",
        drift: 22,
        tilt: -1.2,
      },
      {
        frame: "credit-spread-chart",
        className: "w-80 h-56 hidden sm:block",
        drift: 64,
        tilt: 1.4,
      },
      {
        frame: "metro-home-values",
        className: "w-72 h-64 hidden sm:block",
        drift: 96,
        tilt: 1.8,
      },
      {
        frame: "fx-board",
        className: "w-64 h-52 hidden md:block",
        drift: 46,
        tilt: -1.2,
      },
    ],
  },
  {
    key: "sentiment",
    label: "Sentiment & News",
    headline: "What the crowd is feeling.",
    blurb:
      "Fear & greed over time, live mood gauges, streaming headlines — the mood ring for the tape, refreshed all day.",
    specimens: [
      {
        frame: "fear-greed-chart",
        className: "w-[min(26rem,80vw)] h-64",
        drift: 24,
        tilt: 1.4,
      },
      {
        frame: "news-feed",
        className: "w-72 h-80 hidden sm:block",
        drift: 66,
        tilt: -1.4,
      },
      {
        frame: "sentiment-gauge",
        className: "w-56 h-48 hidden sm:block",
        drift: 96,
        tilt: 1.8,
      },
    ],
  },
];

// Frames per family, from the real catalogue — the numbers stay honest as
// frames land.
function familyCount(key: string) {
  return allFrameMetas.filter((m) => m.category === key).length;
}

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

// ── The spotlight ───────────────────────────────────────────────────────────
// The one hand-cast list in this file; every count around it is derived. It
// exists because a catalogue total is a fact, not an argument — when a batch of
// providers lands, someone has to say WHICH of the new frames is worth a look.
//
// Re-cast it when the next batch ships. A stale "just landed" is worse than
// none. Current batch: FRED, Zillow Research and the FHFA.
type Highlight = {
  frame: string;
  /** Extra config merged over schema defaults. */
  config?: Record<string, unknown>;
  /** Why this frame earns its slot — printed under the card. */
  note: string;
  /** Column span in the band's 12-column grid, at lg and up. */
  span: string;
  /**
   * Card height. Unlike the collage above — where a specimen is scenery and a
   * cropped axis reads as depth — these cards are the argument, so they get
   * their meta's natural `layout.h`: 26rem ≈ h:4 (4×96px rows + 3×12px gaps),
   * 22rem ≈ h:3.5. Anything shorter clips the x-axis labels off a chart and
   * drops the sub-header off a stat card.
   */
  height: string;
};

/**
 * The display names of the sources this batch introduced, spelled exactly as
 * their frame metas credit them (`SOURCES` in @zframes/frames/schemas). The
 * headline's frame count is filtered off this rather than typed, so it tracks
 * every later frame built over the same providers.
 */
const SPOTLIGHT_SOURCES = ["FRED", "Zillow Research", "FHFA"];

// `source` is one credit OR several (rates-board genuinely reads NY Fed AND
// Treasury), so normalise before matching — a cross-provider frame must count
// once, not zero times.
const spotlightFrameCount = allFrameMetas.filter((meta) => {
  const credits = meta.source
    ? Array.isArray(meta.source)
      ? meta.source
      : [meta.source]
    : [];
  return credits.some((c) => SPOTLIGHT_SOURCES.includes(c.name));
}).length;

// The lead. Mortgage Payment is the only frame in the catalogue that needs TWO
// providers to say anything at all, which is the whole argument for a frame
// framework over one more chart widget.
const SPOTLIGHT_LEAD: Highlight = {
  frame: "mortgage-payment",
  config: { region: "Austin, TX" },
  note: "Zillow's typical home value priced at FRED's live 30-year rate. Two providers, one card: the index only says prices rose, the rate only says borrowing got dearer, and neither one answers whether a buyer can actually pay.",
  span: "lg:col-span-5",
  height: "h-[26rem]",
};

const SPOTLIGHT: Highlight[] = [
  {
    frame: "index-drawdown",
    note: "How far an index sits below its own record, over time. Every trough is a bear market; on the Nasdaq's full history the dot-com bottom reads −78%.",
    span: "lg:col-span-7",
    height: "h-[26rem]",
  },
  {
    frame: "vix-gauge",
    note: "The VIX as a regime — calm, elevated, panic — rather than a number you have to remember the scale for.",
    span: "lg:col-span-4",
    height: "h-[22rem]",
  },
  {
    frame: "regional-home-price-bars",
    note: "The FHFA's own repeat-sales index, state by state: which housing markets are still rising, and which have turned.",
    span: "lg:col-span-4",
    height: "h-[22rem]",
  },
  {
    frame: "home-value-scatter",
    note: "Every metro plotted by price against pace, so expensive-and-cooling separates from cheap-and-heating.",
    span: "lg:col-span-4",
    height: "h-[22rem]",
  },
];

function HighlightCard({
  item,
  index,
  lead = false,
}: {
  item: Highlight;
  index: number;
  lead?: boolean;
}) {
  return (
    <Reveal
      delay={index * 0.06}
      y={22}
      className={`col-span-1 ${item.span} flex flex-col`}
    >
      <div
        className={`${item.height} ${lead ? "glow-brand" : "glow-brand-soft"}`}
      >
        <LiveFrame frame={item.frame} config={item.config} className="h-full" />
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/60">
        {lead && (
          <span className="mr-1.5 font-semibold text-indigo-200">
            The pick of the batch —
          </span>
        )}
        {item.note}
      </p>
    </Reveal>
  );
}

function SpotlightBand() {
  return (
    <section
      aria-label="Newest frames"
      className="mx-auto max-w-7xl px-6 py-10 sm:py-14"
    >
      <div className="zf-surface p-6 sm:p-10">
        <Reveal>
          <span className="zf-label mb-4">Just landed</span>
          <h3 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Housing, credit, and the long index tape.
          </h3>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Three more keyless sources — the St.&nbsp;Louis Fed&rsquo;s FRED,
            Zillow Research and the FHFA — and {numberWord(spotlightFrameCount)}{" "}
            frames built over them. House prices in dollars rather than index
            points, credit spreads, mortgage rates back to 1971. Still no key,
            still no signup: the official numbers were always public.
          </p>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-8 lg:grid-cols-12">
          <HighlightCard item={SPOTLIGHT_LEAD} index={0} lead />
          {SPOTLIGHT.map((item, i) => (
            <HighlightCard key={item.frame} item={item} index={i + 1} />
          ))}
        </div>
      </div>
    </section>
  );
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
    <div className="relative mx-auto max-w-7xl px-6 py-12 sm:py-16">
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
            Those boards were composed from
          </h2>
        </Reveal>
      </div>
      <CountMoment total={total} />
      <div className="mx-auto max-w-2xl px-6 text-center">
        <Reveal>
          <p className="text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every frame below is the real component, rendering live data right
            now — not a screenshot, not a mock.{" "}
            {sentenceCase(numberWord(FRAME_CATEGORIES.length))} families; here
            are {numberWord(CHAPTERS.length)}.
          </p>
        </Reveal>
      </div>

      {/* The family chapters. */}
      <div className="mt-4 sm:mt-8">
        {CHAPTERS.map((c, i) => (
          <ChapterScene key={c.key} chapter={c} index={i} />
        ))}
      </div>

      {/* The newest batch, called out by name — the one editorial beat in a
          section that is otherwise a straight read of the registry. */}
      <SpotlightBand />

      {/* Act outro — the long tail + catalogue CTA. */}
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-8 text-center sm:pt-12">
        <Reveal>
          <p className="text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            …plus metals and the London fix, on-chain cycle ratios, portfolios,
            decision journals, countdowns, calculators, headings, video — even
            idle games for when the market sleeps.
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
