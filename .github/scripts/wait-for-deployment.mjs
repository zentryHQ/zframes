/**
 * Block until the Vercel PRODUCTION deployment for a given commit is live.
 *
 *   node .github/scripts/wait-for-deployment.mjs <sha>
 *
 * Why: `db-deploy.yml` seeds the curated showcase, and a seeded board may name a
 * frame that only exists in the release being deployed (nine of them use `group`,
 * added 2026-08-05). Seeding before the new code is serving would put "Unknown
 * frame" cards on the front page. Vercel builds in parallel with the workflow, so
 * the workflow has to wait for it rather than assume.
 *
 * Vercel's GitHub integration creates a Deployment for the commit and posts
 * statuses to it, so this polls the GitHub API — no Vercel token needed, just the
 * workflow's own GITHUB_TOKEN with `deployments: read`.
 *
 * Exits non-zero on timeout or a failed deployment, which fails the seed step and
 * leaves the database untouched. That is the safe direction: a stale showcase is a
 * cosmetic problem, a showcase full of Unknown-frame cards is a visible broken
 * front page.
 *
 * Known Vercel quirk this surfaces rather than hides: it occasionally creates no
 * deployment at all for a pushed SHA. The timeout message says so explicitly,
 * because the failure otherwise reads as "the deploy is slow".
 */

const sha = process.argv[2];
if (!sha) {
  console.error("usage: wait-for-deployment.mjs <sha>");
  process.exit(1);
}

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!REPO || !TOKEN) {
  console.error("GITHUB_REPOSITORY and GH_TOKEN are required");
  process.exit(1);
}

const TIMEOUT_MS = Number(process.env.WAIT_TIMEOUT_MS ?? 15 * 60_000);
const POLL_MS = Number(process.env.WAIT_POLL_MS ?? 15_000);
// Vercel labels production deployments "Production"; be generous about casing and
// let a plain "production" through too.
const PRODUCTION = /^production$/i;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok)
    throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * The deployments API's `sha` filter is an EXACT match, not a prefix — a short sha
 * silently returns nothing, which reads identically to "not deployed yet" and then
 * times out fifteen minutes later saying the wrong thing. `github.sha` is always
 * full, so this only bites a human running the script by hand; resolve it rather
 * than let them debug a lie.
 */
async function fullSha(input) {
  if (/^[0-9a-f]{40}$/i.test(input)) return input;
  const commit = await gh(`/repos/${REPO}/commits/${input}`);
  console.log(`resolved ${input} → ${commit.sha}`);
  return commit.sha;
}

/** The latest state of the production deployment for `sha`, or null if none yet. */
async function probe(sha) {
  const deployments = await gh(
    `/repos/${REPO}/deployments?sha=${sha}&per_page=100`,
  );
  const production = deployments.filter((d) => PRODUCTION.test(d.environment));
  if (production.length === 0) return null;
  // Newest first — a re-deploy of the same SHA makes a second one.
  production.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const statuses = await gh(
    `/repos/${REPO}/deployments/${production[0].id}/statuses?per_page=100`,
  );
  return { id: production[0].id, state: statuses[0]?.state ?? "pending" };
}

const target = await fullSha(sha);
const started = Date.now();
let lastReported = "";

while (Date.now() - started < TIMEOUT_MS) {
  const current = await probe(target);
  const label = current ? `${current.state}` : "no deployment yet";
  if (label !== lastReported) {
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${label}`);
    lastReported = label;
  }

  if (current?.state === "success") {
    console.log(`✓ production deployment ${current.id} is live for ${target}`);
    process.exit(0);
  }
  if (["failure", "error"].includes(current?.state)) {
    console.error(
      `✗ production deployment ${current.id} reported "${current.state}" — not seeding.`,
    );
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.error(
  `✗ timed out after ${Math.round(TIMEOUT_MS / 60000)}m waiting for a successful\n` +
    `  Production deployment of ${target}.\n\n` +
    `  Either the build is genuinely slower than the timeout, or Vercel created no\n` +
    `  deployment for this SHA (a known intermittent). Check the Vercel dashboard;\n` +
    `  if the release is actually live, re-run this workflow with force_seed=true.\n\n` +
    `  The database was NOT seeded. Migrations, which ran earlier, are unaffected.`,
);
process.exit(1);
