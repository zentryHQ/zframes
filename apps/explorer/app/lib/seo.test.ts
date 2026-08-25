import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAQ, faqJsonLd } from "@/app/lib/faq";
import {
  absoluteUrl,
  clampSnippet,
  isProductionDeployment,
  PRIVATE_PATHS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_TITLE,
  SITE_URL,
  SNIPPET_MAX,
  STATIC_ROUTES,
} from "@/app/lib/site";
import { SOCIAL_IMAGE } from "@/app/lib/social";
import {
  APP_ID,
  breadcrumbJsonLd,
  howToJsonLd,
  ORG_ID,
  organizationJsonLd,
  SITE_ID,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/app/lib/structured-data";

/**
 * Guards for the SEO/AEO surface.
 *
 * The thing worth testing here is not the metadata strings — those are copy, and
 * a test asserting copy is a change-detector. It is the handful of places where
 * a plausible future edit silently breaks discoverability with no other symptom:
 * a new public page never reaching the sitemap, a private path quietly dropping
 * out of the disallow list, a preview deployment starting to advertise itself as
 * indexable, or the FAQ markup drifting away from the FAQ a visitor can read.
 * None of those produce an error anywhere — they just stop working.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site config", () => {
  it("is an https origin with no trailing slash", () => {
    // A trailing slash here doubles up in every absoluteUrl() call
    // (`https://x.com//gallery`), which is a different URL to every crawler.
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  it("builds absolute URLs and leaves absolute ones alone", () => {
    expect(absoluteUrl("/gallery")).toBe(`${SITE_URL}/gallery`);
    expect(absoluteUrl("gallery")).toBe(`${SITE_URL}/gallery`);
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
    expect(absoluteUrl("https://example.com/x")).toBe("https://example.com/x");
  });
});

describe("static route inventory", () => {
  /**
   * Every routable directory directly under `app/`, minus the ones that are
   * deliberately not indexable. If someone adds a public page, this fails until
   * they decide which side of the line it is on — which is the whole point: the
   * failure mode being prevented is a page that exists, works, and is never
   * submitted to a search engine because nobody remembered a second file.
   */
  const NON_INDEXABLE = new Set([
    "api", // JSON endpoints
    "embed", // chrome-less duplicate of /dashboard/[id]
    "mine", // per-user
    "signin", // auth
    "dashboard", // dynamic; enumerated from the database in sitemap.ts
    "components", // not a route (colocated UI)
    "lib", // not a route (colocated helpers)
    "llms.txt", // a text route handler, linked from the root <link rel="alternate">
  ]);

  const routeDirs = readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_") && !NON_INDEXABLE.has(name));

  it("lists every public top-level route in STATIC_ROUTES", () => {
    const listed = new Set(STATIC_ROUTES.map((route) => route.path));
    for (const dir of routeDirs) {
      expect(
        listed.has(`/${dir}`),
        `app/${dir}/ is a public route but is missing from STATIC_ROUTES in app/lib/site.ts — it will never reach sitemap.xml`,
      ).toBe(true);
    }
  });

  it("includes the homepage and no duplicates", () => {
    const paths = STATIC_ROUTES.map((route) => route.path);
    expect(paths).toContain("/");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("never lists a private path", () => {
    for (const route of STATIC_ROUTES) {
      for (const priv of PRIVATE_PATHS) {
        expect(route.path.startsWith(priv)).toBe(false);
      }
    }
  });
});

describe("robots", () => {
  // Imported inside each test: robots.ts reads env at call time, and the module
  // itself is cheap, so re-importing keeps the env stubs from leaking between
  // cases.
  const load = async () => (await import("@/app/robots")).default;

  it("allows crawling and disallows every private path in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = (await load())();
    const [general] = result.rules as { allow?: string; disallow?: string[] }[];
    expect(general.allow).toBe("/");
    for (const priv of PRIVATE_PATHS) {
      expect(general.disallow).toContain(priv);
    }
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("names the AI crawlers explicitly, with the same disallow list", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = (await load())();
    const rules = result.rules as {
      userAgent?: string | string[];
      disallow?: string[];
    }[];
    const ai = rules.find((rule) => Array.isArray(rule.userAgent));
    expect(ai?.userAgent).toContain("GPTBot");
    expect(ai?.userAgent).toContain("ClaudeBot");
    expect(ai?.userAgent).toContain("PerplexityBot");
    // A named group that forgot a private path would be MORE permissive than
    // the wildcard rule it is meant to mirror — the exact bug this catches.
    for (const priv of PRIVATE_PATHS) {
      expect(ai?.disallow).toContain(priv);
    }
  });

  it("disallows everything on a preview deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = (await load())();
    expect(result.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    // No sitemap either: submitting production's URL list from a preview host is
    // how a preview ends up crawled despite the disallow.
    expect(result.sitemap).toBeUndefined();
  });

  it("treats a non-Vercel production build as production", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionDeployment()).toBe(true);
  });
});

