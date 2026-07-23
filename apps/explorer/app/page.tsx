"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { allFrameMetas } from "@zframes/frames/schemas";
import { CURATED } from "@/app/lib/curated-dashboards";
import { CopyCommand } from "@/app/lib/CopyCommand";
import { FramesShowcase } from "@/app/lib/FramesShowcase";
import { LiveBoardFrame } from "@/app/lib/LiveBoardFrame";
import { LiveFrame, LiveFrameStyles } from "@/app/lib/LiveFrame";
import {
  MouseParallax,
  Parallax,
  Reveal,
  ScrollExit,
  StackPanel,
} from "@/app/lib/motion";
import { SectionHeading } from "@/app/lib/SectionHeading";

// Gallery home — the public front door as a five-act scroll narrative:
//
//   I    Hero        the promise, staged inside a floating cluster of REAL
//                    live frames (LiveFrame → the runtime's own components)
//   II   Vocabulary  the frame catalogue as six parallax chapters, every
//                    specimen streaming live data (FramesShowcase)
//   III  Proof       full boards composed from those frames — the sticky
//                    card-stack of live embedded dashboards
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
  className: string;
  pos: string;
  mouse: number;
  scroll: number;
  tilt: number;
  delay: string;
}[] = [
  {
    frame: "price-liveline",
    className: "w-[21rem] h-48",
    pos: "left-[1%] top-[16%] hidden lg:block",
    mouse: 18,
    scroll: 42,
    tilt: -2.2,
    delay: "0s",
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
    frame: "open-interest",
    className: "w-72 h-40",
    pos: "right-[5%] bottom-[15%] hidden lg:block",
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
];

export default function GalleryHome() {
  const frameCount = allFrameMetas.length;
  const stackRef = useRef<HTMLElement>(null);
  // Which board in the sticky stack should run its animated backdrop: the
  // SETTLED front card only — none mid-transition, none once the stack is
  // fully off-screen. Every stacked iframe stays mounted (its WS/data keep
  // streaming so scroll-back is instant), but covered cards hold zero WebGL.
  // [-1,-1] = all suspended. Same-identity bailout in the setter means
  // scrolling re-renders nothing until the active card actually changes.
  const [activePair, setActivePair] = useState<readonly [number, number]>([
    0, 0,
  ]);
  // Boards below this index are COVERED by the stack (only their 30px top
  // strip peeks) — their embeds stop rendering + polling entirely, not just
  // their scene. Occlusion is invisible to the IntersectionObservers inside
  // each iframe (a covered card still "intersects" the viewport), so the
  // parent, which knows the stack geometry, is the only place this can be
  // decided. total = the whole stack scrolled past → everything off.
  const [hideBelow, setHideBelow] = useState(0);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    let raf = 0;
    let pendingIdx = 0; // matches the initial activePair
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    const total = CURATED.length;
    const commit = (idx: number) =>
      setActivePair((p) => (p[0] === idx ? p : [idx, idx]));
    // Deactivation is immediate (the embed starts its fade-out + grace);
    // ACTIVATION waits for 250ms of rest — a fast scroll sweeps through every
    // card's settle band spatially, and booting a WebGL engine on each
    // fly-through is exactly the jank this gate exists to prevent.
    const propose = (idx: number) => {
      if (idx === pendingIdx) return;
      pendingIdx = idx;
      clearTimeout(pendingTimer);
      if (idx === -1) commit(-1);
      else pendingTimer = setTimeout(() => commit(idx), 250);
    };
    const measure = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      // Fully scrolled past → suspend every scene AND hide every board; still
      // below the viewport → scenes off but boards stay "visible" (their own
      // in-iframe observers already pause off-screen work, and this keeps
      // their data warming before the stack scrolls in).
      if (rect.bottom < 0) {
        propose(-1);
        setHideBelow((h) => (h === total ? h : total));
        return;
      }
      if (rect.top > window.innerHeight * 1.5) {
        propose(-1);
        setHideBelow((h) => (h === 0 ? h : 0));
        return;
      }
      // Cards are equal-height siblings, so the stack's scroll progress maps
      // linearly to "which card is at the pin line" (57px header offset —
      // matches StackPanel's `top`). Only a SETTLED card runs its scene:
      // booting a WebGL engine mid-transition is exactly when the main thread
      // is busiest (the full-bleed scale animation), which read as scroll jank
      // + a late scene pop. Mid-transition the active set is empty — the
      // embed's teardown hysteresis keeps the outgoing scene alive across a
      // normal swipe, and the incoming one fades in once its card rests on the
      // static swatch it rose with.
      const slot = rect.height / total;
      const f = Math.min(total - 1, Math.max(0, (57 - rect.top) / slot));
      const r = Math.round(f);
      propose(Math.abs(f - r) < 0.12 ? r : -1);
      // Covered = strictly behind the card at (or rising past) the pin line.
      // Reveal on scroll-back is immediate (no debounce) — content must be
      // there the frame the covering card recedes.
      const covered = Math.floor(f);
      setHideBelow((h) => (h === covered ? h : covered));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(pendingTimer);
    };
  }, []);

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
                    <LiveFrame frame={f.frame} config={f.config} />
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
              href="/gallery"
              className="glow-brand zf-cta rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg"
            >
              Browse the gallery
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

        {/* Scroll cue. */}
        <div
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2"
          aria-hidden="true"
        >
          <div className="flex h-12 w-7 justify-center overflow-hidden rounded-full border border-white/15 pt-2">
            <span className="animate-scroll-cue h-2 w-[3px] rounded-full bg-indigo-300" />
          </div>
        </div>
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

      {/* Stacked cards. Each board is a bordered card that pins and stays; the
          next rises over it leaving its top strip peeking — a growing stack. */}
      <section ref={stackRef} className="relative overflow-x-clip pb-[8vh]">
        {CURATED.map((d, i) => (
          <StackPanel key={d.id} index={i} total={CURATED.length}>
            <LiveBoardFrame
              id={d.id}
              title={d.title}
              description={d.description}
              tags={d.tags}
              frameCount={d.spec.frames.length}
              bgActive={i === activePair[0] || i === activePair[1]}
              boardVisible={i >= hideBelow}
            />
          </StackPanel>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-8 pt-12 text-center">
        <Reveal>
          <Link
            href="/gallery"
            className="zf-press inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
          >
            See every board in the gallery →
          </Link>
        </Reveal>
      </section>

      {/* ── Act III · The vocabulary — frames, live, by family ───────────── */}
      <FramesShowcase />

      {/* ── Act IV · How — three beats to your own terminal ──────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-24">
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
            title="Not a dashboard builder"
            description="You don't clone a repo or learn a builder UI. You install a skill, talk to your agent, and own the result."
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
            title="Stocks first"
            body="Live equity perps stream via Hyperliquid HIP-3 (xyz:TSLA, xyz:NVDA), with crypto, TVL, and sentiment alongside over the same free socket."
            icon={
              <>
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M17 7h4v4" />
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
          <ValueCard
            index={4}
            title="Self-improving"
            body="A daily loop grades yesterday's market calls against what actually happened, tracks a hit-rate, and writes a fresh brief onto your board."
            icon={
              <>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </>
            }
          />
          <Reveal delay={5 * 0.06}>
            <div className="zf-surface flex h-full flex-col justify-center p-6">
              <p className="text-sm leading-relaxed text-white/70">
                Preview any board above with live data, then fork it onto your
                machine with a single prompt.
              </p>
              <Link
                href="/catalogue"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200"
              >
                See the frame catalogue →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-24 pt-20">
        <Reveal>
          <div className="zf-surface flex flex-col items-center gap-4 px-6 py-14 text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-white">
              Browse the gallery
            </h2>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-white/65">
              Curated boards and dashboards published by the community — preview
              any one live with real data, then fork it onto your machine.
            </p>
            <Link
              href="/gallery"
              className="glow-brand zf-cta rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
            >
              Open the gallery →
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
