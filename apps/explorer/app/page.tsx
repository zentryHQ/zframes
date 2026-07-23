"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { allFrameMetas } from "@zframes/frames/schemas";
import { CURATED } from "@/app/lib/curated-dashboards";
import { CopyCommand } from "@/app/lib/CopyCommand";
import { LiveBoardFrame } from "@/app/lib/LiveBoardFrame";
import { Parallax, Reveal, StackPanel } from "@/app/lib/motion";
import { SectionHeading } from "@/app/lib/SectionHeading";

// Gallery home — the public front door, rebuilt as a long-scroll narrative:
// hero → a parallax showcase of REAL live boards (iframed /embed/*, streaming
// data) → why-it's-different → gallery CTA. Copy follows the repo README
// ("Describe your dashboard. An agent builds it. It gets sharper every day.").
// `motion` drives only the scroll orchestration (parallax + whileInView reveals);
// hover/press micro-interactions stay CSS (globals.css). Client, but the copy
// still SSRs (client components render on the server first) so SEO holds.
export default function GalleryHome() {
  const frameCount = allFrameMetas.length;

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl overflow-x-clip px-6 pt-16 pb-8 sm:pt-24">
        {/* Parallax backdrop glow — drifts slower than the page for depth. */}
        <Parallax
          distance={90}
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[560px] max-w-4xl"
        >
          <div className="h-full w-full bg-[image:radial-gradient(52%_60%_at_50%_28%,hsla(258,92%,62%,0.30),transparent_70%)]" />
        </Parallax>

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="animate-fade-up mt-6 text-balance text-4xl font-bold leading-[1.06] tracking-tight text-white [animation-delay:60ms] sm:text-6xl">
            Describe your dashboard.
            <br className="hidden sm:block" />{" "}
            <span className="text-indigo-200">An agent builds it.</span>
          </h1>

          <p className="animate-fade-up mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/75 [animation-delay:120ms] sm:text-lg">
            zframes turns your coding agent into a market-terminal builder.
            Install a skill, describe what you want, and it reads the frame
            catalogue, writes a live{" "}
            <code className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[0.85em] text-indigo-200">
              dashboard.json
            </code>
            , and serves it with real data — keyless, stocks first, and it gets
            sharper every day.
          </p>

          <div className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
            <Link
              href="/gallery"
              className="glow-brand zf-cta rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
            >
              Browse the gallery
            </Link>
            <Link
              href="/catalogue"
              className="zf-press rounded-xl border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
            >
              Explore {frameCount} frames →
            </Link>
          </div>

          {/* The real entry point (README §Quickstart): install the skill, then talk. */}
          <div className="animate-fade-up mt-8 flex flex-col items-center gap-2.5 [animation-delay:240ms]">
            <span className="text-xs uppercase tracking-widest text-white/55">
              Install in your agent, then just talk
            </span>
            <CopyCommand command="npx skills add zentryhq/zframes" />
            <span className="font-mono text-xs text-white/55">
              <span className="text-indigo-300">/zframes</span> build me a TSLA
              + NVDA terminal with funding &amp; fear-greed
            </span>
          </div>
        </div>
      </section>

      {/* ── Live board showcase ──────────────────────────────────────────────
          The proof: real boards streaming real keyless data. Each fills the screen
          and the next rises over it as you scroll (sticky stack), so the boards are
          shown one at a time with the covered one receding — parallax depth. Each
          panel opens the full preview. */}
      <section className="mx-auto max-w-5xl px-6 pt-10 pb-2 text-center">
        <Reveal>
          <span className="zf-label mb-3 justify-center">
            Live, not screenshots
          </span>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Real boards. Real data. Zero keys.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/65 sm:text-base">
            Every board here is rendering live right now — the same keyless
            public feeds your generated terminal runs on. Keep scrolling; open
            any one.
          </p>
        </Reveal>
      </section>

      {/* Stacked cards. Each board is a bordered card that pins and stays; the
          next rises over it leaving its top strip peeking — a growing stack. */}
      <section className="relative overflow-x-clip pb-[8vh]">
        {CURATED.map((d, i) => (
          <StackPanel key={d.id} index={i} total={CURATED.length}>
            <LiveBoardFrame
              id={d.id}
              title={d.title}
              description={d.description}
              tags={d.tags}
              frameCount={d.spec.frames.length}
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

      {/* ── Why it's different (README) ──────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-20">
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
                Preview any board below with live data, then fork it onto your
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

      {/* ── Browse CTA ───────────────────────────────────────────────────── */}
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

// Feature card — reveals on scroll with a per-index stagger so the grid cascades
// in rather than popping all at once. Body copy unchanged from the prior page.
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
