import { toBoardSummary } from "@/app/lib/board-summary";
import { listLandingBoards } from "@/app/lib/dashboards";
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
  return <LandingView boards={boards.map(toBoardSummary)} />;
}
