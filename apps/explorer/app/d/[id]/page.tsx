import { notFound } from "next/navigation";
import { CURATED } from "@/app/lib/curated-dashboards";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { DashboardPreview } from "./DashboardPreview";

// Prerender the curated ids; community (DB) ids render dynamically on demand.
export function generateStaticParams() {
  return CURATED.map((d) => ({ id: d.id }));
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
