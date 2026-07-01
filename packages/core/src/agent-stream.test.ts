import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
// Type-only: gives us handleAsk's param types without a runtime import (so it
// never loads/caches the module — every run comes from freshAgent()).
import type * as AgentModule from "@zframes/core/agent";

type AskReq = Parameters<typeof AgentModule.handleAsk>[0];

// The real spawn/stream/close orchestration — the layer where the past bugs
// lived (the codex stdin/EOF stall, the trailing partial-line flush). We drive
// it against hermetic fake runners rather than a real `claude`/`codex`/`kimi`,
// so no auth (no ANTHROPIC_API_KEY), no network, and a deterministic answer.
//
// Each stub is a `#!/bin/sh` script emitting canned output. Two properties make
// this fully hermetic: `/bin/sh` is an absolute interpreter path (found without
// PATH), and the scripts use only the `printf` shell builtin + redirection (no
// external commands). So PATH can be set to ONLY the stub dir — detection and
// spawn then resolve exactly our fakes, never a real CLI on the dev machine.

const ORIGINAL_PATH = process.env.PATH;
let dir: string;
let specFile: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zframes-stream-"));
  specFile = join(dir, "dashboard.json");
  writeFileSync(specFile, JSON.stringify({ title: "T", frames: [] }));
});
afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
  // runAgent writes a per-call temp out-file named with a module-scoped counter;
  // vi.resetModules() resets that counter every test, so the names collide
  // across tests. Sweep them so a stale file can't be mistaken for the current
  // run's output (this is what made the codex fallback read the wrong answer).
  for (const f of readdirSync(tmpdir())) {
    if (f.startsWith("zframes-ask-")) {
      try {
        unlinkSync(join(tmpdir(), f));
      } catch {
        /* another run already removed it */
      }
    }
  }
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const d of createdBinDirs) rmSync(d, { recursive: true, force: true });
});

/** A fresh temp dir to hold runner stubs for one test (cleaned in afterAll). */
const createdBinDirs: string[] = [];
function binDir(): string {
  const d = mkdtempSync(join(tmpdir(), "zframes-runner-"));
  createdBinDirs.push(d);
  return d;
}

/** Write an executable `#!/bin/sh` stub named `bin` into `d`. */
function stub(d: string, bin: string, sh: string): void {
  const p = join(d, bin);
  writeFileSync(p, `#!/bin/sh\n${sh}\n`);
  chmodSync(p, 0o755);
}

/**
 * A kimi stub that echoes the prompt it received back as its answer. kimi's
 * argv is `["-p", <prompt>, "--output-format", "text"]`, so the prompt is `$2`.
 * Echoing it lets a test read back exactly what buildPrompt produced and assert
 * which history turns survived handleAsk's validation.
 */
function kimiEchoStub(d: string): void {
  stub(d, "kimi", `printf '%s' "$2"`);
}

/** printf a set of NDJSON lines (each single-quoted; safe — no quotes inside). */
function printfLines(...lines: string[]): string {
  return `printf '%s\\n' ${lines.map((l) => `'${l}'`).join(" ")}`;
}

const claudeDeltaLine = (text: string) =>
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    },
  });
const claudeResultLine = (result: string) =>
  JSON.stringify({ type: "result", result });

/** Re-import agent.ts with a fresh detection cache under a stub-only PATH. */
async function freshAgent(pathDir: string) {
  process.env.PATH = pathDir;
  vi.resetModules();
  return import("@zframes/core/agent");
}

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  chunks: string[];
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(body?: string): void;
  done: Promise<void>;
}
function makeRes(): FakeRes {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end() {
      resolve();
    },
    done,
  };
}

/** Minimal POST request whose whole JSON body arrives in one data chunk. */
function makeAskReq(body: object) {
  const dataCbs: Array<(c: Buffer) => void> = [];
  const endCbs: Array<() => void> = [];
  const req = {
    method: "POST",
    headers: { "content-type": "application/json" },
    on(event: string, cb: (...a: unknown[]) => void) {
      if (event === "data") dataCbs.push(cb as (c: Buffer) => void);
      if (event === "end") endCbs.push(cb as () => void);
      return req;
    },
    destroy() {
      return req;
    },
  };
  return {
    req: req as unknown as AskReq,
    fire: () => {
      dataCbs.forEach((f) => f(Buffer.from(JSON.stringify(body))));
      endCbs.forEach((f) => f());
    },
  };
}

