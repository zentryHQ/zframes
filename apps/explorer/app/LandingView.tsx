"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import Link from "next/link";
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

// The hero's floating specimens — cast for silhouette variety and instant
// keyless data. Desktop-mostly; each gets its own parallax depth (mouse
// strength + scroll drift) and idle-bob phase so the cluster reads as a
// suspended volume, not a wallpaper.
//
// Composition rule: SIX cards, three per side, edge-anchored on a staggered
// vertical rhythm — the centre column keeps clear air so the promise owns the
// fold (eight cards filled every gutter and read as clutter). Every card is
// deliberately ADVANCED: equity perps streaming live, the Treasury curve, an
// options book by strike, a cross-symbol funding heatmap, a volume profile —
// dense, terminal-grade silhouettes, not bare stat cards. One crypto card (the
// market-cap treemap) keeps both asset classes visibly present — the promise is
// "stocks and crypto", and the crypto families get chapters of their own
// further down the page.
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
  // ── Left rail, top → bottom ──
  {
    frame: "price-liveline",
    // The signature frame gets the biggest slot — three HIP-3 equity perps
    // racing on one normalized axis, ticking off a single streamed socket. This
    // is the "live market" half of the promise, in one card.
    config: { symbols: ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"] },
    className: "w-[24rem] h-56",
    pos: "left-[1%] top-[8%] hidden lg:block",
    mouse: 18,
    scroll: 42,
    tilt: -2.2,
    delay: "0s",
  },
  {
    frame: "yield-curve",
    className: "w-64 h-44",
    pos: "left-[3%] top-[46%] hidden xl:block",
    mouse: 26,
    scroll: 64,
    tilt: 1.2,
    delay: "-3.2s",
  },
  {
    // Volume-by-price with POC + value area — quant vocabulary in one card.
    frame: "volume-profile",
    config: { symbol: "xyz:NVDA" },
    className: "w-64 h-60",
    pos: "left-[8%] bottom-[4%] hidden lg:block",
    mouse: -22,
    scroll: 92,
    tilt: 1.6,
    delay: "-4.1s",
  },
  // ── Right rail, top → bottom ──
  {
    // The options book by strike — call vs put walls around spot, the most
    // terminal-grade silhouette in the cluster.
    frame: "options-oi-strike",
    config: { currency: "BTC", strikes: 12 },
    className: "w-72 h-48",
    pos: "right-[2%] top-[6%] hidden xl:block",
    mouse: -20,
    scroll: 70,
    tilt: -1.4,
    delay: "-5s",
  },
  {
    // Visible earliest (md), so the smallest desktop still gets a dense card.
    // Also the crypto presence: both asset classes on screen at once, without
    // the hero turning into a crypto board.
    frame: "market-cap-treemap",
    config: { topN: 12 },
    className: "w-60 h-48",
    pos: "right-[4%] top-[42%] hidden md:block",
    mouse: -14,
    scroll: 74,
    tilt: 2,
    delay: "-2.2s",
  },
  {
    // Funding regimes across the equity perps — a heatmap silhouette no
    // simple card produces, and it reads "cross-symbol analysis" at a glance.
    frame: "funding-heatmap",
    config: { symbols: ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL", "xyz:MSFT"] },
    className: "w-80 h-40",
    pos: "right-[3%] bottom-[6%] hidden xl:block",
    mouse: 16,
    scroll: 48,
    tilt: 1,
    delay: "-2.8s",
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
                    className={`glow-brand-soft opacity-75 ${f.className}`}
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
          <h1 className="animate-fade-up text-balance text-5xl font-bold leading-[1.04] tracking-tight text-white [animation-delay:60ms] sm:text-7xl">
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
          </div>

          {/* The real entry point (README §Quickstart). */}
          <div className="animate-fade-up mt-10 flex flex-col items-center gap-2.5 [animation-delay:240ms]">
            <span className="text-xs uppercase tracking-widest text-white/55">
              Install in your agent, then just talk
            </span>
            <CopyCommand command="npx skills add zentryhq/zframes" />
            <span className="font-mono text-xs text-white/55">
              <span className="text-indigo-300">/zframes</span>
              {
                "  build me an NVDA earnings desk with options walls, short volume & SEC filings"
              }
            </span>
          </div>
        </ScrollExit>
      </section>

      {/* ── Act II · Proof — full boards, rendering ──────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-2 pt-16 text-center">
        <Reveal>
          <span className="zf-label mb-3 justify-center">
            Real frames, not screenshots
          </span>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Real boards. Demo data. Zero keys.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every board here is rendering right now on simulated demo data — the
            same frames your generated terminal runs on live, keyless feeds.
            Keep scrolling; open any one.
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
      {/* Sticky-rail layout: the heading column pins while the steps scroll
          past it — the numbered column is the tall one, so the title stays on
          screen for the whole read. */}
      <section id="build" className="mx-auto max-w-7xl px-6 pt-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div className="relative lg:sticky lg:top-24 lg:self-start">
            <Reveal>
              <span className="zf-label mb-2.5">How it works</span>
              <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Three beats to your own terminal
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65 sm:text-base">
                No repo to clone, no builder UI to learn. Your agent does the
                building; you own the artifact.
              </p>
            </Reveal>
            {/* Ghosted watermark — the three beats, barely there. Desktop only:
                on mobile the rail isn't sticky and the ghost would just be a
                gap between heading and steps. ABSOLUTE on purpose: if it added
                height to the sticky block, the rail would be nearly as tall as
                the step column and the heading would get almost no pinned
                travel before the section end pushes it off. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 top-full mt-12 hidden select-none font-bold leading-[0.95] tracking-tighter text-white/[0.04] lg:block"
            >
              <div className="text-[clamp(4rem,7vw,6.5rem)]">install</div>
              <div className="text-[clamp(4rem,7vw,6.5rem)]">describe</div>
              <div className="text-[clamp(4rem,7vw,6.5rem)]">own</div>
            </div>
          </div>

          <div className="flex flex-col gap-14 pt-2 sm:gap-20 lg:py-10">
            <Step
              index={0}
              n="1"
              title="Install the skill"
              body="One command teaches your coding agent — Claude Code, Cursor, Codex — how to build zframes terminals."
              code="npx skills add zentryhq/zframes"
            />
            <Step
              index={1}
              n="2"
              title="Describe what you watch"
              body="“An NVDA earnings desk: options walls, short volume, filings.” The agent reads the frame catalogue and writes the spec."
              code="/zframes build me an NVDA earnings desk"
              prefix="›"
            />
            <Step
              index={2}
              n="3"
              title="Own the result"
              body="One git-trackable dashboard.json, served locally with live keyless data — editable in the browser, forever yours."
              code="npx zframes serve"
            />
          </div>
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
            body="MIT-licensed on GitHub — the framework, the CLI and every frame. Read it, fork it, run it. No paid tier, no account, nothing held back behind one."
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
    <section id="faq" className="mx-auto max-w-7xl px-6 pt-24">
      {/* Same sticky-rail layout as the How section: the heading column pins
          while the question list scrolls past it. */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Reveal>
            <span className="zf-label mb-2.5">Questions</span>
            <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Common questions
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65 sm:text-base">
              The things people ask before installing — price, keys, agents, and
              where your dashboard actually lives.
            </p>
            <p className="mt-6 text-sm text-white/45">
              Something else?{" "}
              <a
                href="https://github.com/zentryhq/zframes"
                className="font-medium text-indigo-300 transition-colors hover:text-indigo-200"
              >
                It&rsquo;s all open source →
              </a>
            </p>
          </Reveal>
        </div>

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
      </div>
    </section>
  );
}

// One beat in the How column: numbered badge, title, prose, then the command
// as a real copy chip (CopyCommand), not a decorative <code>.
function Step({
  n,
  title,
  body,
  code,
  prefix,
  index,
}: {
  n: string;
  title: string;
  body: string;
  code: string;
  prefix?: string;
  index: number;
}) {
  return (
    <Reveal delay={index * 0.08}>
      <div className="flex gap-5">
        <span className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-white text-sm font-bold text-slate-950">
          {n}
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">
            {title}
          </h3>
          <p className="mt-2 max-w-lg text-pretty text-sm leading-relaxed text-white/65 sm:text-[15px]">
            {body}
          </p>
          <div className="mt-5 inline-flex max-w-full">
            <CopyCommand command={code} prefix={prefix} />
          </div>
        </div>
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
