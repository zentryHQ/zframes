import type { Metadata } from "next";
import { listLandingBoards } from "@/app/lib/dashboards";
import { faqJsonLd } from "@/app/lib/faq";
import {
  howToJsonLd,
  JsonLd,
  softwareApplicationJsonLd,
} from "@/app/lib/structured-data";
import LandingView from "@/app/LandingView";

/**
 * The front door's server half. Everything visual lives in `LandingView`
 * (`"use client"` — the parallax card stack); this exists only to fetch the
 * showcase boards, which moved from a static module into the `dashboards` table
 * on 2026-08-05 and so can no longer be a plain import.
 *
 * Cached, not per-request. The homepage is the most-hit page on the site and the
 * showcase changes when someone edits a row, not when someone visits — so it
 * revalidates on a timer instead of querying on every request. That also means a
 * database blip serves the last good copy rather than an empty front door, which
 * is the property the static module used to give for free and the one thing worth
 * paying attention to when moving content into a database.
 */
export const revalidate = 300; // 5 minutes

// Title, description, OG and canonical for `/` all come from the root layout's
// defaults — this only pins the canonical explicitly so the homepage is immune to
// a stray query string (?ref=, utm_*) minting a duplicate.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  // A failed query renders the page WITHOUT the showcase rather than a 500: the
  // landing is also the install instructions, the frame catalogue and the pitch,
  // and none of that needs a database.
  let boards: Awaited<ReturnType<typeof listLandingBoards>> = [];
  try {
    boards = await listLandingBoards();
  } catch (err) {
    console.error("[landing] could not load showcase boards:", err);
  }
  return (
    <>
      {/* Three graphs, each answering a different question a search or answer
          engine asks of a homepage: what is this product (SoftwareApplication,
          including the price-0 offer that makes "is it free" answerable from
          markup alone), how do I use it (HowTo, mirroring the visible Act IV
          steps), and the direct Q&A (FAQPage, mirroring the visible FAQ below —
          Google's policy requires that the marked-up answers appear on the page,
          and both are rendered from the same array). */}
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={howToJsonLd()} />
      <JsonLd data={faqJsonLd()} />
      <LandingView boards={boards} />
    </>
  );
}
