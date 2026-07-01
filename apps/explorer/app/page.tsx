import type { ReactNode } from "react";
import Link from "next/link";
import { allFrameMetas } from "@zframes/frames/schemas";
import { CommunitySection } from "@/app/lib/CommunitySection";
import { CopyCommand } from "@/app/lib/CopyCommand";
import { CURATED } from "@/app/lib/curated-dashboards";
import { DashboardCard } from "@/app/lib/DashboardCard";
import { SectionHeading } from "@/app/lib/SectionHeading";

// Gallery home — the public front door. Server-rendered (no live frames here, so
// it stays fast + SEO-friendly). Copy + positioning follow the repo README:
// "Describe your dashboard. An agent builds it. It gets sharper every day."
export default function GalleryHome() {
  const frameCount = allFrameMetas.length;

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-10 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Agent-generated · keyless · stocks first
          </div>

          <h1 className="animate-fade-up mt-6 text-balance text-4xl font-bold leading-[1.06] tracking-tight text-white sm:text-6xl" style={{ animationDelay: "60ms" }}>
            Describe your dashboard.
            <br className="hidden sm:block" />{" "}
            <span className="text-gradient">An agent builds it.</span>
          </h1>

          <p className="animate-fade-up mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/60 sm:text-lg" style={{ animationDelay: "120ms" }}>
            zframes turns your coding agent into a market-terminal builder. Install a
            skill, describe what you want, and it reads the frame catalogue, writes a
            live <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.85em] text-indigo-200">dashboard.json</code>, and serves it with real data —
            keyless, stocks first, and it gets sharper every day.
          </p>

          <div className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
            <Link
              href="#curated"
              className="glow-brand rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Browse the gallery
            </Link>
            <Link
              href="/catalogue"
              className="rounded-xl border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-white/30 hover:text-white"
            >
              Explore {frameCount} frames →
            </Link>
          </div>

          {/* The real entry point (README §Quickstart): install the skill, then talk. */}
          <div className="animate-fade-up mt-8 flex flex-col items-center gap-2.5" style={{ animationDelay: "240ms" }}>
            <span className="text-xs uppercase tracking-widest text-white/35">
              Install in your agent, then just talk
            </span>
            <CopyCommand command="npx skills add zentryhq/zframes" />
            <span className="font-mono text-xs text-white/35">
              <span className="text-indigo-300/70">/zframes</span> build me a TSLA + NVDA
              terminal with funding &amp; fear-greed
            </span>
          </div>
        </div>

        {/* Hero image — a real generated zframes dashboard (README §hero,
            docs/assets/dashboard-2026-06-20.png). Shown unobstructed in a single
            glowing frame: the image is the hero, every card a validated keyless frame. */}
        <figure className="animate-fade-up relative mx-auto mt-16 max-w-5xl" style={{ animationDelay: "300ms" }}>
          <div
            className="pointer-events-none absolute -inset-x-10 -top-16 -bottom-8 -z-10"
            style={{
              background:
                "radial-gradient(52% 62% at 50% 32%, hsla(258,92%,62%,0.34), transparent 70%)",
            }}
          />
          <div className="hairline glow-brand overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/showcase-dashboard.png"
              alt="A generated zframes stocks desk — a live TSLA candlestick chart, a multi-asset stock liveline (TSLA, NVDA, AAPL, MSFT), a price ticker, top movers, and a live ticker tape, all keyless HIP-3 stock perps + crypto"
              width={1600}
              height={801}
              className="block w-full"
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          </div>
          <figcaption className="mt-4 text-center text-sm text-white/40">
            A generated zframes dashboard — every card is a validated frame fed by
            keyless public data.
          </figcaption>
        </figure>
      </section>

      {/* ── Why it's different (README) ──────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-20">
        <SectionHeading
          eyebrow="Why zframes"
          title="Not a dashboard builder"
          description="You don't clone a repo or learn a builder UI. You install a skill, talk to your agent, and own the result."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ValueCard
            title="Agent-generated"
            body="You talk; an agent writes the spec and runs it. It only ever emits JSON — the framework owns all rendering, so it never writes a line of React."
            icon={<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />}
          />
          <ValueCard
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
            title="Self-improving"
            body="A daily loop grades yesterday's market calls against what actually happened, tracks a hit-rate, and writes a fresh brief onto your board."
            icon={
              <>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </>
            }
          />
          <div className="hairline flex flex-col justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/[0.06] p-6">
            <p className="text-sm leading-relaxed text-white/70">
              Preview any board below with live data, then fork it onto your machine
              with a single prompt.
            </p>
            <Link
              href="/catalogue"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200"
            >
              See the frame catalogue →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Curated ──────────────────────────────────────────────────────── */}
      <section id="curated" className="mx-auto max-w-7xl scroll-mt-20 px-6 pt-20">
        <SectionHeading
          eyebrow="Curated"
          title="Boards to start from"
          description="Hand-built dashboards spanning crypto majors, on-chain data, and official US macro. Preview any one live, then make it yours."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CURATED.map((d) => (
            <DashboardCard
              key={d.id}
              href={`/d/${d.id}`}
              title={d.title}
              description={d.description}
              tags={d.tags}
              frameCount={d.spec.frames.length}
              frames={d.spec.frames}
            />
          ))}
        </div>
      </section>

      {/* ── Community ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-20">
        <CommunitySection />
      </section>
    </main>
  );
}

function ValueCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <div className="hairline rounded-2xl bg-white/[0.02] p-6">
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
      <p className="mt-1.5 text-sm leading-relaxed text-white/50">{body}</p>
    </div>
  );
}
