import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME, SITE_TAGLINE } from "@/app/lib/site";

/**
 * The site-wide 1200×630 card, as an explicit image entry.
 *
 * `url` is the route the `app/opengraph-image.tsx` file convention generates.
 * Referencing it by path rather than re-deriving it keeps exactly one card image
 * on the site; the cost is that the path and the file have to stay in step,
 * which `seo.test.ts` asserts by checking the file is on disk.
 *
 * `width`/`height` are stated because a card with no declared dimensions is
 * fetched and measured by every unfurl service before it renders, and some give
 * up first.
 */
export const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}: ${SITE_TAGLINE}`,
} as const;

/**
 * Complete-object social metadata for one page.
 *
 * ## The trap this exists to close
 *
 * Next merges `metadata` ONE TOP-LEVEL FIELD AT A TIME (see
 * `next/dist/lib/metadata/resolve-metadata.js`, `case "openGraph"`): a page that
 * exports `openGraph: { title, description, url }` REPLACES the resolved
 * `openGraph` object outright — and the `app/opengraph-image.tsx` file
 * convention was merged into that object one segment up, at the root. The page
 * therefore ships with **no `og:image` at all**.
 *
 * That was not hypothetical. `/gallery`, `/catalogue` and `/tinker` each set
 * `openGraph` without `images`, and each unfurled in Slack, X, Discord and
 * LinkedIn as a bare link. It stayed invisible because all three *did* have
 * `og:title` and `og:description` — everything looked wired up.
 *
 * `twitter` has the identical shape of failure plus one of its own: a page that
 * sets `openGraph` alone keeps the ROOT's `twitter:title`/`twitter:description`,
 * so its X card advertised the homepage under the page's URL.
 *
 * So this returns BOTH objects, complete, every time. A page spreads it and
 * cannot get a partial merge — there is no half of it left to forget.
 *
 * A page with its own `opengraph-image.tsx` (`/dashboard/[id]`) must NOT use
 * this: the file convention at that segment is exactly what should win, and
 * naming an image here would beat it.
 */
export function pageSocial({
  path,
  title,
  description,
}: {
  /** Site-relative path of the page, e.g. `/gallery`. */
  path: string;
  /** The card headline. The ` · zframes` title template does not apply here, so spell the brand. */
  title: string;
  /** The card body. May differ from the meta description — a card has more room. */
  description: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: absoluteUrl(path),
      title,
      description,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}