/** Parse the NDJSON the handler streamed into res.write(). */
function events(res: FakeRes): Array<Record<string, unknown>> {
  return res.chunks
    .join("")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Run one question through a fresh agent server over the given stub dir. */
async function ask(
  pathDir: string,
  body: {
    question: string;
    agent?: string;
    context?: unknown;
    history?: unknown;
  },
): Promise<FakeRes> {
  const { handleAsk } = await freshAgent(pathDir);
  const res = makeRes();
  const { req, fire } = makeAskReq(body);
  handleAsk(req, res, specFile);
  fire();
  await res.done;
  return res;
}

describe("handleAsk — streaming happy paths", () => {
  it("streams claude token deltas then the canonical done answer", async () => {
    const d = binDir();
    stub(
      d,
      "claude",
      printfLines(
        claudeDeltaLine("Hello "),
        claudeDeltaLine("world."),
        claudeResultLine("Hello world."),
      ),
    );
    const res = await ask(d, { question: "hi" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/x-ndjson; charset=utf-8",
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(events(res)).toEqual([
      { type: "delta", text: "Hello " },
      { type: "delta", text: "world." },
      { type: "done", agent: "claude", answer: "Hello world." },
    ]);
  }, 15_000);

  it("delivers a non-streaming runner's whole answer in a single done (no deltas)", async () => {
    const d = binDir();
    stub(d, "kimi", printfLines("ETH looks strong today."));
    const res = await ask(d, { question: "how is eth?" });
    // kimi has no delta parser, so nothing streams until the close.
    expect(events(res)).toEqual([
      { type: "done", agent: "kimi", answer: "ETH looks strong today." },
    ]);
  }, 15_000);

  it("reads codex's answer from its -o out-file, not stdout", async () => {
    const d = binDir();
    // Echo noise to stdout; write the real answer to the path after `-o`.
    stub(
      d,
      "codex",
      [
        "out=''",
        "prev=''",
        'for a in "$@"; do',
        '  if [ "$prev" = "-o" ]; then out="$a"; fi',
        '  prev="$a"',
        "done",
        "printf '%s\\n' 'stdout session noise'",
        `printf '%s\\n' 'Codex says gold is up.' > "$out"`,
      ].join("\n"),
    );
    const res = await ask(d, { question: "gold?" });
    expect(events(res)).toEqual([
      { type: "done", agent: "codex", answer: "Codex says gold is up." },
    ]);
  }, 15_000);

  it("flushes a trailing partial line (no final newline) as a delta on close", async () => {
    const d = binDir();
    // Last line has NO trailing newline, so it sits in the line buffer until the
    // close-flush. If that flush regresses, the final token is silently lost.
    const a = claudeDeltaLine("Aa ");
    const b = claudeDeltaLine("Bb");
    stub(d, "claude", `printf '%s\\n' '${a}'\nprintf '%s' '${b}'`);
    const res = await ask(d, { question: "hi" });
    expect(events(res)).toEqual([
      { type: "delta", text: "Aa " },
      { type: "delta", text: "Bb" },
      { type: "done", agent: "claude", answer: "Aa Bb" },
    ]);
  }, 15_000);
});

describe("handleAsk — streaming failure paths", () => {
  it("emits an error event with stderr when the runner exits non-zero", async () => {
    const d = binDir();
    stub(d, "claude", "printf '%s\\n' 'boom: model unavailable' 1>&2\nexit 1");
    const res = await ask(d, { question: "hi" });
    expect(events(res)).toEqual([
      { type: "error", agent: "claude", error: "boom: model unavailable" },
    ]);
  }, 15_000);

  it("emits an error when the runner exits 0 but returns nothing", async () => {
    const d = binDir();
    stub(d, "claude", "exit 0");
    const res = await ask(d, { question: "hi" });
    const evts = events(res);
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({ type: "error", agent: "claude" });
    expect(String(evts[0].error)).toContain("returned nothing");
  }, 15_000);
});

describe("handleAsk — runner selection", () => {
  it("honours the requested agent when it is installed", async () => {
    const d = binDir();
    stub(d, "claude", printfLines(claudeResultLine("from claude")));
    stub(d, "kimi", printfLines("from kimi"));
    const res = await ask(d, { question: "hi", agent: "kimi" });
    expect(events(res).at(-1)).toMatchObject({ type: "done", agent: "kimi" });
  }, 15_000);

  it("falls back to the first available runner for an unknown agent id", async () => {
    const d = binDir();
    stub(d, "claude", printfLines(claudeResultLine("from claude")));
    stub(d, "kimi", printfLines("from kimi"));
    const res = await ask(d, { question: "hi", agent: "nonexistent" });
    // RUNNERS order puts claude first, so it wins the fallback.
    expect(events(res).at(-1)).toMatchObject({ type: "done", agent: "claude" });
  }, 15_000);
});

describe("handleAsk — codex out-file fallback", () => {
  it("falls back to stdout when codex never writes its -o out-file", async () => {
    const d = binDir();
    // Print a usable answer to stdout but never touch the `-o` path, so
    // readResult's readFile(outFile) throws (ENOENT) and it falls back to
    // stdout.trim(). Guards the resilience path when codex fails to write -o.
    stub(d, "codex", printfLines("Codex fallback answer."));
    const res = await ask(d, { question: "gold?" });
    expect(events(res)).toEqual([
      { type: "done", agent: "codex", answer: "Codex fallback answer." },
    ]);
  }, 15_000);
});

describe("handleAsk — exec failure", () => {
  it("emits an error event when the runner fails to exec", async () => {
    const d = binDir();
    // A shebang pointing at a nonexistent interpreter: spawn() returns a child,
    // but the exec fails asynchronously, firing the child's 'error' event
    // (ENOENT). If that listener regressed, the process would crash on an
    // unhandled 'error' rather than degrading to an error event.
    const p = join(d, "claude");
    writeFileSync(p, "#!/nonexistent/interpreter\ntrue\n");
    chmodSync(p, 0o755);
    const res = await ask(d, { question: "hi" });
    const evts = events(res);
    expect(evts).toHaveLength(1);
    // The exact message is platform-dependent (e.g. "spawn ... ENOENT"), so
    // assert the shape, not the text.
    expect(evts[0]).toMatchObject({ type: "error", agent: "claude" });
    expect(String(evts[0].error).length).toBeGreaterThan(0);
  }, 15_000);
});

describe("handleAsk — request-body validation", () => {
  it("drops malformed history turns, keeping only valid ones in the prompt", async () => {
    const d = binDir();
    kimiEchoStub(d); // the answer IS the built prompt, so we can inspect it
    const res = await ask(d, {
      question: "why?",
      agent: "kimi",
      history: [
        { role: "user", text: "KEEPME" },
        { role: "system", text: "DROPME_ROLE" }, // invalid role
        { role: "user", text: 42 }, // non-string text (would crash if let through)
        null, // non-object
        "nope", // non-object
        { role: "zai", text: "KEEPTOO" },
      ],
    });
    const done = events(res).at(-1)!;
    // Completing at all proves the null/"nope"/numeric-text entries were dropped
    // before buildPrompt (otherwise the map would throw and the request hang).
    expect(done.type).toBe("done");
    expect(String(done.answer)).toContain("User: KEEPME");
    expect(String(done.answer)).toContain("zAI: KEEPTOO");
    expect(String(done.answer)).not.toContain("DROPME_ROLE");
  }, 15_000);

  it("ignores a non-array history without crashing (Array.isArray guard)", async () => {
    const d = binDir();
    kimiEchoStub(d);
    const res = await ask(d, {
      question: "hi",
      agent: "kimi",
      history: "not-an-array",
    });
    const done = events(res).at(-1)!;
    expect(done.type).toBe("done");
    // No history survived, so no transcript block is embedded in the prompt.
    expect(String(done.answer)).not.toContain("Conversation so far");
  }, 15_000);
});
