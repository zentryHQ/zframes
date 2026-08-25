import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_NAME } from "@/app/lib/site";
import { pageSocial } from "@/app/lib/social";
import { breadcrumbJsonLd, JsonLd } from "@/app/lib/structured-data";

/**
 * Metadata carrier for the client `page.tsx` below it (see app/mine/layout.tsx).
 *
 * Unlike the other two client pages this one IS indexable: "edit a market
 * dashboard in the browser, no install" is a real thing someone searches for,
 * and it is a genuine entry point into the product. It just had no title,
 * description or canonical of its own until now, so it competed with the
 * homepage under the site's default title.
 */
export const metadata: Metadata = {
  title: "Tinker — edit a dashboard in the browser",
  description: `Open a ${SITE_NAME} dashboard spec in the browser editor: drag, resize and reconfigure frames. No install, no account.`,
  alternates: { canonical: "/tinker" },
  // Spread, never hand-written: an inline `openGraph` here replaces the root's
  // object and takes the share card with it. See app/lib/social.ts.
  ...pageSocial({
    path: "/tinker",
    title: `Tinker · ${SITE_NAME}`,
    description: `Edit a market dashboard in the browser — drag, resize and reconfigure frames.`,
  }),
};

export default function TinkerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The breadcrumb lives in the layout because `page.tsx` here is
          `"use client"` — and structured data injected after hydration is missed
          by every answer-engine crawler that does not run JS, which is most of
          them. `/tinker` was the one indexable page on the site without a trail. */}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Tinker", path: "/tinker" },
        ])}
      />
      {children}
    </>
  );
}
