import { describe, expect, it } from "vitest";
import { resolveAgentEnv } from "@zframes/zai/agent";

// resolveAgentEnv is pure — it decides the child env for a spawned runner from a
// base env + the runner's config-dir var. Nothing here spawns a process; this is
// the deterministic-logic layer (mirrors agent-prompt.test.ts).

describe("resolveAgentEnv", () => {
  it("passes the base env through unchanged when the runner has no configEnv", () => {
    const base = { PATH: "/bin", ZFRAMES_CLAUDE_CONFIG_DIR: "/x" };
    expect(resolveAgentEnv({}, base)).toBe(base); // same ref → no allocation
  });

  it("passes through when configEnv is set but no ZFRAMES_ override exists", () => {
    const base = { PATH: "/bin", CLAUDE_CONFIG_DIR: "/home/.claude" };
    const out = resolveAgentEnv({ configEnv: "CLAUDE_CONFIG_DIR" }, base);
    expect(out).toBe(base); // untouched — default single-account users unaffected
    expect(out.CLAUDE_CONFIG_DIR).toBe("/home/.claude");
  });

  it("applies ZFRAMES_CLAUDE_CONFIG_DIR to CLAUDE_CONFIG_DIR for the child only", () => {
    const base = {
      PATH: "/bin",
      CLAUDE_CONFIG_DIR: "/home/.claude", // the global/default account
      ZFRAMES_CLAUDE_CONFIG_DIR: "/home/.claude-2", // the zframes-scoped override
    };
    const out = resolveAgentEnv({ configEnv: "CLAUDE_CONFIG_DIR" }, base);
    expect(out.CLAUDE_CONFIG_DIR).toBe("/home/.claude-2"); // child points at the override
    expect(out.PATH).toBe("/bin"); // rest of env preserved
    expect(out).not.toBe(base); // a copy — base is not mutated
    expect(base.CLAUDE_CONFIG_DIR).toBe("/home/.claude"); // ...proven here
  });

  it("applies ZFRAMES_CODEX_HOME to CODEX_HOME (codex uses a different var)", () => {
    const base = { ZFRAMES_CODEX_HOME: "/home/.codex-work" };
    const out = resolveAgentEnv({ configEnv: "CODEX_HOME" }, base);
    expect(out.CODEX_HOME).toBe("/home/.codex-work");
  });

  it("treats an empty override as no override (passes through)", () => {
    const base = {
      CLAUDE_CONFIG_DIR: "/home/.claude",
      ZFRAMES_CLAUDE_CONFIG_DIR: "",
    };
    const out = resolveAgentEnv({ configEnv: "CLAUDE_CONFIG_DIR" }, base);
    expect(out).toBe(base);
    expect(out.CLAUDE_CONFIG_DIR).toBe("/home/.claude");
  });
});
