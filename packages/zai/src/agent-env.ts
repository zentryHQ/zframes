import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

// By package subpath, not a relative `./agent-stream` — Node-loaded files in
// this repo import siblings by package subpath (Vite's Node config-loader can't
// resolve a relative extensionless path).
import {
  claudeDelta,
  claudeResult,
  claudeStatus,
} from "@zframes/zai/agent-stream";

/**
 * The runner registry + environment resolution: which local agent CLIs zAI can
 * shell out to, how each is invoked, PATH detection (memoized per process), and
 * the zframes-scoped account override applied to a runner's child env.
 */

export interface Runner {
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
  /**
   * Optional: map ONE stdout line to a short status ("searching the web…") when
   * the runner starts a tool call, so the orb shows activity during the gap
   * before the answer streams. Null for lines that aren't a tool start.
   */
  parseStatus?(line: string): string | null;
  /** The final, canonical answer from full stdout (or the out-file). */
  readResult(stdout: string, outFile: string): Promise<string>;
  /**
   * The env var this CLI reads for its config/credentials dir (claude →
   * CLAUDE_CONFIG_DIR, codex → CODEX_HOME). Lets a user point zframes at a specific
   * account via `ZFRAMES_<var>`, applied only to this runner's child so it never
   * hijacks a bare `claude`/`codex` elsewhere. Omitted → env is passed through as-is.
   * See `resolveAgentEnv`.
   */
  configEnv?: string;
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
    // --allowedTools whitelists WebSearch/WebFetch so zAI can look up news +
    // context; in headless -p that also KEEPS Bash/Write/Edit blocked (only
    // allowlisted tools auto-approve), so it can search the web but can't wander
    // the dashboard folder we run it in. Search results interleave as tool
    // events the delta parser ignores, then the text answer streams as usual.
    buildArgs: (prompt) => [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--allowedTools",
      "WebSearch",
      "WebFetch",
    ],
    parseDelta: claudeDelta,
    parseStatus: claudeStatus,
    readResult: async (stdout) => claudeResult(stdout),
    configEnv: "CLAUDE_CONFIG_DIR",
  },
  {
    id: "codex",
    label: "Codex",
    bin: "codex",
    // `exec` is non-interactive; read-only sandbox so a Q&A can't mutate
    // anything, and -o writes ONLY the final message to a file (stdout carries
    // session noise). --skip-git-repo-check so it runs outside a repo too.
    // --search enables the native web_search tool for news + context (a network
    // read, orthogonal to the read-only filesystem sandbox). It's a TOP-LEVEL
    // codex flag, so it must precede the `exec` subcommand — after it, exec's
    // parser rejects it as an unknown argument.
    buildArgs: (prompt, outFile) => [
      "--search",
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
    configEnv: "CODEX_HOME",
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
export function detectAgents(): Promise<Runner[]> {
  if (!detected) {
    detected = Promise.all(
      RUNNERS.map(async (r) => ((await onPath(r.bin)) ? r : null)),
    ).then((rs) => rs.filter((r): r is Runner => r !== null));
  }
  return detected;
}

/**
 * The environment a runner's child process should receive: the parent env, plus —
 * when the user has set the zframes-scoped override `ZFRAMES_<CONFIG_VAR>` — that
 * value applied to the CLI's own config-dir var (`runner.configEnv`). This lets a
 * user point zframes at a specific account (`ZFRAMES_CLAUDE_CONFIG_DIR`,
 * `ZFRAMES_CODEX_HOME`) without exporting `CLAUDE_CONFIG_DIR` / `CODEX_HOME`
 * globally — which would hijack every other invocation of that CLI (and break a
 * multi-account setup). With no override set the parent env is returned unchanged,
 * so default single-account users are unaffected. Exported as the unit seam for
 * agent-env.test.ts.
 */
export function resolveAgentEnv(
  runner: Pick<Runner, "configEnv">,
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  if (!runner.configEnv) return baseEnv;
  const override = baseEnv[`ZFRAMES_${runner.configEnv}`];
  if (!override) return baseEnv;
  return { ...baseEnv, [runner.configEnv]: override };
}
