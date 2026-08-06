"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { FRAME_CATEGORIES } from "@zframes/core";
import { allFrameMetas } from "@zframes/frames/schemas";
import { LiveFrame } from "@/app/lib/LiveFrame";
import { Parallax, Reveal, useViewportProgress } from "@/app/lib/motion";

// ── The frames chapter ──────────────────────────────────────────────────────
// The landing's second act: the vocabulary the agent composes from. The biggest
// frame families — traditional finance first (markets, macro & rates, filings,
// metals), then the crypto-native ones — each staged as a parallax collage of
// REAL live frames (LiveFrame →
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
    headline: "Equities and crypto on one tape.",
    blurb:
      "TSLA and NVDA candles streaming as equity perps over Hyperliquid HIP-3, the session clock beside them, and the whole crypto universe on the same free socket. Charts, volume profiles, tickers: the pulse of the tape, live.",
    specimens: [
      {
        frame: "price-chart",
        className: "w-[min(28rem,80vw)] h-72",
        drift: 22,
        tilt: -1.2,
      },
      {
        frame: "volume-profile",
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
    key: "macro",
    label: "Macro & Rates",
    headline: "The official numbers, unofficial speed.",
    blurb:
      "The Treasury yield curve, corporate credit spreads, the composition of the federal debt, the FX cross grid, and who actually showed up to the last auction. Primary sources — Treasury, FRED, the New York Fed — rendered like a terminal, not a press release.",
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
        frame: "treasury-debt-composition-area",
        className: "w-72 h-64 hidden sm:block",
        drift: 96,
        tilt: 1.8,
      },
      {
        frame: "fx-cross-heatmap",
        className: "w-72 h-56 hidden md:block",
        drift: 46,
        tilt: -1.2,
      },
      {
        frame: "treasury-auction-demand-scatter",
        className: "w-64 h-56 hidden lg:block",
        drift: 78,
        tilt: 1,
      },
    ],
  },
  {
    key: "equities",
    label: "Equities & Filings",
    headline: "Straight out of EDGAR.",
    blurb:
      "What a company actually filed and how the street is positioned against it — the SEC's own submissions feed, the mix of forms behind it, and FINRA's daily reported short-sale volume. Public records, read at terminal speed.",
    // Cast off the CHEAP SEC endpoint on purpose. `filings-feed`/`filings-mix`
    // read EDGAR's submissions JSON (CORS-open, small); `fundamentals` and
    // `capital-structure-bars` read the companyfacts XBRL blob, which is tens of
    // megabytes for a large-cap and has to cross the proxy's 16 MB cap. Fine on
    // a board someone chose to build; not fine on the front page.
    specimens: [
      {
        frame: "filings-feed",
        className: "w-[min(26rem,80vw)] h-72",
        drift: 24,
        tilt: 1.2,
      },
      {
        frame: "short-volume-bars",
        className: "w-80 h-56 hidden sm:block",
        drift: 68,
        tilt: -1.4,
      },
      {
        frame: "filings-mix",
        className: "w-60 h-56 hidden sm:block",
        drift: 98,
        tilt: -1.8,
      },
    ],
  },
  {
    key: "metals",
    label: "Metals & Commodities",
    headline: "Gold, back to 1968.",
    blurb:
      "The LBMA's own London fix files — the deepest price history in the fleet — plus live spot, month-by-year seasonality, and the CFTC's weekly futures positioning. Half a century of prints, no key, no signup.",
    // Two of these pull LBMA fix history (~150 KB gzipped per metal, 6 h TTL and
    // deliberately not persisted), so the chapter costs about one image. Keep it
    // to two history-backed cards.
    specimens: [
      {
        frame: "metal-price-chart",
        className: "w-[min(28rem,80vw)] h-64",
        drift: 22,
        tilt: -1.4,
      },
      {
        frame: "metal-cot-net",
        className: "w-80 h-56 hidden sm:block",
        drift: 66,
        tilt: 1.4,
      },
      {
        frame: "metal-seasonality",
        className: "w-72 h-56 hidden sm:block",
        drift: 98,
        tilt: 1.8,
      },
      {
        frame: "metals-board",
        className: "w-64 h-48 hidden md:block",
        drift: 44,
        tilt: -1,
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
// none. Current batch: Nasdaq and Cboe — the equity deep-dive family.
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
const SPOTLIGHT_SOURCES = ["Nasdaq", "Cboe"];

// Counts the frames BUILT on the new sources, by matching only a frame's
// PRIMARY credit. The looser "any credit" test over-counted this batch: adding
// Nasdaq as an `ohlcv` venue also credited it on five pre-existing price frames
// (price-chart, price-events, return-calendar, return-distribution,
// rsi-momentum), which merely gained it as a pinnable option and are not new.
// `source` is still one credit OR several (rates-board genuinely reads NY Fed
// AND Treasury), so normalise before reading the first.
const spotlightFrameCount = allFrameMetas.filter((meta) => {
  const credits = meta.source
    ? Array.isArray(meta.source)
      ? meta.source
      : [meta.source]
    : [];
  return credits.length > 0 && SPOTLIGHT_SOURCES.includes(credits[0].name);
}).length;

// The lead. A decade of reported revenue, stitched across the XBRL tag NVIDIA
// switched to mid-history — the card that shows why reading filings properly is
// a framework problem, not a chart problem.
const SPOTLIGHT_LEAD: Highlight = {
  frame: "financials-trend",
  config: { symbol: "NVDA", metric: "revenue", cadence: "annual" },
  note: "Eighteen years of reported revenue, straight from SEC XBRL. Issuers quietly change the tag they file a line under — NVIDIA's revenue moves tag after FY2022 — so a naive series just stops in 2022 and looks like an outage. This one merges the whole chain and tells you it did.",
  span: "lg:col-span-5",
  height: "h-[26rem]",
};

const SPOTLIGHT: Highlight[] = [
  {
    frame: "equity-options-smile",
    config: { symbol: "NVDA" },
    note: "Implied volatility across strikes at one expiry, calls against puts. The downside wing sitting higher is the market paying up for crash protection — and it is a free, delayed Cboe chain, not a terminal subscription.",
    span: "lg:col-span-7",
    height: "h-[26rem]",
  },
  {
    frame: "valuation-multiples",
    config: { symbol: "NVDA" },
    note: "P/E, P/S and P/B derived in front of you, each labelled with the inputs it came from. Nothing keyless publishes these — and a multiple with a missing or negative denominator says so instead of printing a number.",
    span: "lg:col-span-4",
    height: "h-[22rem]",
  },
  {
    frame: "earnings-surprise",
    config: { symbol: "NVDA" },
    note: "Reported EPS against the consensus that preceded it, quarter by quarter. A steady beat rate is a different signal from one blowout, and this is the chart that tells them apart.",
    span: "lg:col-span-4",
    height: "h-[22rem]",
  },
  {
    frame: "margin-trend",
    config: { symbol: "NVDA" },
    note: "Gross, operating and net margin across the reported years — the quickest read on whether a growth story is also a business.",
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
            The business behind the ticker.
          </h3>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Two more keyless sources — Nasdaq and Cboe — and{" "}
            {/* The whole clause lives in ONE expression, ending on a comma. A
                JSX text node that spans lines has its LEADING whitespace
                trimmed, so `{count} frames` renders "thirteenframes" and
                `{...} built` renders "framesbuilt" — the space has to sit
                inside the expression or in an explicit {" "}. */}
            {`${numberWord(spotlightFrameCount)} frames built over them`}, plus
            a decade of reported financials read straight out of SEC XBRL.
            Valuation multiples, margins, earnings against consensus, and real
            listed option chains with the greeks. Still no key, still no signup:
            a company&rsquo;s own numbers were always public.
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
            now — not a screenshot, not a mock. Hover one: treemaps, heatmaps,
            scatters, radial gauges and stacked areas, all on an in-house D3
            chart layer with real tooltips.{" "}
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
