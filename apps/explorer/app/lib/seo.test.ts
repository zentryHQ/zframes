import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAQ, faqJsonLd } from "@/app/lib/faq";
import {
  absoluteUrl,
  isProductionDeployment,
  PRIVATE_PATHS,
  SITE_URL,
  STATIC_ROUTES,
} from "@/app/lib/site";

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
    "llms.txt", // a text route handler, linked from robots.txt not the sitemap
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
