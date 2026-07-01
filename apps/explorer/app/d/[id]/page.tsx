import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CURATED } from "@/app/lib/curated-dashboards";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { DashboardPreview } from "./DashboardPreview";

// Prerender the curated ids; community (DB) ids render dynamically on demand.
export function generateStaticParams() {
  return CURATED.map((d) => ({ id: d.id }));
}

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
    metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:37264"),
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "zframes.explorer" },
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
  return <DashboardPreview id={entry.id} title={entry.title} spec={entry.spec} />;
}
