"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useMotionValueEvent, useReducedMotion } from "motion/react";
import Link from "next/link";
import { allFrameMetas } from "@zframes/frames/schemas";
import { CURATED } from "@/app/lib/curated-dashboards";
import { CopyCommand } from "@/app/lib/CopyCommand";
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
  useSectionProgress,
} from "@/app/lib/motion";
import { SectionHeading } from "@/app/lib/SectionHeading";

// The focus-gallery's shared sticky box sits below the header (57px) with a
// little air. Every board renders full inside this box; scale/opacity animate.
const FOCUS_STICKY_TOP = 72;

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

// The hero's floating specimens — cast for silhouette variety (line chart,
// gauge, stat, clock) and instant keyless data. Desktop-mostly; each gets its
// own parallax depth (mouse strength + scroll drift) and idle-bob phase so the
// cluster reads as a suspended volume, not a wallpaper.
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
    // The signature frame gets the biggest slot — a three-way race (two HIP-3
    // equities vs BTC) so the normalized compare view reads at a glance.
    config: { symbols: ["xyz:TSLA", "xyz:NVDA", "BTC"] },
    className: "w-[26rem] h-60",
    pos: "left-[1%] top-[13%] hidden lg:block",
    mouse: 18,
    scroll: 42,
    tilt: -2.2,
    delay: "0s",
  },
  {
    frame: "btc-fees",
    className: "w-56 h-52",
    pos: "right-[20%] top-[3%] hidden xl:block",
    mouse: -20,
    scroll: 70,
    tilt: -1.4,
    delay: "-5s",
  },
  {
    frame: "price-ticker",
    config: { symbols: ["xyz:AAPL", "ETH"] },
    className: "w-72 h-28",
    pos: "right-[2%] top-[47%] hidden xl:block",
    mouse: 16,
    scroll: 48,
    tilt: 1,
    delay: "-2.8s",
  },
  {
    frame: "fear-greed",
    className: "w-56 h-52",
    pos: "right-[3%] top-[13%] hidden md:block",
    mouse: -14,
    scroll: 74,
    tilt: 2,
    delay: "-2.2s",
  },
  {
    frame: "clock",
    config: { timezone: "America/New_York", label: "New York", showDate: true },
    className: "w-52 h-32",
    pos: "left-[7%] bottom-[17%] hidden lg:block",
    mouse: -22,
    scroll: 92,
    tilt: 1.6,
    delay: "-4.1s",
  },
  {
    // The value TREND for the same public wallet — total USD equity as a live
    // liveline, ticking each heartbeat off streamed mids. Paired with the
    // holdings breakdown so the hero shows both "how much" and "made of what".
    frame: "portfolio-value",
    config: {
      source: "wallet",
      address: "0xF977814e90dA44bFA03b6295A0616a897441acec",
    },
    title: "Binance · cold wallet",
    className: "w-80 h-44",
    pos: "right-[4%] bottom-[14%] hidden lg:block",
    mouse: 12,
    scroll: 56,
    tilt: -1.6,
    delay: "-1.4s",
  },
  {
    frame: "bitcoin-dominance",
    className: "w-64 h-44",
    pos: "left-[20%] top-[4%] hidden xl:block",
    mouse: 26,
    scroll: 64,
    tilt: 1.2,
    delay: "-3.2s",
  },
  {
    // A famous public wallet, live on-chain — the product's `portfolio`
    // capability reading a huge exchange cold wallet straight from the browser
    // (keyless: public RPC + CoinGecko, no key, no relay). Big, real numbers.
    frame: "portfolio-holdings",
    config: {
      source: "wallet",
      address: "0xF977814e90dA44bFA03b6295A0616a897441acec",
    },
    title: "Binance · cold wallet",
    className: "w-80 h-56",
    pos: "left-[2%] top-[44%] hidden lg:block",
    mouse: 20,
    scroll: 58,
    tilt: 1.8,
    delay: "-3.6s",
  },
];

export default function GalleryHome() {
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
    const n = CURATED.length;
    const t = focusT(p, n);
    const r = Math.round(t);
    // Settled only while resting in a board's dwell band; else nothing is
    // "active" (the crossfade owns the mid-transition look, no scene needed).
    const settled = Math.abs(t - r) < 0.2 ? Math.min(n - 1, Math.max(0, r)) : -1;
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
            promise. Display-only; behind the copy. */}
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
            Live market terminals, agent-built
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
            and serves it with real data — keyless, stocks first, sharper every
            day.
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

      {/* Focus gallery. Each board grows from small into a full, un-clipped view
          (the whole dashboard visible), dwells there, then shrinks and fades as
          the next grows up in its place — one board in focus at a time, so every
          dashboard is seen in full. Under reduced motion: a plain vertical list. */}
      {reduced ? (
        <section className="mx-auto max-w-[88rem] space-y-6 px-4 pb-[8vh] sm:px-6">
          {CURATED.map((d) => (
            <div key={d.id} className="h-[78vh]">
              <LiveBoardFrame
                id={d.id}
                title={d.title}
                description={d.description}
                tags={d.tags}
                frameCount={d.spec.frames.length}
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
          // stays pinned across the whole range while the boards crossfade.
          style={{ height: `${CURATED.length * 125 + 30}vh` }}
        >
          <div
            className="sticky mx-auto w-full max-w-[88rem] px-4 sm:px-6"
            style={{
              top: FOCUS_STICKY_TOP,
              height: `calc(100svh - ${FOCUS_STICKY_TOP}px - 2rem)`,
            }}
          >
            {CURATED.map((d, i) => (
              <FocusPanel
                key={d.id}
                progress={progress}
                index={i}
                count={CURATED.length}
                active={i === activeIndex}
              >
                <LiveBoardFrame
                  id={d.id}
                  title={d.title}
                  description={d.description}
                  tags={d.tags}
                  frameCount={d.spec.frames.length}
                  bgActive={i === activeIndex}
                  boardVisible={i >= visibleRange[0] && i <= visibleRange[1]}
                />
              </FocusPanel>
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
            title="Let your AI agent build it for you"
            description="No repo to clone, no builder UI to learn. Install a skill, tell your agent what you want to watch, and it builds your dashboard — yours to own."
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ValueCard
            index={0}
            title="Agent-generated"
            body="You talk; an agent writes the spec and runs it. It only ever emits JSON — the framework owns all rendering, so it never writes a line of React."
            icon={
              <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            }
          />
          <ValueCard
            index={1}
            title="Keyless"
            body="Hyperliquid, DeFiLlama, alternative.me & CoinGecko — free public APIs. No signup, no API keys, no .env to preview or run."
            icon={
              <>
                <circle cx="8" cy="15" r="4" />
                <path d="M10.85 12.15 19 4M18 5l2 2M20 3l1 1" />
              </>
            }
          />
          <ValueCard
            index={2}
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

      {/* ── Final CTA — build your own ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24 pt-20">
        <Reveal>
          <div className="zf-surface flex flex-col items-center gap-4 px-6 py-14 text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Build your own dashboard
            </h2>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-white/65">
              Install the skill, tell your agent what you want to watch, and own
              a live keyless terminal in minutes — no repo, no keys, no builder
              UI.
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