describe("sitemap", () => {
  it("emits every static route as an absolute URL, and survives a dead database", async () => {
    // The board half of the sitemap is a query. It must degrade to "the four
    // pages that matter" rather than throwing — a 500 gets a sitemap dropped
    // from Search Console, which is strictly worse than a short one.
    vi.doMock("@/app/lib/dashboards", () => ({
      listIndexableBoards: () => Promise.reject(new Error("db down")),
    }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();
    error.mockRestore();
    vi.doUnmock("@/app/lib/dashboards");

    for (const route of STATIC_ROUTES) {
      expect(entries.some((e) => e.url === absoluteUrl(route.path))).toBe(true);
    }
    for (const entry of entries) {
      expect(entry.url.startsWith(`${SITE_URL}/`)).toBe(true);
    }
  });

  it("lists listed boards and never an unlisted one", async () => {
    vi.doMock("@/app/lib/dashboards", () => ({
      // The query itself filters on visibility; this asserts the sitemap uses
      // THAT function rather than re-deriving a list from listCurated /
      // listCommunity, where the visibility filter is implicit.
      listIndexableBoards: () =>
        Promise.resolve([
          {
            id: "gold-desk",
            updatedAt: new Date("2026-08-01"),
            createdAt: new Date("2026-07-01"),
            curated: true,
          },
        ]),
    }));
    vi.resetModules();
    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();
    vi.doUnmock("@/app/lib/dashboards");

    const board = entries.find((e) => e.url.endsWith("/dashboard/gold-desk"));
    expect(board).toBeDefined();
    expect(board?.lastModified).toEqual(new Date("2026-08-01"));
  });
});

describe("FAQ", () => {
  it("has substantial, self-contained answers", () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(6);
    for (const item of FAQ) {
      expect(item.question.endsWith("?")).toBe(true);
      // An answer that only makes sense next to its question cannot be lifted
      // into a snippet or an AI summary, which is the entire job here.
      expect(item.answer.length).toBeGreaterThan(60);
    }
  });

  it("marks up exactly the questions the page renders", () => {
    // Google's structured-data policy requires FAQ markup to mirror visible
    // content. Both are rendered from the FAQ array, so this pins that they
    // still are — the moment someone hand-writes a second list, this fails.
    const jsonLd = faqJsonLd();
    expect(jsonLd.mainEntity).toHaveLength(FAQ.length);
    expect(jsonLd.mainEntity.map((q) => q.name)).toEqual(
      FAQ.map((item) => item.question),
    );
    expect(jsonLd.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(
      FAQ.map((item) => item.answer),
    );
  });
});

/** Every `page.tsx` / `layout.tsx` under `app/`, recursively. */
function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...routeFiles(full));
    } else if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
      out.push(full);
    }
  }
  return out;
}

