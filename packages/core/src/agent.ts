import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The zAI "ask" contract: an opt-in, keyless bridge from the dashboard to a
 * local agent CLI the user already has installed and authenticated. The server
 * shells out to one of several runners (`claude -p`, `codex exec`, `kimi -p`),
 * each of which piggybacks the user's OWN auth — zframes is handed no API key,
 * so this stays inside the "no keys, anywhere" scope. If none are on PATH the
 * routes report an empty list and the orb hides itself; the default keyless
 * dashboard is byte-for-byte unchanged.
 *
 * Node-only and React-free (built-ins only) so it bundles into the CLI next to
 * `./serve` and loads under Vite's Node config loader. Same `(req, res)` shape
 * as `./serve`, shared verbatim by the dev plugin and the CLI server.
 */

// Route strings live in `routes` (React-free AND Node-free) so the browser
// bundle can import them without pulling in this file's `node:child_process` /
// `node:fs` deps. Re-exported here for the Node servers that import them
// alongside the handlers from `@zframes/core/agent`. Imported by package subpath
// (NOT relative `./routes`) because this file is reached by Vite's Node
// config-loader, which can't resolve a relative extensionless path.
export { AGENTS_LIST_ROUTE, ASK_ROUTE } from "@zframes/core/routes";

const MAX_BODY_BYTES = 64_000; // a question, never an upload
const RUN_TIMEOUT_MS = 120_000; // bound latency/cost — kill a runaway agent
const MAX_CONTEXT_CHARS = 12_000; // cap the client's on-screen digest in the prompt

// Structural req/res shapes satisfied by both Node http and Vite connect, so
// this module needs no node/vite type dep (mirrors `./serve`).
interface ReqLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", cb: (chunk: Buffer) => void): unknown;
  on(event: "end", cb: () => void): unknown;
  destroy(): unknown;
}
interface ResLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  write(chunk: string): unknown;
  end(body?: string): unknown;
}

interface Runner {
  id: string;
  label: string;
  bin: string;
  /**
   * argv for a one-shot, read-only answer. `outFile` is a temp path a runner may
   * write its final message to (codex) instead of stdout.
   */
  buildArgs(prompt: string, outFile: string): string[];
  /**
   * Streaming runners parse ONE line of their NDJSON stdout into an incremental
   * text delta (or null for non-text lines), so the answer can be relayed to the
   * browser token-by-token. Runners that omit it don't stream — their whole
   * answer is delivered once, via `readResult` on close.
   */
  parseDelta?(line: string): string | null;
  /** The final, canonical answer from full stdout (or the out-file). */
  readResult(stdout: string, outFile: string): Promise<string>;
}

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
  event?: { type?: string; delta?: { type?: string; text?: unknown } };
}

/** A single token-level text delta from a Claude stream line, or null. */
function claudeDelta(line: string): string | null {
  const o = tryParse<ClaudeStreamLine>(line);
  if (o?.type !== "stream_event") return null;
  const delta =
    o.event?.type === "content_block_delta" ? o.event.delta : undefined;
  return delta?.type === "text_delta" && typeof delta.text === "string"
    ? delta.text
    : null;
}

/** Claude's canonical answer: the closing `result`, else the joined deltas. */
function claudeResult(stdout: string): string {
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

const RUNNERS: Runner[] = [
  {
    id: "claude",
    label: "Claude",
    bin: "claude",
    // -p/--print is non-interactive. stream-json emits NDJSON events as the
    // answer is generated; --verbose is required alongside it under -p, and
    // --include-partial-messages adds the token-level `content_block_delta`
    // events we relay live. The canonical answer is the closing `result` event.
    buildArgs: (prompt) => [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
    ],
    parseDelta: claudeDelta,
    readResult: async (stdout) => claudeResult(stdout),
  },
  {
    id: "codex",
    label: "Codex",
    bin: "codex",
    // `exec` is non-interactive; read-only sandbox so a Q&A can't mutate
    // anything, and -o writes ONLY the final message to a file (stdout carries
    // session noise). --skip-git-repo-check so it runs outside a repo too.
    buildArgs: (prompt, outFile) => [
      "exec",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "--color",
      "never",
      "-o",
      outFile,
      prompt,
    ],
    readResult: async (stdout, outFile) => {
      try {
        return (await readFile(outFile, "utf8")).trim();
      } catch {
        return stdout.trim();
      }
    },
  },
  {
    id: "kimi",
    label: "Kimi",
    bin: "kimi",
    // -p/--prompt runs one prompt non-interactively and prints the response.
    buildArgs: (prompt) => ["-p", prompt, "--output-format", "text"],
    readResult: async (stdout) => stdout.trim(),
  },
];

/** First executable named `bin` on PATH, or null (shell-less, like a spawn). */
async function onPath(bin: string): Promise<boolean> {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    try {
      await access(join(dir, bin), constants.X_OK);
      return true;
    } catch {
      /* keep scanning */
    }
  }
  return false;
}

let detected: Promise<Runner[]> | null = null;
/** Runners actually installed, detected once and cached for the process. */
function detectAgents(): Promise<Runner[]> {
  if (!detected) {
    detected = Promise.all(
      RUNNERS.map(async (r) => ((await onPath(r.bin)) ? r : null)),
    ).then((rs) => rs.filter((r): r is Runner => r !== null));
  }
  return detected;
}

/**
 * Ground the answer in what's on screen. The browser sends a live digest of the
 * dashboard (`clientContext` — frames + current readings, built in the runtime's
 * screen-context.ts); we prefer it when present. Without it (CLI-only client, or
 * a capture failure) we fall back to reading the spec from disk for the title +
 * the symbols, so the bridge still works standalone.
 */
