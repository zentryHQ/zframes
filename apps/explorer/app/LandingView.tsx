import type { ReactNode } from "react";
import Link from "next/link";
import type { BoardSummary } from "@/app/lib/board-summary";
import { CopyCommand } from "@/app/lib/CopyCommand";
import { FAQ } from "@/app/lib/faq";
import { FramesShowcase } from "@/app/lib/FramesShowcase";
import { frameSlotMinHeight } from "@/app/lib/frame-slot";
import { LiveFrame, LiveFrameStyles } from "@/app/lib/LiveFrame";
import { MouseParallax, Parallax, Reveal, ScrollExit } from "@/app/lib/motion";
import { SectionHeading } from "@/app/lib/SectionHeading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
import { ShowcaseStack } from "@/app/lib/ShowcaseStack";

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
// This file is a SERVER component on purpose: the copy — hero text, FAQ, value
// grid, step cards — used to hydrate as part of one 650-line client tree purely
// because it sat inside `Reveal` wrappers. Client components (`Reveal`,
// `ScrollExit`, `MouseParallax`, the live frames, the stack) are leaf islands
// that receive these sections as server-rendered children; only `ShowcaseStack`
// holds page-level client state. `motion` drives only scroll/pointer
// orchestration; hover/press micro-interactions stay CSS (globals.css).

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
    // Visible earliest (lg — at md it sat directly under the hero paragraph).
    // Also the crypto presence: both asset classes on screen at once, without
    // the hero turning into a crypto board.
    frame: "market-cap-treemap",
    config: { topN: 12 },
    className: "w-60 h-48",
    pos: "right-[4%] top-[42%] hidden lg:block",
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
 * The landing page. Split out of `page.tsx` on 2026-08-05: the showcase boards
 * moved from a static module into the `dashboards` table, so `page.tsx` is a
 * thin server component that fetches them and hands them down as `boards`.
 *
 * They arrive as {@link BoardSummary} rather than full rows on purpose: the specs
 * would be tens of kilobytes of client payload for data the iframes fetch anyway.
 */
export default function GalleryHome({ boards }: { boards: BoardSummary[] }) {
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
                    // Floor the slot at the frame's measured minimum so a
                    // hand-tuned `h-*` can't clip it (see frameSlotMinHeight).
                    style={{
                      minHeight: frameSlotMinHeight(f.frame),
                      rotate: `${f.tilt}deg`,
                    }}
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
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Real boards. Zero setup.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every board here is rendering right now — the same frames your
            generated terminal runs. Keep scrolling; open any one.
          </p>
        </Reveal>
      </section>

      {/* Focus gallery — the sticky card-stack of live board embeds. Client
          island: the only part of the page holding page-level client state. */}
      <ShowcaseStack boards={boards} />

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
      <section
        id="build"
        className="cv-below-fold mx-auto max-w-7xl px-6 pt-24"
      >
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
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
                gap between heading and steps. */}
            <div
              aria-hidden
              className="pointer-events-none mt-12 hidden select-none font-bold leading-[0.95] tracking-tighter text-white/[0.04] lg:block"
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
              body="One git-trackable dashboard.json, served locally with live data — editable in the browser, forever yours."
              code="npx zframes serve"
            />
          </div>
        </div>
      </section>

      {/* ── Act V · Why — the value grid ─────────────────────────────────── */}
      <section className="cv-below-fold mx-auto max-w-7xl px-6 pt-24">
        <Reveal>
          <SectionHeading
            eyebrow="Why zframes"
            title="Free, open source, built by your agent"
            description="No repo to clone, no builder UI to learn, no bill. Install a skill, tell your agent what you want to watch, and it builds your dashboard — yours to own."
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              crypto, no account.
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
 * shadcn's Radix accordion rather than native `<details>` so open/close animates
 * (height + fade; `<details>` snaps). The SEO property the old `<details>`
 * version bought is preserved: `AccordionContent` force-mounts (see
 * `components/ui/accordion.tsx`), so every answer is in the server HTML for
 * crawlers even while collapsed — Google's guidance allows FAQ answers behind
 * an accordion but requires the marked-up text to be on the page. `type="multiple"`
 * keeps the old independent-toggles behaviour.
 */
function Faq() {
  return (
    <section id="faq" className="cv-below-fold mx-auto max-w-7xl px-6 pt-24">
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

        <Accordion type="multiple" className="flex flex-col gap-2.5">
          {FAQ.map((item, i) => (
            <Reveal key={item.question} delay={Math.min(i, 4) * 0.05}>
              <AccordionItem
                value={item.question}
                className="zf-surface px-5 py-4"
              >
                {/* AccordionTrigger's header IS the h3 (Radix's default), so
                    the question text is a span, not a nested heading. */}
                <AccordionTrigger className="zf-press w-full cursor-pointer font-semibold text-white [&[data-state=open]>svg]:rotate-45">
                  <span className="text-[15px]">{item.question}</span>
                  {/* The plus rotates to a × when open. */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 text-indigo-300 transition-transform duration-200"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </AccordionTrigger>
                <AccordionContent className="pt-3">
                  <p className="text-pretty text-sm leading-relaxed text-white/70">
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Reveal>
          ))}
        </Accordion>
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