describe("share cards", () => {
  /**
   * The one that actually bit us.
   *
   * Next merges `metadata` one top-level field at a time, so a page exporting its
   * own `openGraph` object REPLACES the resolved one — including the `images`
   * that `app/opengraph-image.tsx` merged in at the root segment. `/gallery`,
   * `/catalogue` and `/tinker` each shipped for weeks with no `og:image` at all,
   * and nothing anywhere said so: they had `og:title` and `og:description`, they
   * type-checked, they rendered.
   *
   * The rule this pins: a route may only hand-write `openGraph` if that same
   * segment owns an `opengraph-image` file (which is then what should win).
   * Everything else spreads `pageSocial()`, which cannot be partial.
   */
  it("never hand-writes openGraph without an image for that segment", () => {
    for (const file of routeFiles(APP_DIR)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("openGraph:")) continue;

      const usesHelper = source.includes("pageSocial(");
      const ownsImage = existsSync(join(dirname(file), "opengraph-image.tsx"));
      expect(
        usesHelper || ownsImage,
        `${relative(APP_DIR, file)} sets openGraph inline but neither spreads pageSocial() nor owns an opengraph-image.tsx — it will emit no og:image. See app/lib/social.ts.`,
      ).toBe(true);
    }
  });

  it("points at a card route that exists on disk", () => {
    // SOCIAL_IMAGE.url is a hand-written path to a file-convention route. If the
    // file is ever renamed or removed, every page's card 404s and the only
    // symptom is a blank unfurl.
    expect(SOCIAL_IMAGE.url).toBe("/opengraph-image");
    expect(existsSync(join(APP_DIR, "opengraph-image.tsx"))).toBe(true);
    expect(SOCIAL_IMAGE.width).toBe(1200);
    expect(SOCIAL_IMAGE.height).toBe(630);
  });
});

describe("the two strings a search result renders", () => {
  it("keeps the title inside the ~60 char cutoff", () => {
    // Past this Google truncates or, more often, rewrites the title into its own
    // wording — at which point the field stops being ours.
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
  });

  it("keeps the description inside the ~160 char cutoff", () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("opens the description as a standalone definition", () => {
    // Google discards a description it cannot use as an answer on its own, and
    // an answer engine quotes the first clause. `zframes is a …` survives being
    // lifted out of the page; "Describe the dashboard you want and…" does not.
    expect(SITE_DESCRIPTION.startsWith(`${SITE_NAME} is a `)).toBe(true);
  });

  it("does not spend both strings on the same words", () => {
    // Two fields, two jobs. Any 4-word run shared between them is a wasted one.
    const runs = (s: string) => {
      const words = s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/);
      return new Set(
        words.slice(0, -3).map((_, i) => words.slice(i, i + 4).join(" ")),
      );
    };
    const titleRuns = runs(SITE_TITLE);
    const shared = [...runs(SITE_DESCRIPTION)].filter((r) => titleRuns.has(r));
    expect(
      shared,
      `title and description share the phrase(s): ${shared.join(" | ")}`,
    ).toEqual([]);
  });
});

