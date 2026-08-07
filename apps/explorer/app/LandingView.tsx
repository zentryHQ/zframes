"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import Link from "next/link";
import { allFrameMetas } from "@zframes/frames/schemas";
import type { BoardSummary } from "@/app/lib/board-summary";
import { CopyCommand } from "@/app/lib/CopyCommand";
import { FAQ } from "@/app/lib/faq";
import { KEYLESS_PROVIDER_COUNT } from "@/app/lib/frames";
import { FramesShowcase } from "@/app/lib/FramesShowcase";
import { LiveBoardFrame } from "@/app/lib/LiveBoardFrame";
import { LiveFrame, LiveFrameStyles } from "@/app/lib/LiveFrame";
import {
  FocusPanel,
  focusT,
  MouseParallax,
  Parallax,
  Reveal,
  ScrollExit,
  useFocusDwellProgress,
  useSectionProgress,
} from "@/app/lib/motion";
import { SectionHeading } from "@/app/lib/SectionHeading";

// The focus-gallery's shared sticky box sits below the header (57px) with a
// little air. Every board renders full inside this box; scale/opacity animate.
const FOCUS_STICKY_TOP = 72;
// Scroll depth (vh) allotted to each board's slot. Generous on purpose: the dwell
// band is a fixed fraction of the slot, so this is the dial that decides how long
// a board holds focus — and therefore how gently its own frames scroll past.
const FOCUS_SLOT_VH = 300;

// Gallery home — the public front door as a five-act scroll narrative:
//
//   I    Hero        the promise, staged inside a floating cluster of REAL
//                    live frames (LiveFrame → the runtime's own components)
//   II   Proof       full boards streaming live — the sticky card-stack of
//                    embedded dashboards, straight after the promise
//   III  Vocabulary  the frame catalogue those boards are composed from, as
//                    six parallax chapters of live specimens (FramesShowcase)
//   IV   How         install → describe → own, ending on the command
//   V    Why         the value grid + final CTA
//
// `motion` drives only scroll/pointer orchestration (parallax, scrubs,
// whileInView reveals); hover/press micro-interactions stay CSS (globals.css).
// Client, but copy still SSRs (client components render on the server first).

