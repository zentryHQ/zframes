import type { Metadata } from "next";
import type { BoardListing } from "@/app/lib/board-summary";
import { listCommunity, listCurated } from "@/app/lib/dashboards";
import { absoluteUrl, clampSnippet, SITE_NAME } from "@/app/lib/site";
import { pageSocial } from "@/app/lib/social";
import { breadcrumbJsonLd, JsonLd, SITE_ID } from "@/app/lib/structured-data";
import { GalleryView } from "./GalleryView";

/**
 * Cached, not per-request — same reasoning as `/` and `/dashboard/[id]`: the
 * board list changes when someone publishes, not when someone visits, and a
 * database blip then serves the last good copy rather than an empty gallery.
 *
 * This page used to be a bare `<GalleryView />` that fetched `/api/dashboards`
 * from the browser, which meant the server HTML contained three skeleton cards
 * and not one board title. The rows are fetched here now and handed down as
 * `initial`, so the gallery's actual content — every board's title, blurb and
 * link — is in the document a crawler receives. The client refetches on mount
 * only when this seed comes up empty (a DB blip — the fetch is the recovery
 * path).
 */
export const revalidate = 300; // 5 minutes

export const metadata: Metadata = {
  title: "Dashboard gallery",
  // Clamped, not trusted: this ran to 216 characters, so a search result showed
  // roughly two thirds of it and stopped mid-clause.
  description: clampSnippet(
    `Curated and community ${SITE_NAME} dashboards for stocks, crypto, macro and metals. Preview any board in the browser, then fork it onto your own machine.`,
  ),
  alternates: { canonical: "/gallery" },
  // Spread, never hand-written: an inline `openGraph` here replaces the root's
  // object and takes the share card with it. See app/lib/social.ts.
  ...pageSocial({
    path: "/gallery",
    title: `Dashboard gallery · ${SITE_NAME}`,
    description: `Market dashboards you can preview in the browser and fork onto your own machine.`,
  }),
};

export default async function GalleryPage() {
  let initial: { curated: BoardListing[]; community: BoardListing[] } = {
    curated: [],
    community: [],
  };
  try {
    // Both queries project the listing shape in SQL — no specs over the wire.
    const [curated, community] = await Promise.all([
      listCurated(),
      listCommunity(),
    ]);
    initial = { curated, community };
  } catch (err) {
    // The client fetch on mount is the recovery path — an unreachable database
    // costs the server-rendered copy, not the page.
    console.error("[gallery] could not load boards:", err);
  }

  const boards = [...initial.curated, ...initial.community];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Gallery", path: "/gallery" },
        ])}
      />
      {boards.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${SITE_NAME} dashboard gallery`,
            url: absoluteUrl("/gallery"),
            description: `Curated and community-published ${SITE_NAME} market dashboards.`,
            isPartOf: { "@id": SITE_ID },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: boards.length,
              itemListElement: boards.map((board, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: board.title,
                url: absoluteUrl(`/dashboard/${board.id}`),
              })),
            },
          }}
        />
      )}
      <GalleryView initial={initial} />
    </>
  );
}
