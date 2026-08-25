import type { MetadataRoute } from "next";
import {
  BRAND_ACCENT,
  BRAND_BG,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
} from "@/app/lib/site";

/**
 * `/manifest.webmanifest`.
 *
 * Not here to make the explorer installable as an app — it is a shop window, not
 * a tool you keep open. It exists because the manifest is where a crawler, a
 * browser's "add to home screen" sheet, and a link-preview UI look for the site's
 * name, icon and theme colour, and leaving it absent means each of them guesses
 * from the URL. `display: "browser"` says as much: normal web page, no app shell.
 *
 * Icons point at the two files the App Router already serves from `app/`
 * (`icon.svg`, `apple-icon.png`), so there is one set of brand assets, not two.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // The SAME string as the `<title>`, not a fourth phrasing of the pitch. The
    // manifest is one of the places a crawler and a link-preview UI look for the
    // site's name, so a variant here is a variant an answer engine may quote.
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: BRAND_BG,
    theme_color: BRAND_ACCENT,
    categories: ["finance", "developer", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
