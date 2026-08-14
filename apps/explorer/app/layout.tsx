import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/app/lib/AppShell";
import {
  BRAND_BG,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE_SUFFIX,
  SITE_URL,
} from "@/app/lib/site";
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
    default: `${SITE_NAME} — free, open-source market terminals your AI agent builds`,
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
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: SITE_URL,
    title: `${SITE_NAME} — free, open-source market terminals your AI agent builds`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — free, open-source market terminals your AI agent builds`,
    description: SITE_DESCRIPTION,
  },
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