async function buildPrompt(
  specFile: string,
  question: string,
  clientContext?: string,
  catalogue?: string,
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
    `Hyperliquid HIP-3 equity perps (e.g. "xyz:TSLA") shown alongside crypto. Help ` +
    `the user read what's on their screen and the markets it tracks.\n\n` +
    `${frameCatalogue}` +
    `${grounding}\n\n` +
    `Answer the user's question in 2–4 sentences of plain text — no markdown headings, ` +
    `no preamble, no tool use, just the answer.\n\nQuestion: ${question}`
  );
}

type RunResult = { ok: true; answer: string } | { ok: false; error: string };

let askCounter = 0;
function runAgent(
  runner: Runner,
  prompt: string,
  cwd: string,
  onDelta?: (text: string) => void,
): Promise<RunResult> {
  const outFile = join(
    tmpdir(),
    `zframes-ask-${process.pid}-${++askCounter}.txt`,
  );
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      // stdin is /dev/null: no runner reads it (the prompt is an argv), and
      // `codex exec` otherwise BLOCKS reading stdin for EOF until our timeout
      // kills it. Closing it also skips claude's ~3s "waiting for stdin" stall.
      child = spawn(runner.bin, runner.buildArgs(prompt, outFile), {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let lineBuf = ""; // holds the partial trailing line between stdout chunks
    let settled = false;
    const finish = (r: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, error: `${runner.label} timed out` });
    }, RUN_TIMEOUT_MS);
    // Relay token deltas live for streaming runners; non-streaming ones (codex,
    // kimi) skip this and deliver the whole answer once on close.
    const streaming = Boolean(onDelta && runner.parseDelta);
    const emit = (line: string) => {
      const delta = runner.parseDelta?.(line);
      if (delta) onDelta?.(delta);
    };
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d;
      if (!streaming) return;
      lineBuf += d;
      let nl: number;
      while ((nl = lineBuf.indexOf("\n")) !== -1) {
        emit(lineBuf.slice(0, nl));
        lineBuf = lineBuf.slice(nl + 1);
      }
    });
    child.stderr?.on("data", (d: Buffer) => (stderr += d));
    child.on("error", (e: Error) =>
      finish({ ok: false, error: String(e.message) }),
    );
    child.on("close", (code: number | null) => {
      if (streaming && lineBuf) emit(lineBuf); // flush any trailing partial line
      if (code !== 0) {
        finish({
          ok: false,
          error: stderr.trim() || `${runner.label} exited with code ${code}`,
        });
        return;
      }
      void runner
        .readResult(stdout, outFile)
        .then((answer) =>
          finish(
            answer
              ? { ok: true, answer }
              : { ok: false, error: `${runner.label} returned nothing` },
          ),
        );
    });
  });
}

/** GET — the installed runners, so the orb shows only when one is available. */
export async function handleAgents(res: ResLike): Promise<void> {
  const agents = await detectAgents();
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(
    JSON.stringify({ agents: agents.map(({ id, label }) => ({ id, label })) }),
  );
}

/**
 * POST { question, agent? } — CSRF-guarded (JSON content-type) and size-capped
 * like the spec write. Picks the requested runner if installed, else the first
 * available, runs it read-only, and returns { ok, agent, answer }.
 */
export function handleAsk(
  req: ReqLike,
  res: ResLike,
  specFile: string,
  catalogue?: string,
): void {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    res.statusCode = 415;
    res.end();
    return;
  }
  let body = "";
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    if (aborted) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      aborted = true;
      res.statusCode = 413;
      res.end();
      req.destroy();
    }
  });
  req.on("end", async () => {
    if (aborted) return;
    // Failures BEFORE we commit to streaming come back as a normal JSON body
    // with a status code; once the agent starts, the answer streams as NDJSON.
    const replyJson = (status: number, payload: object) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
    };
    let question: string;
    let requested: string | undefined;
    let clientContext: string | undefined;
    try {
      const parsed = JSON.parse(body) as {
        question?: unknown;
        agent?: unknown;
        context?: unknown;
      };
      if (typeof parsed.question !== "string" || !parsed.question.trim())
        throw new Error("missing question");
      question = parsed.question.trim();
      requested = typeof parsed.agent === "string" ? parsed.agent : undefined;
      clientContext =
        typeof parsed.context === "string" ? parsed.context : undefined;
    } catch (error) {
      replyJson(400, { ok: false, error: String((error as Error).message) });
      return;
    }
    const agents = await detectAgents();
    if (agents.length === 0) {
      replyJson(503, {
        ok: false,
        error: "no agent CLI found — install claude, codex, or kimi",
      });
      return;
    }
    const runner = agents.find((a) => a.id === requested) ?? agents[0];
    const prompt = await buildPrompt(
      specFile,
      question,
      clientContext,
      catalogue,
    );
    // Commit to a streamed NDJSON response: one JSON object per line. The orb
    // appends `delta` chunks live, then replaces them with the canonical `done`
    // answer (or shows `error`). Headers go out now so tokens flush as they
    // arrive; `send` is guarded so a client that navigated away can't crash us.
    res.statusCode = 200;
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-accel-buffering", "no"); // defeat proxy buffering, if any
    const send = (event: object) => {
      try {
        res.write(`${JSON.stringify(event)}\n`);
      } catch {
        /* client disconnected — let the run finish and unwind */
      }
    };
    const result = await runAgent(runner, prompt, dirname(specFile), (text) =>
      send({ type: "delta", text }),
    );
    if (result.ok)
      send({ type: "done", agent: runner.id, answer: result.answer });
    else send({ type: "error", agent: runner.id, error: result.error });
    try {
      res.end();
    } catch {
      /* already torn down */
    }
  });
}
