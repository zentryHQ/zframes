import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CURATED } from "@/app/lib/curated-dashboards";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { EmbedBoard } from "./EmbedBoard";

// Chrome-less live-board route, iframed by the landing parallax showcase. Same
// render path + resolver as /d/[id], minus the site shell (AppShell hides chrome
// on /embed/*). Curated ids prerender; community (DB) ids render on demand.
export function generateStaticParams() {
  return CURATED.map((d) => ({ id: d.id }));
}

// Not a standalone destination — kept out of the index; the canonical preview is
// /d/[id]. (Framing is allowed same-origin only via the next.config header rule.)
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
