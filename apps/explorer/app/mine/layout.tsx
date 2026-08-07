import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A layout purely to carry metadata: `page.tsx` here is `"use client"`, and a
 * Client Component cannot export `metadata`. This is the standard App Router
 * escape hatch, and it is why the noindex lives one level up.
 *
 * `robots.txt` also disallows `/mine`, but that is a *crawl* directive — a URL
 * linked from elsewhere can still be listed without ever being fetched. This is
 * the *index* directive. Neither alone is sufficient.
 */
export const metadata: Metadata = {
  title: "My dashboards",
  robots: { index: false, follow: false },
};

export default function MineLayout({ children }: { children: ReactNode }) {
  return children;
}
