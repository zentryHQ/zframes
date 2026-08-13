import { readFile } from "node:fs/promises";

/**
 * Prompt construction for the zAI "ask" contract: the grounding digest, frame
 * catalogue, replayed orb thread, primer, scope guard, and sourcing rules that
 * make a general-purpose agent CLI answer as the embedded market analyst.
 * Deterministic string logic — reads only the spec file, spawns nothing.
 */

const MAX_CONTEXT_CHARS = 12_000; // cap the client's on-screen digest in the prompt
export const MAX_HISTORY_TURNS = 6; // last ~3 exchanges of the orb's ephemeral thread
const MAX_HISTORY_CHARS = 600; // per turn — orb answers are 2–4 sentences anyway

/** One prior turn of the orb's ephemeral thread, replayed for follow-up context. */
export interface HistoryTurn {
  role: "user" | "zai";
  text: string;
}

/**
 * Ground the answer in what's on screen. The browser sends a live digest of the
 * dashboard (`clientContext` — frames + current readings, built in the runtime's
 * screen-context.ts); we prefer it when present. Without it (CLI-only client, or
 * a capture failure) we fall back to reading the spec from disk for the title +
 * the symbols, so the bridge still works standalone.
 */
export async function buildPrompt(
  specFile: string,
  question: string,
  clientContext?: string,
  catalogue?: string,
  history?: HistoryTurn[],
): Promise<string> {
  let title = "a live market dashboard";
  const symbols = new Set<string>();
  try {
    const spec = JSON.parse(await readFile(specFile, "utf8")) as {
      title?: unknown;
      frames?: { config?: Record<string, unknown> }[];
    };
    if (typeof spec.title === "string" && spec.title) title = spec.title;
    for (const frame of spec.frames ?? []) {
      const cfg = frame.config ?? {};
      if (typeof cfg.symbol === "string") symbols.add(cfg.symbol);
      if (Array.isArray(cfg.symbols))
        for (const s of cfg.symbols) if (typeof s === "string") symbols.add(s);
    }
  } catch {
    /* a missing/odd spec just means a less grounded prompt */
  }
  const trimmed = clientContext?.trim();
  const grounding = trimmed
    ? `Here is what the user is looking at on their dashboard "${title}" right now ` +
      `(live values captured from the screen):\n\n${trimmed.slice(
        0,
        MAX_CONTEXT_CHARS,
      )}`
    : `The user's dashboard is titled "${title}". The symbols on screen right now are: ${
        symbols.size ? [...symbols].join(", ") : "no specific symbols"
      }.`;
  // The full frame catalogue, when the host supplies it — so the assistant can
  // answer "what frames exist / what does X show / how do I add one" from the
  // running build's own metadata, not a guess or a network fetch.
  const trimmedCatalogue = catalogue?.trim();
  const frameCatalogue = trimmedCatalogue
    ? `The frames a user can add in zframes (name — what it shows), by family:\n${trimmedCatalogue}\n\n`
    : "";
  // The orb's recent thread, embedded as a transcript so follow-ups ("what about
  // ETH?", "why?") have context — the runners are one-shot (`claude -p` /
  // `codex exec`), so prior turns ride in the prompt rather than a session.
  // Text-only Q/A: the live digest above is always the CURRENT screen, so stale
  // readings are never replayed; only the conversation is.
  const recent = (history ?? [])
    .filter((m) => m.text.trim())
    .slice(-MAX_HISTORY_TURNS);
  const transcript = recent.length
    ? `Conversation so far (most recent last):\n${recent
        .map(
          (m) =>
            `${m.role === "user" ? "User" : "zAI"}: ${m.text
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, MAX_HISTORY_CHARS)}`,
        )
        .join("\n")}\n\n`
    : "";
  return (
    // Primer: brief the runner on what zframes is and how it works, so a
    // general-purpose agent answers as the embedded assistant rather than from
    // cold. Kept tight — the catalogue + live digest below carry the specifics.
    `You are zAI, the assistant built into zframes — a keyless, AI-personalizable ` +
    `live market dashboard for crypto and stocks. Users assemble their own dashboard ` +
    `from "frames": self-contained widgets for live prices, funding, open interest, ` +
    `fear & greed, TVL and on-chain activity, macro rates, news, even games. They ` +
    `arrange frames on a grid in "customise" mode — drag, resize, add, remove, and ` +
    `configure each — and edits save to a dashboard.json the runtime renders from. ` +
    `All data comes from free public APIs (no keys, no accounts); stocks are ` +
    `Hyperliquid HIP-3 perps — equities (xyz:TSLA), indices (xyz:SP500), ` +
    `commodities (xyz:GOLD), FX (xyz:EUR) — shown alongside crypto. Help ` +
    `the user read what's on their screen and the markets it tracks.\n\n` +
    `${frameCatalogue}` +
    `${grounding}\n\n` +
    `${transcript}` +
    // Scope guard: zAI is a market analyst embedded in the dashboard, not a
    // general chatbot. Keep it on-topic so it stays grounded and on-brand —
    // off-topic asks get a one-line decline that points back to what it can do.
    `Stay strictly on topic. Only answer questions about zframes itself (its frames, ` +
    `data, dashboard, and how to use it) and about markets and finance — stocks, ` +
    `crypto, prices, funding, market caps, on-chain and macro data, and the symbols ` +
    `on screen. If the question is about anything else (general knowledge, coding, ` +
    `personal advice, writing, other software, etc.), do not answer it: reply in one ` +
    `sentence that you only cover zframes and the markets it tracks, and invite a ` +
    `market or dashboard question instead.\n\n` +
    // Sourcing rule: web search is on (news, catalysts, context the live feeds
    // can't carry), so every answer must be explicit about provenance — the
    // user has to know a figure is from their own live dashboard vs. the web.
    // The live readings stay the authority for anything on screen, so a stale
    // web number can never contradict what the user is looking at.
    `You may use web search when it helps — for news, catalysts, or context not in ` +
    `the live readings above. Be explicit in your answer about where each fact comes ` +
    `from: say when a number or fact is from the live dashboard readings above versus ` +
    `from the web, and name the web source (e.g. "per Reuters"). For anything shown on ` +
    `the dashboard, treat the live readings above as the source of truth — don't ` +
    `override them with a web figure.\n\n` +
    `Answer the user's question in 2–4 sentences of plain text — no markdown headings, ` +
    `no preamble.\n\nQuestion: ${question}`
  );
}