describe("snippet clamping", () => {
  it("leaves a description that already fits alone", () => {
    expect(clampSnippet("Short enough.")).toBe("Short enough.");
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(clampSnippet(SITE_DESCRIPTION)).toBe(SITE_DESCRIPTION);
  });

  it("ends on a sentence when there is one to end on", () => {
    const text = `${"a".repeat(120)}. ${"b".repeat(120)}.`;
    const out = clampSnippet(text);
    expect(out.endsWith(".")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(out.includes("b")).toBe(false);
  });

  it("falls back to a word boundary rather than cutting mid-word", () => {
    const text = `${"word ".repeat(60)}end`;
    const out = clampSnippet(text);
    expect(out.length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("never returns more than the cutoff", () => {
    for (const len of [154, 155, 156, 200, 300, 1000]) {
      expect(clampSnippet("x ".repeat(len)).length).toBeLessThanOrEqual(
        SNIPPET_MAX,
      );
    }
  });
});

describe("one tagline, everywhere", () => {
  it("is the manifest name and the Organization slogan", async () => {
    const manifest = (await import("@/app/manifest")).default;
    // Not a fourth phrasing of the pitch: the same string as the <title>.
    expect(manifest().name).toBe(SITE_TITLE);
    expect(organizationJsonLd().slogan).toBe(SITE_TAGLINE);
  });

  it("is still the words the hero and the footer render", () => {
    // The hero splits the tagline across two styled lines, so it cannot
    // interpolate the constant without wrecking the layout. This is the tripwire
    // instead: the moment the visible headline and SITE_TAGLINE diverge, an
    // answer engine starts quoting whichever it hit first.
    const hero = readFileSync(join(APP_DIR, "LandingView.tsx"), "utf8");
    for (const sentence of SITE_TAGLINE.split(/(?<=\.)\s+/)) {
      expect(
        hero.includes(sentence),
        `the landing hero no longer renders "${sentence}" — update SITE_TAGLINE or the hero, but not one alone`,
      ).toBe(true);
    }
    const footer = readFileSync(join(APP_DIR, "lib/Footer.tsx"), "utf8");
    expect(footer.includes("SITE_TAGLINE")).toBe(true);
  });
});

describe("structured data", () => {
  const graphs = [
    organizationJsonLd(),
    websiteJsonLd(),
    softwareApplicationJsonLd(),
    howToJsonLd(),
    faqJsonLd(),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Gallery", path: "/gallery" },
    ]),
  ] as Record<string, unknown>[];

  it("emits well-formed, typed, serialisable graphs", () => {
    for (const graph of graphs) {
      expect(graph["@context"]).toBe("https://schema.org");
      expect(typeof graph["@type"]).toBe("string");
      // The renderer stringifies these into a <script> tag. A value that cannot
      // round-trip (undefined nested in an array, a Date, a cycle) fails there,
      // in production, silently — the tag just carries broken JSON.
      expect(() => JSON.parse(JSON.stringify(graph))).not.toThrow();
    }
  });

  it("resolves every @id reference to a node the site actually emits", () => {
    // `{ "@id": … }` is a pointer. A pointer to a node no page emits is a
    // dangling reference that quietly drops the link between the product and its
    // publisher — the exact edge that makes the entity one entity.
    const declared = new Set([ORG_ID, SITE_ID, APP_ID]);
    const referenced = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      // A bare `{ "@id": x }` is a reference; a node that also carries `@type`
      // is a declaration.
      if (typeof node["@id"] === "string" && !node["@type"]) {
        referenced.add(node["@id"] as string);
      }
      Object.values(node).forEach(walk);
    };
    graphs.forEach(walk);
    for (const id of referenced) expect(declared.has(id)).toBe(true);
  });

  it("never invents a rating", () => {
    // Rating markup must reflect real reviews collected by us and visible on the
    // page. We collect none. The "Missing field (optional) aggregateRating"
    // warning in the Rich Results Test is CORRECT and must stay — inventing the
    // field is a spam-policy violation that risks a manual action against the
    // whole property, in exchange for some stars.
    const app = softwareApplicationJsonLd() as Record<string, unknown>;
    expect(app.aggregateRating).toBeUndefined();
    expect(app.review).toBeUndefined();
  });

  it("points the brand's identity at the site root, not a subpage", () => {
    // The field that decides which URL wins the brand query. If it ever names a
    // subpage, the brand search returns that subpage above the homepage and
    // neither gets sitelinks.
    expect(organizationJsonLd().url).toBe(SITE_URL);
    expect(websiteJsonLd().url).toBe(SITE_URL);
    // Its twin: exactly one URL in the sitemap carries priority 1.
    const top = STATIC_ROUTES.filter((route) => route.priority === 1);
    expect(top.map((route) => route.path)).toEqual(["/"]);
  });
});
