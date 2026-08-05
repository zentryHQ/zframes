import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { EmbedBoard } from "./EmbedBoard";

// Chrome-less live-board route, iframed by the landing parallax showcase. Same
// render path + resolver as /dashboard/[id], minus the site shell (AppShell hides
// chrome on /embed/*).
//
// Cached on first request rather than prerendered, for the same two reasons as
// /dashboard/[id] — see the note there.
export const revalidate = 300; // 5 minutes

// Not a standalone destination — kept out of the index; the canonical preview is
// /dashboard/[id]. (Framing is allowed same-origin only via the next.config header rule.)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Next 15: params is async
  const entry = await resolveDashboard(id); // curated OR community
  if (!entry) notFound();
  return <EmbedBoard spec={entry.spec} />;
}
