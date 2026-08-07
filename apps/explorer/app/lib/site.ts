/**
 * One source of truth for the site's identity — canonical origin, name, the
 * boilerplate description, and the handful of off-site URLs the metadata,
 * sitemap, robots, structured data and `llms.txt` all have to agree on.
 *
 * React- and DB-free on purpose: it is imported by route handlers, the metadata
 * conventions (`sitemap.ts`, `robots.ts`, `manifest.ts`) and server components
 * alike, and none of them should drag anything else in behind it.
 */

/**
 * The canonical origin, no trailing slash.
 *
 * Hard-coded to production with an env override rather than derived from the
 * request or from `VERCEL_URL`. That is deliberate and is the whole point of a
 * canonical: a preview deployment renders `<link rel="canonical">` pointing at
 * production, so the duplicate copy of the site sitting on a `*.vercel.app`
 * hostname consolidates into the real one instead of competing with it. (Those
 * deployments are also `noindex`-ed outright — see `robots.ts`.)
 *
 * `BETTER_AUTH_URL` is NOT consulted. It is the auth callback origin, which in
 * dev is `http://localhost:37264`; letting it win here would silently publish
 * localhost canonicals the moment someone built with a dev `.env` present.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://frames.zentry.com"
).replace(/\/+$/, "");

export const SITE_NAME = "zframes";

/** Used as the `%s · zframes` title suffix and the OG/schema `siteName`. */
export const SITE_TITLE_SUFFIX = SITE_NAME;

/** The one-line pitch. Kept under ~160 chars so it survives as a SERP snippet. */
export const SITE_DESCRIPTION =
  "Describe the market dashboard you want and your AI coding agent builds it — live stocks and crypto, no API keys, no account. Free and open source (Apache-2.0).";

/**
 * The longer pitch, for surfaces with room: the OG card body, `llms.txt`, and
 * the `SoftwareApplication` schema. Answer engines quote from this, so it states
 * the facts a summary needs (what it is, what it costs, what you end up owning)
 * rather than adjectives.
 */
export const SITE_LONG_DESCRIPTION =
  "zframes is a free, open-source framework for AI-generated market dashboards. You install a skill into your coding agent (Claude Code, Cursor, Codex, Gemini), describe what you want to watch, and the agent writes a dashboard.json that the zframes CLI serves locally as a live terminal — stocks and crypto, from keyless public data sources, with no API keys, no signup and no hosted service.";

export const REPO_URL = "https://github.com/zentryhq/zframes";
export const NPM_URL = "https://www.npmjs.com/package/zframes";
export const ORG_NAME = "Zentry";
export const LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0";

/** The install command the whole site leads with. */
export const INSTALL_COMMAND = "npx skills add zentryhq/zframes";

/** Brand background, reused by the manifest, `theme-color`, and the OG card. */
export const BRAND_BG = "#06060b";
export const BRAND_ACCENT = "#818cf8";

/** Absolute URL for a site-relative path — what canonicals and sitemaps need. */
export function absoluteUrl(path = "/"): string {
  return path.startsWith("http")
    ? path
    : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * True only on the real production deployment.
 *
 * `VERCEL_ENV` is `production` | `preview` | `development`; it is absent when the
 * app runs anywhere else (a local `next start`, a container), and in that case we
 * fall back to `NODE_ENV`. Preview builds resolve to false, which is what makes
 * `robots.ts` disallow them wholesale.
 */
export function isProductionDeployment(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

/**
 * Paths that must never be indexed, shared by `robots.ts` and the per-route
 * `robots: { index: false }` metadata.
 *
 * Both halves exist on purpose. `robots.txt` stops a crawler fetching the page at
 * all — but it is a *crawl* directive, so a URL that is linked from elsewhere can
 * still surface in results without ever being fetched. The per-route meta tag is
 * the *index* directive, and a crawler can only read it on a page it is allowed
 * to fetch. Belt and braces, and neither one alone is sufficient.
 */
export const PRIVATE_PATHS = [
  "/api/",
  "/embed/", // chrome-less duplicate of /dashboard/<id>, for iframes only
  "/mine", // the signed-in user's own boards
  "/signin",
] as const;

/**
 * Every fixed, indexable route. The sitemap's static half, and the list a test
 * asserts against so a new public page can't be added without appearing here.
 *
 * `changeFrequency` is advisory only (Google has said for years it ignores it);
 * `priority` likewise. They are cheap, other crawlers still read them, and they
 * cost one field each — but no decision here should depend on them.
 */
export const STATIC_ROUTES: {
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/gallery", changeFrequency: "daily", priority: 0.9 },
  { path: "/catalogue", changeFrequency: "weekly", priority: 0.9 },
  { path: "/tinker", changeFrequency: "monthly", priority: 0.5 },
];
