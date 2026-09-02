// Sizing the ask request so a short question is never refused because of what
// the *page* attached to it.
//
// The server's `/__zframes/ask` cap (MAX_BODY_BYTES, 64,000) covers the whole
// JSON body: the question, the board digest and the replayed thread. So a
// three-word question asked from a several-hundred-frame board with a long
// conversation could come back 413 with nothing the user could act on — the
// question was fine, the context around it wasn't.
//
// The fix is to trim here, before sending, in the order the pieces matter
// least-first: the thread history (oldest turns go first — a follow-up needs
// the recent exchange, not the first one), then the board digest (truncated,
// with a marker so the agent knows it is reading a partial board). The question
// itself is never touched: if a question alone still exceeds the cap that is a
// genuine "too long" and the server's 413 is the right answer.
//
// The budget is measured in the same unit the server compares — the JSON
// string's `.length`, since the server accumulates `body += chunk` and tests
// `body.length` — and sits below the server cap so the hard limit stays the
// server's alone.

/** One prior turn of the orb's ephemeral thread (mirrors zai's HistoryTurn). */
export interface AskHistoryTurn {
  role: "user" | "zai";
  text: string;
}

export interface AskBody {
  question: string;
  agent: string | null;
  context?: string;
  history?: AskHistoryTurn[];
  /** True when every reading in `context` is generated demo data (see screen-context). */
  synthetic?: boolean;
}

/** Headroom under the server's 64,000 cap, so the hard limit stays the server's. */
export const MAX_ASK_BODY_CHARS = 60_000;

/** Appended to a truncated digest so the agent knows the board is only partly described. */
export const CONTEXT_TRIM_NOTE = "\n…(board context trimmed to fit)";

const size = (body: AskBody): number => JSON.stringify(body).length;

/**
 * The body to POST, shrunk to fit `budget` if it doesn't already: thread turns
 * first (oldest-first), then the digest, never the question. Returns a new
 * object; the input is untouched.
 */
export function fitAskBody(
  input: AskBody,
  budget: number = MAX_ASK_BODY_CHARS,
): AskBody {
  // Normalise first: an empty history / blank context is omitted rather than
  // sent as `[]` / `""`, matching what the orb used to build by hand.
  const body: AskBody = {
    question: input.question,
    agent: input.agent,
    ...(input.context ? { context: input.context } : {}),
    ...(input.history?.length ? { history: [...input.history] } : {}),
    ...(input.synthetic ? { synthetic: true } : {}),
  };
  if (size(body) <= budget) return body;

  // 1 — drop thread turns, oldest first. A follow-up needs the most recent
  // exchange; the opening question is the cheapest thing to lose.
  while (body.history && body.history.length > 0) {
    body.history = body.history.slice(1);
    if (body.history.length === 0) delete body.history;
    if (size(body) <= budget) return body;
  }

  // 2 — truncate the digest. Each dropped source char frees at least one JSON
  // char (escaping only ever expands), so one pass converges; the loop is a
  // guard, not an algorithm. The note is measured as part of the fit so
  // appending it can't push the body back over.
  if (body.context) {
    let context = body.context;
    while (context.length > 0) {
      body.context = context + CONTEXT_TRIM_NOTE;
      const over = size(body) - budget;
      if (over <= 0) return body;
      context = context.slice(0, Math.max(0, context.length - over));
    }
    // Nothing of the digest survives — send the question without grounding
    // rather than with a bare "trimmed" marker.
    delete body.context;
    delete body.synthetic;
  }

  // The question alone is over the cap: let the server's 413 say so.
  return body;
}
