import type { Metadata } from "next";
import type { ReactNode } from "react";
import { absoluteUrl, SITE_NAME } from "@/app/lib/site";

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
  description: `Open a ${SITE_NAME} dashboard spec in the browser editor: drag, resize and reconfigure frames against live keyless market data. No install, no account.`,
  alternates: { canonical: "/tinker" },
  openGraph: {
    title: `Tinker · ${SITE_NAME}`,
    description: `Edit a live market dashboard in the browser — drag, resize and reconfigure frames against real data.`,
    url: absoluteUrl("/tinker"),
    type: "website",
  },
};

export default function TinkerLayout({ children }: { children: ReactNode }) {
  return children;
}