// The hero's floating specimens — cast for silhouette variety (streaming line,
// gauge, curve, stacked area, stat) and instant keyless data. Desktop-mostly;
// each gets its own parallax depth (mouse strength + scroll drift) and idle-bob
// phase so the cluster reads as a suspended volume, not a wallpaper.
//
// Casting is TRADITIONAL FINANCE first: equity perps streaming live, the
// Treasury curve, corporate credit spreads, the VIX, the debt stack, gold. One
// crypto card (the BTC/ETH ticker) keeps both asset classes visibly present —
// the promise is "stocks and crypto", and the crypto families get three whole
// chapters of their own further down the page.
const HERO_FLOATERS: {
  frame: string;
  config?: Record<string, unknown>;
  /** Optional card-title override (e.g. the tracked wallet's name). */
  title?: string;
  className: string;
  pos: string;
  mouse: number;
  scroll: number;
  tilt: number;
  delay: string;
}[] = [
  {
    frame: "price-liveline",
    // The signature frame gets the biggest slot — three HIP-3 equity perps
    // racing on one normalized axis, ticking off a single streamed socket. This
    // is the "live market" half of the promise, in one card.
    config: { symbols: ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"] },
    className: "w-[26rem] h-60",
    pos: "left-[1%] top-[13%] hidden lg:block",
    mouse: 18,
    scroll: 42,
    tilt: -2.2,
    delay: "0s",
  },
  {
    // The VIX as a regime band rather than a bare number — the one gauge
    // silhouette in the cluster, and instantly legible as a markets card.
    frame: "vix-gauge",
    className: "w-56 h-52",
    pos: "right-[20%] top-[3%] hidden xl:block",
    mouse: -20,
    scroll: 70,
    tilt: -1.4,
    delay: "-5s",
  },
  {
    // The crypto presence: both asset classes on screen at once, without the
    // hero turning into a crypto board.
    frame: "price-ticker",
    config: { symbols: ["BTC", "ETH"] },
    className: "w-72 h-28",
    pos: "right-[2%] top-[47%] hidden xl:block",
    mouse: 16,
    scroll: 48,
    tilt: 1,
    delay: "-2.8s",
  },
  {
    // Visible earliest (md), so the smallest desktop still gets a real chart:
    // the gold/silver ratio off the LBMA's own London fix series.
    frame: "gold-silver-ratio",
    className: "w-56 h-52",
    pos: "right-[3%] top-[13%] hidden md:block",
    mouse: -14,
    scroll: 74,
    tilt: 2,
    delay: "-2.2s",
  },
  {
    frame: "index-level",
    className: "w-52 h-32",
    pos: "left-[7%] bottom-[17%] hidden lg:block",
    mouse: -22,
    scroll: 92,
    tilt: 1.6,
    delay: "-4.1s",
  },
  {
    // High-yield vs investment-grade OAS on one grid — two FRED series fetched
    // in a single call, so the pair is aligned by construction.
    frame: "credit-spread-chart",
    className: "w-80 h-44",
    pos: "right-[4%] bottom-[14%] hidden lg:block",
    mouse: 12,
    scroll: 56,
    tilt: -1.6,
    delay: "-1.4s",
  },
  {
    frame: "yield-curve",
    className: "w-64 h-44",
    pos: "left-[20%] top-[4%] hidden xl:block",
    mouse: 26,
    scroll: 64,
    tilt: 1.2,
    delay: "-3.2s",
  },
  {
    // The debt stack as a stacked area — the densest silhouette in the cluster,
    // and a shape no crypto card produces.
    frame: "treasury-debt-composition-area",
    className: "w-80 h-56",
    pos: "left-[2%] top-[44%] hidden lg:block",
    mouse: 20,
    scroll: 58,
    tilt: 1.8,
    delay: "-3.6s",
  },
];

/**
 * The landing page's whole client tree. Split out of `page.tsx` on 2026-08-05:
 * the showcase boards moved from a static module into the `dashboards` table, and
 * a `"use client"` component cannot await a query — so `page.tsx` is now a thin
 * server component that fetches them and hands them down as `boards`.
 *
 * They arrive as {@link BoardSummary} rather than full rows on purpose: the specs
 * would be tens of kilobytes of client payload for data the iframes fetch anyway.
 */
export default function GalleryHome({ boards }: { boards: BoardSummary[] }) {
  const frameCount = allFrameMetas.length;
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
    setVisibleRange((v) => (v[0] === lo && v[1] === hi ? v : [lo, hi]));
  });

  return (
    <main className="overflow-x-clip">
      <LiveFrameStyles />

      {/* ── Act I · Hero ─────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[92svh] flex-col justify-center px-6 pb-16 pt-10">
        {/* Backdrop glow — drifts slower than the page for depth. */}
        <Parallax
          distance={90}
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[620px] max-w-4xl"
        >
          <div className="h-full w-full bg-[image:radial-gradient(52%_60%_at_50%_30%,hsla(258,92%,62%,0.32),transparent_70%)]" />
        </Parallax>

        {/* The floating live-frame cluster — the product itself, orbiting the
            promise. Sits behind the copy (z-0 vs z-10), so it can never block a
            CTA. The container stays `pointer-events-none` on purpose and each
            frame re-enables its own hitbox (LiveFrame), which is what keeps the
            EMPTY space between cards click-through while the charts themselves
            respond to the mouse. */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          aria-hidden="true"
        >
          {HERO_FLOATERS.map((f) => (
            <MouseParallax
              key={f.frame}
              strength={f.mouse}
              className={`absolute ${f.pos}`}
            >
              <Parallax distance={f.scroll}>
                <div
                  className="animate-float"
                  style={{ animationDelay: f.delay }}
                >
                  <div
                    className={`glow-brand-soft opacity-90 ${f.className}`}
                    style={{ rotate: `${f.tilt}deg` }}
                  >
                    <LiveFrame
                      frame={f.frame}
                      config={f.config}
                      title={f.title}
                    />
                  </div>
                </div>
              </Parallax>
            </MouseParallax>
          ))}
        </div>

        {/* The promise. Scrubs out (fade + rise + slight shrink) on scroll so
            the hand-off to Act II reads as one camera move. */}
        <ScrollExit className="relative z-10 mx-auto max-w-3xl text-center">
          <span className="animate-fade-up zf-label justify-center">
            Live market terminals · agent-built · free &amp; open source
          </span>
          <h1 className="animate-fade-up mt-5 text-balance text-5xl font-bold leading-[1.04] tracking-tight text-white [animation-delay:60ms] sm:text-7xl">
            Describe your dashboard.
            <br className="hidden sm:block" />{" "}
            <span className="bg-gradient-to-r from-indigo-200 via-violet-200 to-indigo-300 bg-clip-text text-transparent">
              An agent builds it.
            </span>
          </h1>

          <p className="animate-fade-up mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/75 [animation-delay:120ms] sm:text-lg">
            Install a skill, say what you want to watch, and your coding agent
            writes a live{" "}
            <code className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[0.85em] text-indigo-200">
              dashboard.json
            </code>{" "}
            and serves it with real data — stocks and crypto, free and open
            source, sharper every day.
          </p>

          <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
            <Link
              href="#build"
              className="glow-brand zf-cta rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg"
            >
              Build your own dashboard
            </Link>
            <Link
              href="/catalogue"
              className="zf-press rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
            >
              Explore {frameCount} frames →
            </Link>
          </div>

          {/* Licence + price, stated plainly right under the CTAs — the two
              things a visitor most often has to go hunting for. The repo link
              is the proof, so the claim is one click from being checked. */}
          <div className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-white/55 [animation-delay:210ms]">
            <a
              href="https://github.com/zentryhq/zframes"
              target="_blank"
              rel="noreferrer"
              className="zf-press inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3 py-1 transition-colors hover:border-white/30 hover:text-white"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              Open source · Apache-2.0
            </a>
            <span className="rounded-full border border-white/[0.12] px-3 py-1">
              Free — no account, no API keys
            </span>
          </div>

          {/* The real entry point (README §Quickstart). */}
          <div className="animate-fade-up mt-9 flex flex-col items-center gap-2.5 [animation-delay:240ms]">
            <span className="text-xs uppercase tracking-widest text-white/55">
              Install in your agent, then just talk
            </span>
            <CopyCommand command="npx skills add zentryhq/zframes" />
            <span className="font-mono text-xs text-white/55">
              <span className="text-indigo-300">/zframes</span> build me a TSLA
              + NVDA terminal with funding &amp; fear-greed
            </span>
          </div>
        </ScrollExit>
      </section>

      {/* ── Act II · Proof — full boards, streaming ──────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-2 pt-16 text-center">
        <Reveal>
          <span className="zf-label mb-3 justify-center">
            Live, not screenshots
          </span>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Real boards. Real data. Zero keys.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every board here is rendering live right now, on the same keyless
            feeds your generated terminal will run on. Keep scrolling; open any
            one.
          </p>
        </Reveal>
      </section>

      {/* Focus gallery — three boards, one per asset class (bullion, equities,
          crypto). Each grows from small into a full, un-clipped view, DWELLS
          there long enough for its own content to scroll through the frame (so a
          board taller than the viewport is still seen whole), then shrinks and
          fades as the next grows up in its place. Under reduced motion: a plain
          vertical list, no scrub. */}
      {/* No boards → render no showcase at all. Reachable now that the boards
          come from a query: an unseeded or unreachable database used to be
          impossible (they were compiled in). An empty sticky container would
          otherwise be 30vh of blank scroll with nothing pinned inside it. */}
      {boards.length === 0 ? null : reduced ? (
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
      ) : (
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
              />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-6 pb-8 pt-12 text-center">
        <Reveal>
          <Link
            href="/gallery"
            className="glow-brand zf-cta inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
          >
            See every board in the gallery →
          </Link>
        </Reveal>
      </section>

      {/* ── Act III · The vocabulary — frames, live, by family ───────────── */}
      <FramesShowcase />

      {/* ── Act IV · How — three beats to your own terminal ──────────────── */}
      <section id="build" className="mx-auto max-w-7xl px-6 pt-24">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Three beats to your own terminal"
            description="No repo to clone, no builder UI to learn. Your agent does the building; you own the artifact."
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StepCard
            index={0}
            step="01"
            title="Install the skill"
            body="One command teaches your coding agent — Claude Code, Cursor, Codex — how to build zframes terminals."
            code="npx skills add zentryhq/zframes"
          />
          <StepCard
            index={1}
            step="02"
            title="Describe what you watch"
            body="“TSLA and NVDA, funding rates, fear & greed.” The agent reads the frame catalogue and writes the spec."
            code="/zframes build me a TSLA + NVDA terminal"
          />
          <StepCard
            index={2}
            step="03"
            title="Own the result"
            body="One git-trackable dashboard.json, served locally with live keyless data — editable in the browser, forever yours."
            code="npx zframes serve"
          />
        </div>
      </section>

      {/* ── Act V · Why — the value grid ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-24">
        <Reveal>
          <SectionHeading
            eyebrow="Why zframes"
            title="Free, open source, built by your agent"
            description="No repo to clone, no builder UI to learn, no bill. Install a skill, tell your agent what you want to watch, and it builds your dashboard — yours to own."
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ValueCard
            index={0}
            title="Free and open source"
            body="Apache-2.0 on GitHub — the framework, the CLI and every frame. Read it, fork it, run it. No paid tier, no account, nothing held back behind one."
            icon={
              <>
                <circle cx="6" cy="5" r="2.5" />
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="12" cy="19" r="2.5" />
                <path d="M6 7.5v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2M12 12.5v4" />
              </>
            }
          />
          <ValueCard
            index={1}
            title="Agent-generated"
            body="You talk; an agent writes the spec and runs it. It only ever emits JSON — the framework owns all rendering, so it never writes a line of React."
            icon={
              <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            }
          />
          <ValueCard
            index={2}
            title="Keyless"
            body={`${KEYLESS_PROVIDER_COUNT} free public sources — Hyperliquid, CoinGecko and DeFiLlama alongside the Fed's FRED, the Treasury, the SEC, Zillow and the FHFA. No signup, no API keys, no .env to preview or run.`}
            icon={
              <>
                <circle cx="8" cy="15" r="4" />
                <path d="M10.85 12.15 19 4M18 5l2 2M20 3l1 1" />
              </>
            }
          />
          <ValueCard
            index={3}
            title="Yours to own"
            body="Your dashboard is one git-trackable dashboard.json; the CLI serves it locally, editable in the browser. No hosted service, no lock-in."
            icon={
              <>
                <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
                <path d="M4 7.5 12 12l8-4.5M12 12v9" />
              </>
            }
          />
        </div>
      </section>

      {/* ── Act VI · Questions — the objections, answered in words ───────── */}
      <Faq />

      {/* ── Final CTA — build your own ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24 pt-20">
        <Reveal>
          <div className="zf-surface flex flex-col items-center gap-4 px-6 py-14 text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Build your own dashboard
            </h2>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-white/65">
              Install the skill, tell your agent what you want to watch, and own
              a live terminal in minutes — free and open source, stocks and
              crypto, no keys, no account.
            </p>
            <Link
              href="#build"
              className="glow-brand zf-cta rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg"
            >
              Build your own dashboard →
            </Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

/**
 * The FAQ. Rendered from the shared `FAQ` array in `app/lib/faq.ts` — the same
 * one `page.tsx` emits as `FAQPage` structured data and `/llms.txt` prints.
 * One list, three renderings: Google's structured-data policy requires marked-up
 * answers to be visible on the page, and an answer engine quoting words we never
 * showed a human is worse than not being quoted.
 *
 * Native `<details>` rather than a JS accordion: the answers are in the document
 * either way (crawlers read collapsed content, and Google's guidance explicitly
 * allows FAQ answers behind an accordion), and this costs no state, no
 * dependency, and works before hydration.
 */
function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 pt-24">
      <Reveal>
        <SectionHeading
          eyebrow="Questions"
          title="Common questions"
          description="The things people ask before installing — price, keys, agents, and where your dashboard actually lives."
        />
      </Reveal>
      <div className="flex flex-col gap-2.5">
        {FAQ.map((item, i) => (
          <Reveal key={item.question} delay={Math.min(i, 4) * 0.05}>
            <details className="zf-surface group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="zf-press flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-white">
                <h3 className="text-[15px]">{item.question}</h3>
                {/* Rotates to a minus when open — the only motion here, and
                    CSS-only so it works with JS off. */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-indigo-300 transition-transform duration-200 group-open:rotate-45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-white/70">
                {item.answer}
              </p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// How-it-works step — numbered, with the actual command as the artifact.
function StepCard({
  step,
  title,
  body,
  code,
  index,
}: {
  step: string;
  title: string;
  body: string;
  code: string;
  index: number;
}) {
  return (
    <Reveal delay={index * 0.1}>
      <div className="zf-surface flex h-full flex-col p-6">
        <span className="font-mono text-sm font-semibold text-indigo-300">
          {step}
        </span>
        <h3 className="mt-3 font-semibold text-white">{title}</h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-white/60">
          {body}
        </p>
        <code className="mt-4 block truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-indigo-200">
          {code}
        </code>
      </div>
    </Reveal>
  );
}

// One board in the focus stack. Exists as its own component only because the
// dwell-scrub is a hook: each board derives its own 0..1 content progress from
// the shared section scroll, and hands it to the embed (see LiveBoardFrame).
function ShowcaseBoard({
  board,
  progress,
  index,
  count,
  active,
  boardVisible,
}: {
  board: BoardSummary;
  progress: MotionValue<number>;
  index: number;
  count: number;
  active: boolean;
  boardVisible: boolean;
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
        scrollProgress={contentScroll}
      />
    </FocusPanel>
  );
}

// Feature card — reveals on scroll with a per-index stagger so the grid
// cascades in rather than popping all at once.
function ValueCard({
  title,
  body,
  icon,
  index,
}: {
  title: string;
  body: string;
  icon: ReactNode;
  index: number;
}) {
  return (
    <Reveal delay={index * 0.06}>
      <div className="zf-surface h-full p-6">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/10 text-indigo-300">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        </div>
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/60">{body}</p>
      </div>
    </Reveal>
  );
}
