/**
 * `pnpm --dir apps/explorer seo:audit [origin]` — the post-deploy checklist,
 * run against a LIVE origin.
 *
 * Why this exists as well as `app/lib/seo.test.ts`: the unit suite pins what the
 * source says, and every SEO failure worth catching is a difference between what
 * the source says and what the deployment serves. A red CI job that gates the
 * deploy, a stale ISR cache, a proxy stripping a header, a card route that 404s
 * in the serverless bundle because its font was never traced — none of those are
 * visible in the repo, and all of them are invisible on the site too. The only
 * way to know is to fetch it.
 *
 * Every check states what it looked at and what it expected, so a failure reads
 * as an instruction rather than a puzzle. Exit code 1 if anything failed.
 *
 *   pnpm --dir apps/explorer seo:audit                      # production
 *   pnpm --dir apps/explorer seo:audit http://localhost:37264
 *   pnpm --dir apps/explorer seo:audit --ua=googlebot       # as the crawler
 *
 * Point it at PRODUCTION. Against a dev server most of the output is red by
 * design and means nothing: `robots.txt` correctly says `Disallow: /` on a
 * non-production deployment, and every canonical and sitemap URL correctly names
 * the production origin rather than localhost. The per-page checks (description
 * length, og:image, JSON-LD) are the half that still reads true locally.
 *
 * NOTE on `--ua`: production sits behind a bot-managing CDN, which will often
 * refuse a Googlebot user agent coming from an unverified IP (ours). A 403 there
 * is the CDN, not the app — but it is worth seeing, because the same rule
 * mis-scoped would block the real crawler too.
 */
import { PRIVATE_PATHS, SITE_URL, STATIC_ROUTES } from "../app/lib/site";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const args = process.argv.slice(2);
const uaFlag = args.find((a) => a.startsWith("--ua="))?.slice(5);
const origin = (args.find((a) => !a.startsWith("--")) ?? SITE_URL).replace(
  /\/+$/,
  "",
);
const userAgent = uaFlag === "googlebot" ? GOOGLEBOT_UA : BROWSER_UA;

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  const mark = ok ? "[32mPASS[0m" : "[31mFAIL[0m";
  console.log(`${mark}  ${label}${detail ? `\n        ${detail}` : ""}`);
}

async function get(path: string) {
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  const res = await fetch(url, { headers: { "user-agent": userAgent } });
  return { url, res, body: await res.text() };
}

/** All values of one meta tag, wherever in the document it was emitted. */
function metas(html: string, key: string): string[] {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`,
    "gi",
  );
  return (html.match(re) ?? []).flatMap((tag) => {
    const content = tag.match(/content=["']([^"']*)["']/i);
    return content ? [content[1]] : [];
  });
}

function jsonLdBlocks(html: string): string[] {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => m[1]);
}

function canonicalOf(html: string): string | undefined {
  const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  return tag?.match(/href=["']([^"']*)["']/i)?.[1];
}

async function auditPage(path: string, { canonical = path } = {}) {
  const { url, res, body } = await get(path);
  check(
    res.ok,
    `${path} responds 200`,
    res.ok ? "" : `got ${res.status} ${url}`,
  );
  if (!res.ok) return;

  const title = body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  check(title.trim().length > 0, `${path} has a <title>`, title);

  const [description] = metas(body, "description");
  check(
    !!description && description.length <= 165,
    `${path} has a description inside the snippet cutoff`,
    description ? `${description.length} chars` : "no meta description",
  );

  const found = canonicalOf(body);
  const expected = `${origin}${canonical}`;
  // `https://host` and `https://host/` are the same URL — an empty path
  // normalises to `/` — so the root's canonical is compared slash-insensitively.
  // Anywhere else a trailing slash IS a different URL and is not normalised away.
  const same = (a?: string) => (canonical === "/" ? a?.replace(/\/$/, "") : a);
  check(
    same(found) === same(expected),
    `${path} canonicalises to itself on this origin`,
    same(found) === same(expected)
      ? ""
      : `expected ${expected}, got ${found ?? "none"}`,
  );

  // The failure this whole script was written for: a page whose openGraph object
  // replaced the root's and took the share card with it. Silent everywhere else.
  const [ogImage] = metas(body, "og:image");
  check(!!ogImage, `${path} declares an og:image`, ogImage ?? "no og:image");
  if (ogImage) {
    const img = await fetch(ogImage, {
      method: "GET",
      headers: { "user-agent": userAgent },
    });
    check(
      img.ok && (img.headers.get("content-type") ?? "").startsWith("image/"),
      `${path} share card actually renders`,
      img.ok ? "" : `${img.status} at ${ogImage}`,
    );
  }
  check(
    metas(body, "twitter:image").length > 0,
    `${path} declares a twitter:image`,
  );

  const blocks = jsonLdBlocks(body);
  const bad = blocks.filter((b) => {
    try {
      const parsed = JSON.parse(b);
      return !parsed["@context"];
    } catch {
      return true;
    }
  });
  check(
    blocks.length > 0 && bad.length === 0,
    `${path} JSON-LD parses (${blocks.length} block${blocks.length === 1 ? "" : "s"})`,
    bad.length ? `${bad.length} block(s) invalid or missing @context` : "",
  );
}

