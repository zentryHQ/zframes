import { describe, expect, it } from "vitest";
import {
  CONTEXT_TRIM_NOTE,
  fitAskBody,
  MAX_ASK_BODY_CHARS,
  type AskHistoryTurn,
} from "./ask-payload";

// The request-fitting contract (B-46): a short question asked from a huge board
// must still be sent. The order of sacrifice is what these pin — thread turns
// (oldest first), then the digest, never the question — measured in the same
// unit the server's cap compares, the JSON body's `.length`.

const size = (body: object) => JSON.stringify(body).length;

/** `n` history turns, each tagged so we can tell which survived. */
function turns(n: number, chars: number): AskHistoryTurn[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("zai" as const),
    text: `turn${i}-${"x".repeat(chars)}`,
  }));
}

describe("fitAskBody", () => {
  it("passes a small body through, omitting empty context / history", () => {
    const body = fitAskBody({
      question: "what's moving?",
      agent: "claude",
      context: "",
      history: [],
    });
    expect(body).toEqual({ question: "what's moving?", agent: "claude" });
  });

  it("keeps a body already under the budget byte-for-byte", () => {
    const input = {
      question: "why is BTC up?",
      agent: "codex",
      context: "Prices: BTC $60,000",
      history: turns(2, 10),
    };
    expect(fitAskBody(input)).toEqual(input);
  });

  it("drops the oldest thread turns first and keeps the question intact", () => {
    const question = "why?";
    const body = fitAskBody({
      question,
      agent: "claude",
      context: "Prices: BTC $60,000",
      // Six fat turns: the thread alone blows the budget, the rest doesn't.
      history: turns(6, 12_000),
    });
    expect(body.question).toBe(question);
    expect(body.context).toBe("Prices: BTC $60,000");
    expect(size(body)).toBeLessThanOrEqual(MAX_ASK_BODY_CHARS);
    // Trimmed from the front: the most recent turn is the one that survives.
    expect(body.history?.length).toBeGreaterThan(0);
    expect(body.history?.at(-1)?.text).toContain("turn5");
    expect(JSON.stringify(body)).not.toContain("turn0");
  });

  it("truncates the board digest once the whole thread is gone", () => {
    const question = "what's moving in BTC?";
    const body = fitAskBody({
      question,
      agent: "claude",
      context: `Live readings right now:\n${"A".repeat(90_000)}`,
      history: turns(4, 400),
      synthetic: true,
    });
    expect(body.question).toBe(question);
    expect(body.history).toBeUndefined();
    expect(body.context).toContain("Live readings right now");
    expect(body.context?.endsWith(CONTEXT_TRIM_NOTE)).toBe(true);
    expect(body.synthetic).toBe(true);
    expect(size(body)).toBeLessThanOrEqual(MAX_ASK_BODY_CHARS);
  });

  it("counts JSON escaping, not raw characters, when trimming the digest", () => {
    // Every source char escapes to two JSON chars, so a naive slice on raw
    // length would leave the body at ~twice the budget.
    const body = fitAskBody({
      question: "summarise",
      agent: null,
      context: "\n".repeat(80_000),
    });
    expect(size(body)).toBeLessThanOrEqual(MAX_ASK_BODY_CHARS);
  });

  it("sends the bare question rather than a digest that cannot be trimmed to fit", () => {
    const question = "x".repeat(MAX_ASK_BODY_CHARS + 500);
    const body = fitAskBody({
      question,
      agent: "claude",
      context: "Prices: BTC $60,000",
      synthetic: true,
    });
    // The question is never shortened — an over-cap question is a real 413.
    expect(body.question).toBe(question);
    expect(body.context).toBeUndefined();
    expect(body.synthetic).toBeUndefined();
  });

  it("honours an explicit budget", () => {
    const body = fitAskBody(
      {
        question: "hi",
        agent: "claude",
        context: "Prices: BTC $60,000. Funding: BTC +0.0100%",
        history: turns(4, 50),
      },
      120,
    );
    expect(size(body)).toBeLessThanOrEqual(120);
    expect(body.question).toBe("hi");
  });
});
