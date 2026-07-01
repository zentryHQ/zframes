import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildPrompt,
  claudeDelta,
  claudeResult,
  claudeStatus,
} from "@zframes/zai/agent";

// buildPrompt reads the spec off disk, so each case writes a tiny real spec into
// a temp dir. The parsers (claudeResult/claudeDelta) are pure — no fs needed.
// Nothing here spawns a runner; this file is the deterministic-logic layer.

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zframes-prompt-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

let specSeq = 0;
/** Write a spec object to a fresh file and return its path. */
function writeSpec(spec: unknown): string {
  const file = join(dir, `spec-${++specSeq}.json`);
  writeFileSync(file, JSON.stringify(spec));
  return file;
}

describe("buildPrompt", () => {
  it("always includes the primer, scope guard, sourcing rule, and the question verbatim", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    const prompt = await buildPrompt(file, "what is BTC doing?");
    expect(prompt).toContain("You are zAI, the assistant built into zframes");
    expect(prompt).toContain("Stay strictly on topic.");
    expect(prompt).toContain("You may use web search when it helps");
    // The question is appended last, verbatim.
    expect(prompt).toContain("Question: what is BTC doing?");
    expect(prompt.trimEnd().endsWith("what is BTC doing?")).toBe(true);
  });

  it("grounds in the client's live screen digest when supplied (and skips the symbol fallback)", async () => {
    const file = writeSpec({
      title: "My Dash",
      frames: [{ config: { symbol: "xyz:TSLA" } }],
    });
    const prompt = await buildPrompt(
      file,
      "how's my board?",
      "LIVE: TSLA 250.00 (+3.1%)",
    );
    expect(prompt).toContain(
      'Here is what the user is looking at on their dashboard "My Dash" right now',
    );
    expect(prompt).toContain("LIVE: TSLA 250.00 (+3.1%)");
    // The disk-symbol fallback branch must NOT fire when a live digest is present.
    expect(prompt).not.toContain("The symbols on screen right now are:");
  });

  it("falls back to the spec title + de-duplicated symbols when no client digest is given", async () => {
    const file = writeSpec({
      title: "Crypto Board",
      frames: [
        { config: { symbol: "xyz:TSLA" } },
        { config: { symbols: ["BTC", "ETH", "BTC"] } },
      ],
    });
    const prompt = await buildPrompt(file, "summarize");
    expect(prompt).toContain('The user\'s dashboard is titled "Crypto Board".');
    // Insertion order preserved, duplicate BTC dropped by the Set.
    expect(prompt).toContain(
      "The symbols on screen right now are: xyz:TSLA, BTC, ETH.",
    );
    expect(prompt).not.toContain("looking at on their dashboard");
  });

  it("degrades gracefully when the spec file is missing or unreadable", async () => {
    const prompt = await buildPrompt(join(dir, "does-not-exist.json"), "hi");
    expect(prompt).toContain('titled "a live market dashboard"');
    expect(prompt).toContain(
      "The symbols on screen right now are: no specific symbols.",
    );
  });

  it("includes the frame catalogue only when the host supplies it", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    const withCat = await buildPrompt(
      file,
      "what frames exist?",
      undefined,
      "Prices\n- price-chart — a live price chart",
    );
    expect(withCat).toContain("The frames a user can add in zframes");
    expect(withCat).toContain("price-chart — a live price chart");

    const withoutCat = await buildPrompt(file, "what frames exist?");
    expect(withoutCat).not.toContain("The frames a user can add in zframes");
  });

  it("replays the recent thread as a transcript with role labels", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    const prompt = await buildPrompt(file, "why?", undefined, undefined, [
      { role: "user", text: "how is ETH?" },
      { role: "zai", text: "ETH is up 2%." },
    ]);
    expect(prompt).toContain("Conversation so far (most recent last):");
    expect(prompt).toContain("User: how is ETH?");
    expect(prompt).toContain("zAI: ETH is up 2%.");
  });

  it("keeps only the last MAX_HISTORY_TURNS turns", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    // 8 turns; only the final 6 should survive.
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "zai") as "user" | "zai",
      text: `MARKER${i}`,
    }));
    const prompt = await buildPrompt(file, "?", undefined, undefined, history);
    expect(prompt).not.toContain("MARKER0");
    expect(prompt).not.toContain("MARKER1");
    for (let i = 2; i < 8; i++) expect(prompt).toContain(`MARKER${i}`);
  });

  it("drops empty-text turns and collapses whitespace within a turn", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    const prompt = await buildPrompt(file, "?", undefined, undefined, [
      { role: "user", text: "first" },
      { role: "zai", text: "   " },
      { role: "user", text: "multi\n\n  line" },
    ]);
    // The blank turn is dropped entirely — no content-less "zAI:" line leaks
    // into the transcript (a bare `zAI: ` followed by a newline / line-end).
    expect(prompt).not.toContain("zAI: \n");
    expect(prompt).not.toMatch(/zAI:\s*$/m);
    // Interior whitespace runs collapse to single spaces.
    expect(prompt).toContain("User: multi line");
  });

  it("truncates an over-long turn to MAX_HISTORY_CHARS", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    const long = "HEAD" + "B".repeat(1000) + "TAILZZZ";
    const prompt = await buildPrompt(file, "?", undefined, undefined, [
      { role: "user", text: long },
    ]);
    expect(prompt).toContain("HEAD");
    expect(prompt).not.toContain("TAILZZZ");
  });

  it("truncates an over-long client digest to MAX_CONTEXT_CHARS", async () => {
    const file = writeSpec({ title: "X", frames: [] });
    const context = "A".repeat(12_000) + "TAILZZZ";
    const prompt = await buildPrompt(file, "?", context);
    expect(prompt).toContain("A".repeat(200)); // the head survives
    expect(prompt).not.toContain("TAILZZZ"); // the tail beyond the cap is dropped
  });
});

