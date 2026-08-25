import Link from "next/link";
import { BrandMark } from "@/app/lib/BrandMark";
import { SITE_TAGLINE } from "@/app/lib/site";

/** Injected by next.config.ts from packages/cli/package.json at build time. */
const CLI_VERSION = process.env.ZFRAMES_CLI_VERSION;

// Site footer — brand, one-line pitch, and the primary routes. Server-safe.
export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <BrandMark idKey="ftr" className="h-6 w-6" />
            <span className="font-semibold tracking-tight text-white">
              zframes
            </span>
          </div>
          {/* The tagline from the constant, not retyped: the footer is one of
              the five surfaces that has to spell it identically. */}
          <p className="mt-3 text-sm text-white/60">
            {SITE_TAGLINE} It gets sharper every day — free, open-source market
            dashboards for stocks and crypto, yours to own.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-14 gap-y-2 text-sm">
          <span className="col-span-2 mb-1 text-xs font-medium uppercase tracking-widest text-white/45">
            Explore
          </span>
          <Link
            href="/gallery"
            className="text-white/65 transition-colors hover:text-white"
          >
            Gallery
          </Link>
          <Link
            href="/catalogue"
            className="text-white/65 transition-colors hover:text-white"
          >
            Catalogue
          </Link>
          <Link
            href="/tinker"
            className="text-white/65 transition-colors hover:text-white"
          >
            Tinker
          </Link>
          <Link
            href="/mine"
            className="text-white/65 transition-colors hover:text-white"
          >
            My dashboards
          </Link>
          {/* A real, crawlable link to /llms.txt. The <link rel="alternate"> in
              the root layout tells a machine it exists; this tells a machine that
              only follows anchors, and tells a developer reading the footer that
              the site has an agent-readable copy of itself. */}
          <a
            href="/llms.txt"
            className="font-mono text-white/50 transition-colors hover:text-white"
          >
            llms.txt
          </a>
        </nav>
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span>© {new Date().getFullYear()} zframes</span>
            {/* The published CLI version, inlined at build time from
                packages/cli/package.json (next.config.ts) — the same source the
                runtime header reads, so the site can't advertise a version npm
                doesn't serve. Links to npm so a visitor can check it. */}
            {CLI_VERSION ? (
              <a
                href="https://www.npmjs.com/package/zframes"
                target="_blank"
                rel="noreferrer"
                title={`zframes CLI v${CLI_VERSION} on npm`}
                className="rounded-full border border-white/[0.12] px-2 py-0.5 font-mono leading-none text-white/70 transition-colors hover:border-white/25 hover:text-white"
              >
                CLI v{CLI_VERSION}
              </a>
            ) : null}
          </div>
          {/* Labelled, not just the mark: the licence is a headline claim on
              the landing page, so the footer states it in words too. The
              visible text is the accessible name — no aria-label to override
              it. */}
          <a
            href="https://github.com/zentryhq/zframes"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-white/55 transition-colors hover:text-white"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-[18px] w-[18px]"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Open source · MIT
          </a>
        </div>
      </div>
    </footer>
  );
}
