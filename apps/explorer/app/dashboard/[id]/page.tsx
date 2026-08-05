import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { DashboardPreview } from "./DashboardPreview";

/**
 * NOT prerendered — cached on first request instead (ISR).
 *
 * There was a `generateStaticParams` here that baked the curated ids in at build
 * time. It went with the move of the showcase from code into the `dashboards`
 * table (2026-08-05), for two reasons, the first of which is the whole point of
 * that move:
 *
 *  1. Prerendering content that lives in a mutable table defeats the purpose. A
 *     board edited with SQL would not appear until the next deploy — which is
 *     exactly the "you must ship code to change a board" problem we were removing.
 *  2. It made `next build` depend on a reachable database. In dev that database
 *     is the single-connection PGlite socket and the build prerenders with 11
 *     workers, so they raced it and the build died on `ECONNRESET`.
 *
 * `revalidate` keeps the win that prerendering was buying: the first request
 * renders and caches, every request after that is served from the cache until the
 * window expires. A board is stale by at most this long after an edit.
 */
export const revalidate = 300; // 5 minutes

// Per-dashboard unfurl. The og:image is wired automatically by the sibling
// opengraph-image.tsx; here we set the title/description text + metadataBase
// (so the image URL resolves absolute for social crawlers). metadataBase lives
// here rather than in the root layout to avoid touching the parallel UI work.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = await resolveDashboard(id);
  const frames = (entry?.spec as { frames?: unknown[] })?.frames;
  const frameCount = Array.isArray(frames) ? frames.length : 0;
  const title = entry?.title ?? "Dashboard";
  const description = entry
    ? `A live ${frameCount}-frame market dashboard on zframes — preview it live, or fork it onto your machine with your AI.`
    : "A live market dashboard on zframes.";
  return {
    metadataBase: new URL(
      process.env.BETTER_AUTH_URL ?? "http://localhost:37264",
    ),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "zframes.explorer",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Next 15: params is async
  const entry = await resolveDashboard(id); // curated OR community
  if (!entry) notFound();
  return (
    <DashboardPreview id={entry.id} title={entry.title} spec={entry.spec} />
  );
}