async function main() {
  console.log(`\nSEO audit — ${origin}\nUser-Agent: ${userAgent}\n`);

  // ── robots.txt ────────────────────────────────────────────────────────────
  const robots = await get("/robots.txt");
  check(robots.res.ok, "/robots.txt responds 200");
  const robotsBody = robots.body;
  check(
    /^\s*Disallow:\s*\/\s*$/m.test(robotsBody) === false,
    "/robots.txt does not disallow the whole site",
    "a blanket `Disallow: /` here means this deployment is not production",
  );
  check(
    robotsBody.includes(`${origin}/sitemap.xml`) ||
      robotsBody.includes("Sitemap:"),
    "/robots.txt names the sitemap",
  );
  for (const bot of [
    "GPTBot",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended",
  ]) {
    check(robotsBody.includes(bot), `/robots.txt names ${bot}`);
  }
  for (const priv of PRIVATE_PATHS) {
    check(robotsBody.includes(priv), `/robots.txt disallows ${priv}`);
  }

  // ── sitemap.xml ───────────────────────────────────────────────────────────
  const sitemap = await get("/sitemap.xml");
  check(sitemap.res.ok, "/sitemap.xml responds 200");
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  check(locs.length > 0, `/sitemap.xml lists ${locs.length} URLs`);
  check(
    locs.every((loc) => loc.startsWith(`${origin}/`)),
    "/sitemap.xml lists only URLs on this origin",
    locs.find((loc) => !loc.startsWith(`${origin}/`)) ?? "",
  );
  for (const route of STATIC_ROUTES) {
    const want = `${origin}${route.path === "/" ? "/" : route.path}`;
    check(locs.includes(want), `/sitemap.xml lists ${route.path}`);
  }
  const topPriority = [
    ...sitemap.body.matchAll(
      /<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<priority>1(?:\.0+)?<\/priority>[\s\S]*?<\/url>/g,
    ),
  ].map((m) => m[1]);
  check(
    topPriority.length === 1 && topPriority[0] === `${origin}/`,
    "exactly one priority-1 URL, and it is the root",
    topPriority.join(", ") || "none found",
  );

  // ── llms.txt ──────────────────────────────────────────────────────────────
  const llms = await get("/llms.txt");
  check(llms.res.ok, "/llms.txt responds 200");
  check(
    llms.body.length > 500,
    "/llms.txt is substantive",
    `${llms.body.length} bytes`,
  );

  // ── the brand logo the Organization node points at ────────────────────────
  const logo = await get("/zframes-icon-512.png");
  check(
    logo.res.ok,
    "Organization.logo resolves",
    logo.res.ok
      ? ""
      : `${logo.res.status} — schema logo must be a real raster file`,
  );

  // ── every indexable page ──────────────────────────────────────────────────
  for (const route of STATIC_ROUTES) {
    console.log(`\n── ${route.path}`);
    await auditPage(route.path);
  }

  // ── one board, and its chrome-less twin ───────────────────────────────────
  const firstBoard = locs.find((loc) => loc.includes("/dashboard/"));
  if (firstBoard) {
    const path = firstBoard.slice(origin.length);
    console.log(`\n── ${path}`);
    await auditPage(path);

    const id = path.split("/").pop();
    const embed = await get(`/embed/${id}`);
    const header = embed.res.headers.get("x-robots-tag") ?? "";
    check(
      header.includes("noindex"),
      `/embed/${id} sends X-Robots-Tag: noindex`,
      header ||
        "no header — the embed is a crawlable duplicate of the board page",
    );
  } else {
    console.log("\n(no board URLs in the sitemap — skipping the board checks)");
  }

  console.log(
    failures === 0
      ? "\n[32mAll checks passed.[0m\n"
      : `\n[31m${failures} check(s) failed.[0m\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
