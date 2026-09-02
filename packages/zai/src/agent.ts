import { spawn } from "node:child_process";
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
 *
 * This file holds the HTTP handlers + the spawn/stream orchestration; the
 * sibling modules carry one topic each — `agent-stream` (Claude stream-line
 * parsing), `agent-prompt` (prompt construction), `agent-env` (runner registry,
 * PATH detection, child-env resolution). Siblings are imported by package
 * subpath (NOT relative paths) because this file is reached by Vite's Node
 * config-loader, which can't resolve a relative extensionless path.
 */

// Route strings live in `routes` (React-free AND Node-free) so the browser
// bundle can import them without pulling in this file's `node:child_process` /
// `node:fs` deps. Re-exported here for the Node servers that import them
// alongside the handlers from `@zframes/zai/agent`. Imported by package subpath
// (NOT relative `./routes`) because this file is reached by Vite's Node
// config-loader, which can't resolve a relative extensionless path.
export { AGENTS_LIST_ROUTE, ASK_ROUTE } from "@zframes/spec/routes";

import {
  detectAgents,
  resolveAgentEnv,
  type Runner,
} from "@zframes/zai/agent-env";
import {
  buildPrompt,
  MAX_HISTORY_TURNS,
  type HistoryTurn,
} from "@zframes/zai/agent-prompt";

// Re-exported so the package barrel (and the tests/hosts importing from
// `@zframes/zai/agent`) keep the same public surface as before the split.
export {
  claudeDelta,
  claudeResult,
  claudeStatus,
} from "@zframes/zai/agent-stream";
export { resolveAgentEnv } from "@zframes/zai/agent-env";
export { buildPrompt, type HistoryTurn } from "@zframes/zai/agent-prompt";

// The hard cap on a request body. It covers the question PLUS the board digest
// and the replayed thread, so the client trims those to fit before sending
// (apps/runtime's ask-payload.ts) and this stays the backstop — which is why the
// 413 blames the context rather than the question.
const MAX_BODY_BYTES = 64_000; // a question, never an upload
const RUN_TIMEOUT_MS = 120_000; // bound latency/cost — kill a runaway agent

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
  /** Optional so a test double needn't provide it; real Node/connect responses
      always do. Used for one thing: noticing the client went away mid-run. */
  on?(event: "close", cb: () => void): unknown;
}

type RunResult =
  | { ok: true; answer: string }
  // `cancelled` marks a run we killed ourselves because the client hung up —
  // there is nobody left to send an error event to.
  | { ok: false; error: string; cancelled?: boolean };

let askCounter = 0;
function runAgent(
  runner: Runner,
  prompt: string,
  cwd: string,
  onDelta?: (text: string) => void,
  onStatus?: (text: string) => void,
  /** Handed a `cancel()` once the child is up — kills the run on demand. */
  registerCancel?: (cancel: () => void) => void,
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
        // A ZFRAMES_<CONFIG_VAR> override points this CLI at a specific account
        // (config/creds dir) without touching the global env — see resolveAgentEnv.
        env: resolveAgentEnv(runner),
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
    // The run is billed to the user's OWN agent account, so a question they
    // cancelled must stop costing them: the orb aborts its fetch, that closes
    // the response, and the handler calls this. Without it the child kept
    // working for up to the full RUN_TIMEOUT_MS with nobody listening.
    registerCancel?.(() => {
      if (settled) return;
      child.kill("SIGKILL");
      finish({
        ok: false,
        cancelled: true,
        error: `${runner.label} cancelled`,
      });
    });
    // Relay token deltas + tool-status live for streaming runners; non-streaming
    // ones (codex, kimi) skip this and deliver the whole answer once on close.
    const streaming = Boolean(
      (onDelta && runner.parseDelta) || (onStatus && runner.parseStatus),
    );
    const emit = (line: string) => {
      const delta = runner.parseDelta?.(line);
      if (delta) onDelta?.(delta);
      const status = runner.parseStatus?.(line);
      if (status) onStatus?.(status);
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
 * POST { question, agent?, context?, history?, synthetic? } — CSRF-guarded
 * (JSON content-type) and size-capped like the spec write. Picks the requested
 * runner if installed, else the first available, runs it read-only, and returns
 * { ok, agent, answer }. `history` is the orb's ephemeral thread, replayed for
 * follow-up context (bounded to the last MAX_HISTORY_TURNS turns). `synthetic`
 * flags a `context` whose readings are the demo provider's generated numbers,
 * which the answer has to disclose. Closing the response mid-run cancels it.
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
      // Name what was actually oversized. The cap covers the board digest and
      // the replayed thread as well as the question, so "that question was too
      // long" was routinely wrong — and the client trims those before sending,
      // so getting here means the context itself couldn't be made to fit. The
      // body is best-effort (the socket is torn down straight after); the
      // client carries the same wording as its status-code fallback.
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error:
            "too much board context to send with that question — try it on a smaller board",
        }),
      );
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
    let history: HistoryTurn[] | undefined;
    let synthetic: boolean;
    try {
      const parsed = JSON.parse(body) as {
        question?: unknown;
        agent?: unknown;
        context?: unknown;
        history?: unknown;
        synthetic?: unknown;
      };
      if (typeof parsed.question !== "string" || !parsed.question.trim())
        throw new Error("missing question");
      question = parsed.question.trim();
      requested = typeof parsed.agent === "string" ? parsed.agent : undefined;
      clientContext =
        typeof parsed.context === "string" ? parsed.context : undefined;
      // The page tells us when its readings are the demo provider's generated
      // numbers — it is the only side that knows which plugins actually
      // mounted. Absent flag == live, so an older client is never mislabelled.
      synthetic = parsed.synthetic === true;
      // Validate the client-sent thread defensively, then keep only the tail.
      if (Array.isArray(parsed.history))
        history = parsed.history
          .filter(
            (m): m is HistoryTurn =>
              !!m &&
              typeof m === "object" &&
              ((m as { role?: unknown }).role === "user" ||
                (m as { role?: unknown }).role === "zai") &&
              typeof (m as { text?: unknown }).text === "string",
          )
          .slice(-MAX_HISTORY_TURNS);
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
      history,
      synthetic,
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
    // A cancelled ask (the orb's Stop control, or closing the orb) aborts the
    // fetch, which closes this response. There is no cancel ROUTE — the socket
    // closing IS the signal — so kill the child here rather than letting it
    // spend the user's own agent quota for the rest of RUN_TIMEOUT_MS.
    // `runFinished` distinguishes the two ways a response closes: an early
    // close is the client leaving, a close afterwards is the response ending.
    let runFinished = false;
    let cancelRun: (() => void) | null = null;
    res.on?.("close", () => {
      if (!runFinished) cancelRun?.();
    });
    const result = await runAgent(
      runner,
      prompt,
      dirname(specFile),
      (text) => send({ type: "delta", text }),
      (text) => send({ type: "status", text }),
      (cancel) => {
        cancelRun = cancel;
      },
    );
    runFinished = true;
    // Nothing to report to a client that hung up; just unwind.
    if (!result.ok && result.cancelled) {
      try {
        res.end();
      } catch {
        /* already torn down */
      }
      return;
    }
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
