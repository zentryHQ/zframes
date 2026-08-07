import { FRAME_CATEGORIES } from "@zframes/spec/frame";
import { allFrameMetas } from "@zframes/frames/schemas";
import { listCurated } from "@/app/lib/dashboards";
import { FAQ } from "@/app/lib/faq";
import {
  absoluteUrl,
  INSTALL_COMMAND,
  NPM_URL,
  REPO_URL,
  SITE_LONG_DESCRIPTION,
  SITE_NAME,
} from "@/app/lib/site";

/**
 * `/llms.txt` — the site, written for a language model rather than a browser.
 *
 * Answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot and friends) largely
 * do NOT execute JavaScript, so what they see of this site is the server-rendered
 * HTML and nothing else. This file exists so the parts that matter most — what
 * zframes is, what it costs, how you install it, what data it can show — arrive
 * as one short plain-text document instead of having to be reconstructed from
 * marketing prose spread across a scroll narrative.
 *
 * Everything here is DERIVED: the frame families and counts come from the
 * registry, the boards from the database, the Q&A from `app/lib/faq.ts` (the same
 * array the visible FAQ and the `FAQPage` markup render). Nothing about this file
 * can go stale on its own — the only way it drifts is if the registry does.
 *
 * `@zframes/frames/schemas` is the React-free metadata twin of the registry, and
 * is the ONLY frames import safe in a route handler: importing
 * `@zframes/frames/lazy` here would pull every frame component into the server
 * graph and break the build (see the app's AGENTS.md).
 */
export const revalidate = 3600;

const escapeNewlines = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

export async function GET(): Promise<Response> {
  const byCategory = new Map<string, typeof allFrameMetas>();
  for (const meta of allFrameMetas) {
    const list = byCategory.get(meta.category) ?? [];
    list.push(meta);
    byCategory.set(meta.category, list);
  }

  // A failed query costs the board list, not the file — same posture as the
  // landing page and the sitemap. The rest of this document is the half that
  // actually answers "what is zframes".
  let curated: Awaited<ReturnType<typeof listCurated>> = [];
  try {
    curated = await listCurated();
  } catch (err) {
    console.error("[llms.txt] could not list curated boards:", err);
  }

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_LONG_DESCRIPTION}`,
    "",
    "## Facts",
    "",
    "- Licence: Apache-2.0 (free and open source, no paid tier, no account)",
    `- Source: ${REPO_URL}`,
    `- CLI on npm: ${NPM_URL}`,
    `- Install into a coding agent: \`${INSTALL_COMMAND}\``,
    "- Run a dashboard: `npx zframes serve`",
    "- Supported agents: any skills-aware coding agent (Claude Code, Cursor, Codex, Gemini)",
    `- Frames available: ${allFrameMetas.length}, across ${FRAME_CATEGORIES.length} families`,
    "- Data: keyless free public APIs — no API keys and no signup required",
    "- Where a dashboard lives: one dashboard.json on your own machine, served locally by the CLI",
    "- Asset classes: stocks, crypto, macro and rates, precious metals and commodities, FX, housing, options",
    "- Display currencies: 146",
    "",
    "## Pages",
    "",
    `- [Home](${absoluteUrl("/")}): what zframes is, live example boards, and the install command.`,
    `- [Gallery](${absoluteUrl("/gallery")}): curated and community dashboards, each previewable live and forkable.`,
    `- [Frame catalogue](${absoluteUrl("/catalogue")}): every frame a dashboard can be built from, grouped by family.`,
    `- [Tinker](${absoluteUrl("/tinker")}): edit a dashboard spec in the browser without installing anything.`,
    "",
    "## Frame families",
    "",
  ];

  for (const category of FRAME_CATEGORIES) {
    const frames = byCategory.get(category.key) ?? [];
    if (frames.length === 0) continue;
    lines.push(
      `### ${category.label} (${frames.length} frames)`,
      "",
      escapeNewlines(category.description),
      "",
    );
    for (const frame of frames) {
      lines.push(`- \`${frame.name}\` — ${escapeNewlines(frame.description)}`);
    }
    lines.push("");
  }

  if (curated.length > 0) {
    lines.push("## Example dashboards", "");
    for (const board of curated) {
      const description = board.description
        ? ` — ${escapeNewlines(board.description)}`
        : "";
      lines.push(
        `- [${board.title}](${absoluteUrl(`/dashboard/${board.id}`)})${description}`,
      );
    }
    lines.push("");
  }

  lines.push("## Questions and answers", "");
  for (const item of FAQ) {
    lines.push(`### ${item.question}`, "", escapeNewlines(item.answer), "");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
