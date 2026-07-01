import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { handleAsk } from "@zframes/core/agent";

// These cover every branch that returns BEFORE handleAsk spawns a runner — the
// method/content-type/size/JSON guards plus the "no runner installed" path — and
// handleAgents' detection JSON. No real agent CLI is ever invoked here (the
// streaming happy path lives in agent-stream.test.ts). Detection reads
// process.env.PATH, and detectAgents() memoizes per module instance, so the
// PATH-sensitive cases re-import a fresh module via vi.resetModules().

type AskReq = Parameters<typeof handleAsk>[0];

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  chunks: string[];
  body?: string;
  ended: boolean;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(body?: string): void;
  /** Resolves when the handler calls res.end(). */
  done: Promise<void>;
}

function makeRes(): FakeRes {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end(body) {
      this.body = body;
      this.ended = true;
      resolve();
    },
    done,
  };
}

/** A controllable ask request — call the handler, then drive data/end. */
function makeAskReq(
  opts: { method?: string; contentType?: string | null } = {},
) {
  const { method = "POST", contentType = "application/json" } = opts;
  const dataCbs: Array<(c: Buffer) => void> = [];
  const endCbs: Array<() => void> = [];
  let destroyed = false;
  const req = {
    method,
    headers: contentType == null ? {} : { "content-type": contentType },
    on(event: string, cb: (...a: unknown[]) => void) {
      if (event === "data") dataCbs.push(cb as (c: Buffer) => void);
      if (event === "end") endCbs.push(cb as () => void);
      return req;
    },
    destroy() {
      destroyed = true;
      return req;
    },
  };
  return {
    req: req as unknown as AskReq,
    emitData: (c: Buffer) => dataCbs.forEach((f) => f(c)),
    emitEnd: () => endCbs.forEach((f) => f()),
    get destroyed() {
      return destroyed;
    },
  };
}

const ORIGINAL_PATH = process.env.PATH;
let dir: string;
let specFile: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zframes-http-"));
  specFile = join(dir, "dashboard.json");
  writeFileSync(specFile, JSON.stringify({ title: "T", frames: [] }));
});
afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A temp dir seeded with empty, executable stubs named after the given bins. */
function binDirWith(...bins: string[]): string {
  const d = mkdtempSync(join(tmpdir(), "zframes-bin-"));
  for (const b of bins) {
    const p = join(d, b);
    writeFileSync(p, "");
    chmodSync(p, 0o755);
  }
  return d;
}

/** Re-import agent.ts with a fresh detection cache under a controlled PATH. */
async function freshAgent(pathDir: string) {
  process.env.PATH = pathDir;
  vi.resetModules();
  return import("@zframes/core/agent");
}

describe("handleAsk — pre-spawn guards", () => {
  it("rejects a non-POST method with 405", () => {
    const { req } = makeAskReq({ method: "GET" });
    const res = makeRes();
    handleAsk(req, res, specFile);
    expect(res.statusCode).toBe(405);
    expect(res.ended).toBe(true);
  });

  it("rejects a missing JSON content-type with 415 (CSRF guard)", () => {
    const { req } = makeAskReq({ contentType: null });
    const res = makeRes();
    handleAsk(req, res, specFile);
    expect(res.statusCode).toBe(415);
  });

  it("rejects text/plain with 415", () => {
    const { req } = makeAskReq({ contentType: "text/plain" });
    const res = makeRes();
    handleAsk(req, res, specFile);
    expect(res.statusCode).toBe(415);
  });

  it("returns 413 and destroys the request when the body exceeds the cap", () => {
    const ctl = makeAskReq();
    const res = makeRes();
    handleAsk(ctl.req, res, specFile);
    ctl.emitData(Buffer.alloc(64_001, 0x61)); // one byte over MAX_BODY_BYTES
    expect(res.statusCode).toBe(413);
    expect(ctl.destroyed).toBe(true);
    // A late end after abort must be a no-op, not a second response.
    ctl.emitEnd();
    expect(res.statusCode).toBe(413);
  });

  it("returns 400 on malformed JSON", async () => {
    const ctl = makeAskReq();
    const res = makeRes();
    handleAsk(ctl.req, res, specFile);
    ctl.emitData(Buffer.from("{not valid json"));
    ctl.emitEnd();
    await res.done;
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? "{}")).toMatchObject({ ok: false });
  });

  it("returns 400 when the question is missing or blank", async () => {
    const ctl = makeAskReq();
    const res = makeRes();
    handleAsk(ctl.req, res, specFile);
    ctl.emitData(
      Buffer.from(JSON.stringify({ question: "   ", agent: "claude" })),
    );
    ctl.emitEnd();
    await res.done;
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? "{}").error).toContain("missing question");
  });

  it("returns 503 when no agent CLI is installed", async () => {
    const emptyDir = binDirWith(); // no runners on PATH
    const { handleAsk: freshHandleAsk } = await freshAgent(emptyDir);
    const ctl = makeAskReq();
    const res = makeRes();
    freshHandleAsk(ctl.req, res, specFile);
    ctl.emitData(Buffer.from(JSON.stringify({ question: "hi" })));
    ctl.emitEnd();
    await res.done;
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body ?? "{}").error).toContain("no agent CLI");
  });
});

describe("handleAgents — detection", () => {
  it("returns 200 no-store JSON listing exactly the installed runners", async () => {
    const binDir = binDirWith("claude", "kimi"); // codex intentionally absent
    const { handleAgents } = await freshAgent(binDir);
    const res = makeRes();
    await handleAgents(res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(res.body ?? "{}")).toEqual({
      agents: [
        { id: "claude", label: "Claude" },
        { id: "kimi", label: "Kimi" },
      ],
    });
  });

  it("returns an empty list when nothing is installed", async () => {
    const { handleAgents } = await freshAgent(binDirWith());
    const res = makeRes();
    await handleAgents(res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? "{}")).toEqual({ agents: [] });
  });
});
