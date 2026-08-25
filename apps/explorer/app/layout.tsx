import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/app/lib/AppShell";
import {
  BRAND_BG,
  GOOGLE_SITE_VERIFICATION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_TITLE,
  SITE_TITLE_SUFFIX,
  SITE_URL,
} from "@/app/lib/site";
import { pageSocial } from "@/app/lib/social";
import {
  JsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "@/app/lib/structured-data";
import "./globals.css";

/**
 * Site-wide metadata. Three fields here are load-bearing and easy to lose:
 *
 * - `metadataBase` — without it every relative OG/Twitter image URL is emitted
 *   relative, and social crawlers resolve nothing. It lived on `/dashboard/[id]`
 *   alone until now, so every other page unfurled with no card at all.
 * - `title.template` — pages set a BARE title (`"Gallery"`); the suffix is added
 *   here, so no page has to remember to spell the brand and none can spell it
 *   differently. `title.default` is what the homepage and any page without its
 *   own title gets.
 * - `alternates.canonical: "/"` — resolved against `metadataBase`, and inherited
 *   as a *relative* base by child routes, which each set their own. Every public
 *   page therefore emits a canonical whether or not its author thought about it.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_TITLE_SUFFIX}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "market dashboard",
    "AI generated dashboard",
    "stock dashboard",
    "crypto dashboard",
    "market terminal",
    "open source trading terminal",
    "Claude Code skill",
    "coding agent",
    "dashboard.json",
    "free stock market dashboard",
  ],
  authors: [{ name: "Zentry" }],
  creator: "Zentry",
  publisher: "Zentry",
  alternates: { canonical: "/" },
  // The card headline is NOT the `<title>`. A search result's title has one job
  // (be the keyword-first answer to a query); a share card's has another (be the
  // line someone reads in a Slack channel), so it carries the tagline instead.
  // Both come through `pageSocial` so the root cannot lose its own image either.
  ...pageSocial({
    path: "/",
    title: `${SITE_TAGLINE} · ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  }),
  // Search Console ownership, from the environment. The key is omitted entirely
  // when unset rather than emitted blank: Google fails an empty `content`, so a
  // blank tag is worse than none. See the note in site.ts.
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
  // Explicit rather than left to the default: `max-image-preview: large` is what
  // lets the OG card run full width in a result, and `max-snippet: -1` removes
  // the snippet length cap that otherwise truncates an answer mid-sentence.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false, address: false, email: false },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: BRAND_BG,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-zf-demo: the explorer is mock-data-only, so the demo flag is static.
    // globals.css hides every card's provider attribution under it — simulated
    // numbers must not carry a real source's name. On <html> so each /embed/*
    // iframe document (its own <html>) carries its own flag too.
    <html lang="en" data-zf-demo="">
      <head>
        {/* Webfonts as <link>s, not a CSS @import (see globals.css header):
            preconnect + parallel discovery instead of a render-blocking chain
            behind the app stylesheet. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..800&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
        {/* `/llms.txt` — the whole site as one plain-text document for a language
            model. It was reachable only by guessing the URL: nothing on the site
            and nothing in robots.txt pointed at it, and a file no crawler is told
            about is a file no crawler reads. A raw <link> rather than
            `alternates.types` in metadata, because a page setting its own
            `alternates` (all four of ours do, for the canonical) replaces the
            root's object outright and would silently drop this. */}
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title={`${SITE_NAME} for language models`}
        />
      </head>
      {/* AppShell owns the chrome and hides it on /embed/* (iframed live boards).
          The flex-column / sticky-footer scaffold lives inside AppShell now. */}
      <body className="min-h-screen">
        {/* Site-level identity graphs, emitted once for every route. Page-level
            graphs (FAQ, HowTo, per-board) reference these by @id. */}
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
