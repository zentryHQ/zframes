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
          {/* The site-wide mock-data disclosure. Every frame-rendering surface
              is simulated (AGENTS.md § Mock data only); the footer is the one
              piece of chrome every page shares, so the fact lives here once. */}
          <p className="mt-2 text-xs text-white/45">
            Every number on this site is simulated. Live market data comes from
            running zframes on your own machine.
          </p>
        </div>

        {/* One column, three house routes. It stays deliberately short: /mine
            is account chrome (it lives beside the avatar in the header, and is
            noindex), and the crawlable /llms.txt anchor was dropped — the root
            layout's <link rel="alternate" type="text/plain"> still declares it,
            which is the directive that actually matters. */}
        <nav className="flex flex-col gap-2 text-sm">
          <span className="mb-1 text-xs font-medium uppercase tracking-widest text-white/45">
            Explore
          </span>
          <Link
            href="/boards"
            className="text-white/65 transition-colors hover:text-white"
          >
            Boards
          </Link>
          <Link
            href="/frames"
            className="text-white/65 transition-colors hover:text-white"
          >
            Frames
          </Link>
          <Link
            href="/editor"
            className="text-white/65 transition-colors hover:text-white"
          >
            Editor
          </Link>
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
          {/* Icon-only marks: the source on GitHub, the published CLI on npm.
              With the "Open source · MIT" wording gone neither link has a text
              node left, so aria-label carries the accessible name and title
              gives a sighted hover the same words. */}
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/zentryhq/zframes"
              target="_blank"
              rel="noreferrer"
              aria-label="zframes on GitHub"
              title="zframes on GitHub"
              className="inline-flex text-white/55 transition-colors hover:text-white"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-[18px] w-[18px]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </a>
            <a
              href="https://www.npmjs.com/package/zframes"
              target="_blank"
              rel="noreferrer"
              aria-label="zframes on npm"
              title="zframes on npm"
              className="inline-flex text-white/55 transition-colors hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