describe("claudeResult", () => {
  it("prefers the closing result event over the streamed deltas", () => {
    const stdout = [
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"partial "}}}',
      '{"type":"result","result":"Final answer."}',
    ].join("\n");
    expect(claudeResult(stdout)).toBe("Final answer.");
  });

  it("falls back to the joined text deltas when there is no result event", () => {
    const stdout = [
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}}',
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"world."}}}',
    ].join("\n");
    expect(claudeResult(stdout)).toBe("Hello world.");
  });

  it("ignores blank lines, non-JSON noise, and non-text events", () => {
    const stdout = [
      "",
      "not json at all",
      '{"type":"stream_event","event":{"type":"content_block_start"}}',
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"real"}}}',
      "   ",
    ].join("\n");
    expect(claudeResult(stdout)).toBe("real");
  });

  it("trims the final answer", () => {
    const stdout = '{"type":"result","result":"  padded  "}';
    expect(claudeResult(stdout)).toBe("padded");
  });
});

describe("claudeDelta", () => {
  it("extracts the text from a content_block_delta text_delta line", () => {
    const line =
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"tok"}}}';
    expect(claudeDelta(line)).toBe("tok");
  });

  it("returns null for non-stream_event lines", () => {
    expect(claudeDelta('{"type":"result","result":"x"}')).toBeNull();
  });

  it("returns null when the event is not a content_block_delta", () => {
    expect(
      claudeDelta('{"type":"stream_event","event":{"type":"message_start"}}'),
    ).toBeNull();
  });

  it("returns null for a non-text delta (e.g. input_json_delta)", () => {
    expect(
      claudeDelta(
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{"}}}',
      ),
    ).toBeNull();
  });

  it("returns null for blank or malformed lines", () => {
    expect(claudeDelta("")).toBeNull();
    expect(claudeDelta("garbage")).toBeNull();
  });
});

describe("claudeStatus", () => {
  const toolStart = (name: string) =>
    `{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"${name}"}}}`;

  it("labels a WebSearch tool start", () => {
    expect(claudeStatus(toolStart("WebSearch"))).toBe("searching the web…");
  });

  it("labels a WebFetch tool start", () => {
    expect(claudeStatus(toolStart("WebFetch"))).toBe("reading a page…");
  });

  it("stays silent for other tools", () => {
    expect(claudeStatus(toolStart("ToolSearch"))).toBeNull();
    expect(claudeStatus(toolStart("Bash"))).toBeNull();
  });

  it("ignores non-tool_use blocks and non-start events", () => {
    // a text block opening, not a tool
    expect(
      claudeStatus(
        '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"text"}}}',
      ),
    ).toBeNull();
    // a delta, not a block start
    expect(
      claudeStatus(
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}}',
      ),
    ).toBeNull();
  });

  it("returns null for blank or malformed lines", () => {
    expect(claudeStatus("")).toBeNull();
    expect(claudeStatus("garbage")).toBeNull();
  });
});
