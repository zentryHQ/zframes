/**
 * Claude stream-line parsing: the NDJSON `--output-format stream-json` events a
 * `claude -p` run emits, mapped to token deltas, tool statuses, and the final
 * canonical answer. Pure string logic — no subprocess, no fs.
 */

/** Tolerantly parse one NDJSON line; blank or non-JSON lines yield null. */
function tryParse<T>(line: string): T | null {
  const s = line.trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** The slice of Claude's `--output-format stream-json` events we read. */
interface ClaudeStreamLine {
  type?: string;
  result?: unknown;
  event?: {
    type?: string;
    delta?: { type?: string; text?: unknown };
    // On a `content_block_start`, the block being opened — a `tool_use` block
    // carries the tool `name` (e.g. WebSearch), which we surface as a status.
    content_block?: { type?: string; name?: unknown };
  };
}

/**
 * A single token-level text delta from a Claude stream line, or null.
 *
 * `claudeDelta`, `claudeResult`, and `buildPrompt` are exported purely as unit
 * seams for `agent-prompt.test.ts` — they're deterministic string logic with no
 * subprocess. They are NOT part of the server contract (only `handleAgents` /
 * `handleAsk` are); the private `@zframes/core` package inlines this file wholesale.
 */
export function claudeDelta(line: string): string | null {
  const o = tryParse<ClaudeStreamLine>(line);
  if (o?.type !== "stream_event") return null;
  const delta =
    o.event?.type === "content_block_delta" ? o.event.delta : undefined;
  return delta?.type === "text_delta" && typeof delta.text === "string"
    ? delta.text
    : null;
}

/**
 * A short human-readable status when Claude *starts* a tool call, or null. The
 * token stream goes quiet while a web lookup runs, so the orb would otherwise
 * show dead-air "thinking…"; this lets it show "searching the web…" instead.
 * Only the web tools are surfaced — any other tool start is silent (null).
 */
export function claudeStatus(line: string): string | null {
  const o = tryParse<ClaudeStreamLine>(line);
  if (o?.type !== "stream_event") return null;
  if (o.event?.type !== "content_block_start") return null;
  const block = o.event.content_block;
  if (block?.type !== "tool_use") return null;
  switch (block.name) {
    case "WebSearch":
      return "searching the web…";
    case "WebFetch":
      return "reading a page…";
    default:
      return null;
  }
}

/** Claude's canonical answer: the closing `result`, else the joined deltas. */
export function claudeResult(stdout: string): string {
  let result: string | null = null;
  let deltas = "";
  for (const line of stdout.split("\n")) {
    const o = tryParse<ClaudeStreamLine>(line);
    if (!o) continue;
    if (o.type === "result" && typeof o.result === "string") {
      result = o.result;
      continue;
    }
    if (
      o.type === "stream_event" &&
      o.event?.type === "content_block_delta" &&
      o.event.delta?.type === "text_delta" &&
      typeof o.event.delta.text === "string"
    ) {
      deltas += o.event.delta.text;
    }
  }
  return (result ?? deltas).trim();
}
