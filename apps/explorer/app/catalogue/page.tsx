import { FRAME_CATEGORIES } from "@zframes/spec/frame";
import { allFrameMetas } from "@zframes/frames/schemas";
import type { Metadata } from "next";
import CatalogueClient from "@/app/catalogue/CatalogueClient";
import { FrameIndex } from "@/app/catalogue/FrameIndex";
import { absoluteUrl, SITE_NAME } from "@/app/lib/site";
import { breadcrumbJsonLd, JsonLd, SITE_ID } from "@/app/lib/structured-data";

/**
 * The frame catalogue.
 *
 * This was a `"use client"` page whose entire body was a `ssr: false` dynamic
 * import — so the most content-dense page on the site served exactly the words
 * "Loading catalogue…" to anything that does not execute JavaScript, and had no
 * `<h1>`, no description and no metadata at all.
 *
 * It is a Server Component now. The heading, the intro, the structured data and
 * the full text index of every frame render on the server; only the live grid
 * (which mounts real frames against browser APIs) stays client-only, behind the
 * thin `CatalogueClient` boundary.
 *
 * `allFrameMetas` comes from `@zframes/frames/schemas`, the React-free metadata
 * twin of the registry — the only frames import that is safe here. Importing
 * `@zframes/frames/lazy` would pull every frame component into the server graph
 * and break `next build` on the first one using `useState`.
 */
const FRAME_COUNT = allFrameMetas.length;
const FAMILY_COUNT = FRAME_CATEGORIES.length;

export const metadata: Metadata = {
  title: "Frame catalogue",
  description: `Browse all ${FRAME_COUNT} ${SITE_NAME} frames across ${FAMILY_COUNT} families — live price charts, company fundamentals, macro and rates, metals, Bitcoin and on-chain, options, FX, housing and sentiment. Every one is keyless and free.`,
  alternates: { canonical: "/catalogue" },
  openGraph: {
    title: `Frame catalogue · ${SITE_NAME}`,
    description: `All ${FRAME_COUNT} frames a ${SITE_NAME} dashboard can be built from, every one rendered in the browser.`,
    url: absoluteUrl("/catalogue"),
    type: "website",
  },
};

export default function CataloguePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Frame catalogue", path: "/catalogue" },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${SITE_NAME} frame catalogue`,
          url: absoluteUrl("/catalogue"),
          description: `All ${FRAME_COUNT} frames a ${SITE_NAME} dashboard can be built from, grouped into ${FAMILY_COUNT} families.`,
          isPartOf: { "@id": SITE_ID },
          // The FAMILIES, not the 255 individual frames. Every frame's name and
          // description is already in the page text below, where an answer engine
          // reads it as prose; repeating all of it as JSON would add tens of
          // kilobytes to every request to restate what the HTML already says.
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: FRAME_CATEGORIES.length,
            itemListElement: FRAME_CATEGORIES.map((category, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: category.label,
              description: category.description,
            })),
          },
        }}
      />

      {/* Server-rendered: the page's only <h1> and its intro. CatalogueView
          renders neither — it cannot, being client-only. */}
      <header className="mb-10 max-w-3xl">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          The frame <span className="text-indigo-200">catalogue</span>
        </h1>
        <p className="mt-3 text-base leading-relaxed text-white/75">
          Every built-in frame, rendered and grouped by family. Each renders
          with a schema-default config — the same set an agent picks from when
          generating a dashboard. {FRAME_COUNT} frames, {FAMILY_COUNT} families,
          all keyless: no API key and no account to view any of them.
        </p>
      </header>

      <CatalogueClient />
      <FrameIndex />
    </main>
  );
}
