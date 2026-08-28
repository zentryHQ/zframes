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

/**
 * The ONE tagline. It is the hero `<h1>`, the share card's headline, the
 * manifest name, the footer blurb and `Organization.slogan` — five surfaces that
 * carried three different claims between them until now.
 *
 * Why one line matters more than which line: an answer engine quoting the site
 * repeats whichever phrasing it hit first, and a product described three ways is
 * a product with no memorable description at all. `seo.test.ts` pins that the
 * manifest and the Organization node both still spell it.
 */
export const SITE_TAGLINE = "Describe your dashboard. An agent builds it.";

/**
 * The homepage `<title>`, and the default for any page that sets none.
 *
 * Two constraints, both from how a result is actually rendered: it stays under
 * ~60 characters so Google shows it rather than rewriting it, and it leads with
 * the CATEGORY term someone searches ("market dashboards") rather than assuming
 * the brand is the category, which an unknown brand cannot. Title Case, because
 * a lowercase title invites Google to recapitalise it into its own.
 *
 * It deliberately covers different ground to `SITE_DESCRIPTION` below: the title
 * says what class of thing this is and what it costs, the description says how it
 * works. Saying the same thing twice wastes one of the only two strings we
 * control in a search result.
 */
export const SITE_TITLE = `${SITE_NAME}: AI-Built Market Dashboards, Free and Open Source`;

/**
 * The meta description: the SERP snippet, and the sentence an answer engine
 * lifts when asked "what is zframes".
 *
 * It opens `zframes is a …` on purpose. Google discards a description it cannot
 * use as a standalone answer, and marketing phrasing ("describe the dashboard
 * you want and…") is exactly that — it needs the page around it to mean
 * anything. A definitional first clause survives being quoted alone, which is
 * the entire job. Under 160 chars so it is not cut mid-sentence.
 */
export const SITE_DESCRIPTION =
  "zframes is a framework for live stock and crypto dashboards: tell your AI coding agent what to watch and it writes a dashboard.json you run yourself.";

/**
 * The longer pitch, for surfaces with room: the OG card body, `llms.txt`, and
 * the `SoftwareApplication` schema. Answer engines quote from this, so it states
 * the facts a summary needs (what it is, what it costs, what you end up owning)
 * rather than adjectives.
 */
export const SITE_LONG_DESCRIPTION =
  "zframes is a free, open-source framework for AI-generated market dashboards. You install a skill into your coding agent (Claude Code, Cursor, Codex, Gemini), describe what you want to watch, and the agent writes a dashboard.json that the zframes CLI serves locally as a live terminal — stocks and crypto, with no signup and no hosted service.";

export const REPO_URL = "https://github.com/zentryhq/zframes";
export const NPM_URL = "https://www.npmjs.com/package/zframes";
export const ORG_NAME = "Zentry";
export const LICENSE_URL = "https://opensource.org/license/mit";

/** The install command the whole site leads with. */
export const INSTALL_COMMAND = "npx skills add zentryhq/zframes";

/** Brand background, reused by the manifest, `theme-color`, and the OG card. */
export const BRAND_BG = "#06060b";
export const BRAND_ACCENT = "#818cf8";

/**
 * The Search Console ownership token, served as `<meta
 * name="google-site-verification">` when set.
 *
 * Environment only, with no default: the token belongs to whoever owns the
 * property, and a value baked into a public repo is one every fork and every
 * staging clone would also serve. Unset means the tag is omitted entirely — an
 * empty `content` fails Google's check, which is worse than no tag at all.
 *
 * `NEXT_PUBLIC_` rather than a bare name because `site.ts` is imported by client
 * components too; a server-only var would read as `undefined` in that half of
 * the bundle. The consequence to remember: the value is inlined at BUILD time,
 * so changing it in Vercel needs a redeploy, not just a restart.
 */
export const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "";

/**
 * Where a search snippet stops being read. Google's cutoff moves and is measured
 * in pixels rather than characters, but ~155 is the width that survives on both
 * desktop and mobile without an ellipsis.
 */
export const SNIPPET_MAX = 155;

/**
 * Trim a description to something that fits in a result.
 *
 * A description longer than the cutoff is not "a bit long" — it is cut by Google
 * mid-sentence, so the last thing a searcher reads is half a clause. Three pages
 * shipped past it (`/boards` at 216, `/frames` at 174, every board page at
 * 300) because each was written as a paragraph and nobody counted.
 *
 * Prefers to end on a sentence boundary, because a snippet that ends in a full
 * stop reads as a complete answer and is what an answer engine will lift. Falls
 * back to a word boundary with an ellipsis when there is no sentence to end on,
 * which is still better than Google's own mid-word cut.
 */
export function clampSnippet(text: string, max = SNIPPET_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const head = clean.slice(0, max);
  // Only accept a sentence break in the back half — ending at 20% of the
  // intended length is a worse snippet than an ellipsis at 100%.
  const sentence = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("? "),
    head.lastIndexOf("! "),
  );
  if (sentence > max * 0.6) return clean.slice(0, sentence + 1);

  const word = head.lastIndexOf(" ");
  return `${clean.slice(0, word > 0 ? word : max).replace(/[,;:—-]$/, "")}…`;
}

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
  { path: "/boards", changeFrequency: "daily", priority: 0.9 },
  { path: "/frames", changeFrequency: "weekly", priority: 0.9 },
  { path: "/editor", changeFrequency: "monthly", priority: 0.5 },
];
