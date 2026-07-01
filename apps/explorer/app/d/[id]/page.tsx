import { notFound } from "next/navigation";
import { CURATED, curatedById } from "@/app/lib/curated-dashboards";
import { DashboardPreview } from "./DashboardPreview";

// Prerender the known curated ids (Phase 3: this becomes dynamic Neon lookups).
export function generateStaticParams() {
  return CURATED.map((d) => ({ id: d.id }));
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Next 15: params is async
  const entry = curatedById(id);
  if (!entry) notFound();
  return <DashboardPreview id={entry.id} title={entry.title} spec={entry.spec} />;
}
