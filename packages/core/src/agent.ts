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
  end(body?: string): unknown;
}

interface Runner {
  id: string;
  label: string;
  bin: string;
  /**
   * argv for a one-shot, read-only, plain-text answer. `outFile` is a temp path
   * a runner may write its final message to (codex) instead of stdout.
   */
  buildArgs(prompt: string, outFile: string): string[];
  /** Pull the answer from stdout, or the out-file for runners that use it. */
  readResult(stdout: string, outFile: string): Promise<string>;
}

const RUNNERS: Runner[] = [
  {
    id: "claude",
    label: "Claude",
    bin: "claude",
    // -p/--print is non-interactive; text format prints just the answer.
    buildArgs: (prompt) => ["-p", prompt, "--output-format", "text"],
    readResult: async (stdout) => stdout.trim(),
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
    ? `Here is what the user is looking at on their dashboard right now ` +
      `(live values captured from the screen):\n\n${trimmed.slice(
        0,
        MAX_CONTEXT_CHARS,
      )}`
    : `The symbols on screen right now are: ${
        symbols.size ? [...symbols].join(", ") : "no specific symbols"
      }.`;
  return (
    `You are zAI, a market assistant embedded in a live dashboard titled "${title}".\n\n` +
    `${grounding}\n\n` +
    `Answer the user's question in 2–4 sentences of plain text — no markdown headings, ` +
    `no preamble, no tool use, just the answer.\n\nQuestion: ${question}`
  );
}

let askCounter = 0;
function runAgent(
  runner: Runner,
  prompt: string,
  cwd: string,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const outFile = join(
    tmpdir(),
    `zframes-ask-${process.pid}-${++askCounter}.txt`,
  );
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(runner.bin, runner.buildArgs(prompt, outFile), { cwd });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (
      r: { ok: true; answer: string } | { ok: false; error: string },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, error: `${runner.label} timed out` });
    }, RUN_TIMEOUT_MS);
    child.stdout?.on("data", (d: Buffer) => (stdout += d));
    child.stderr?.on("data", (d: Buffer) => (stderr += d));
    child.on("error", (e: Error) =>
      finish({ ok: false, error: String(e.message) }),
    );
    child.on("close", (code: number | null) => {
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
export function handleAsk(req: ReqLike, res: ResLike, specFile: string): void {
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
    const reply = (status: number, payload: object) => {
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
      reply(400, { ok: false, error: String((error as Error).message) });
      return;
    }
    const agents = await detectAgents();
    if (agents.length === 0) {
      reply(503, {
        ok: false,
        error: "no agent CLI found — install claude, codex, or kimi",
      });
      return;
    }
    const runner = agents.find((a) => a.id === requested) ?? agents[0];
    const prompt = await buildPrompt(specFile, question, clientContext);
    const result = await runAgent(runner, prompt, dirname(specFile));
    if (result.ok)
      reply(200, { ok: true, agent: runner.id, answer: result.answer });
    else reply(502, { ok: false, agent: runner.id, error: result.error });
  });
}
