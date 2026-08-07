import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { absoluteUrl, ORG_NAME, SITE_NAME } from "@/app/lib/site";
import {
  breadcrumbJsonLd,
  JsonLd,
  ORG_ID,
  SITE_ID,
} from "@/app/lib/structured-data";
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

/**
 * Per-dashboard unfurl and search listing. The og:image is wired automatically
 * by the sibling `opengraph-image.tsx`.
 *
 * `metadataBase` used to live here — set from `BETTER_AUTH_URL`, which is the
 * auth callback origin and in dev is `http://localhost:37264`. It is now in the
 * root layout, resolved from the canonical site URL, so every page inherits an
 * absolute OG image and no page can be built pointing social crawlers at
 * localhost.
 *
 * Two things here are load-bearing beyond the copy:
 *
 * - **`robots: noindex` for unlisted boards.** "Unlisted" means anyone-with-link,
 *   which is only true as long as the link stays out of a search index. This is
 *   the half a crawler reads on the page; `listIndexableBoards` keeping unlisted
 *   rows out of `sitemap.xml` is the half that stops us submitting them.
 * - **`alternates.canonical`.** These URLs get shared with tracking parameters
 *   on the end, and each variant is otherwise a separate, duplicate page.
 */
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
  // A curated board carries an editorial one-liner; use it. It is a real
  // sentence about that board, and it is what a search snippet or an AI summary
  // will quote — the generated fallback below says the same thing about every
  // board on the site.
  const description = entry
    ? entry.description?.trim()
      ? `${entry.description.trim()} A live ${frameCount}-frame ${SITE_NAME} dashboard — preview it with real data, or fork it onto your machine with your AI agent.`
      : `A live ${frameCount}-frame market dashboard on ${SITE_NAME} — preview it live with real keyless data, or fork it onto your machine with your AI agent.`
    : `A live market dashboard on ${SITE_NAME}.`;
  const indexable = !!entry && entry.visibility === "listed";

  return {
    title,
    description,
    alternates: { canonical: `/dashboard/${id}` },
    robots: indexable ? undefined : { index: false, follow: false },
    keywords: entry?.tags?.length ? entry.tags : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: SITE_NAME,
      url: absoluteUrl(`/dashboard/${id}`),
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

  const frames = (entry.spec as { frames?: unknown[] })?.frames;
  const frameCount = Array.isArray(frames) ? frames.length : 0;

  return (
    <>
      {/* Structured data only for boards that may be indexed. An unlisted board
          is `noindex`; describing it to a crawler in machine-readable form would
          be working against that. */}
      {entry.visibility === "listed" && (
        <>
          <JsonLd
            data={breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Gallery", path: "/gallery" },
              { name: entry.title, path: `/dashboard/${entry.id}` },
            ])}
          />
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: entry.title,
              url: absoluteUrl(`/dashboard/${entry.id}`),
              description:
                entry.description?.trim() ||
                `A live ${frameCount}-frame market dashboard on ${SITE_NAME}.`,
              isPartOf: { "@id": SITE_ID },
              datePublished: entry.createdAt.toISOString(),
              dateModified: entry.updatedAt.toISOString(),
              inLanguage: "en",
              keywords: entry.tags.length ? entry.tags.join(", ") : undefined,
              // Curated boards are ours; a community publish is its author's,
              // and we deliberately do not name them here — the gallery does not
              // show authorship either.
              ...(entry.curated
                ? { author: { "@id": ORG_ID }, creator: { "@id": ORG_ID } }
                : { publisher: { "@type": "Organization", name: ORG_NAME } }),
            }}
          />
        </>
      )}
      <DashboardPreview
        id={entry.id}
        title={entry.title}
        spec={entry.spec}
        likes={entry.likes}
      />
    </>
  );
}
