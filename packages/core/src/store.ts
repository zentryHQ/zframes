import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The zframes global store — a config home that lets the CLI run from anywhere
 * and hold many named dashboards instead of a lone `./dashboard.json`. Node-only
 * and React-free (just `node:fs`/`os`/`path`), so the CLI bundles it and the dev
 * Vite plugin / `serve` http server can import it; the browser bundle never does
 * (it only ever sees the React-free route *strings* from `./routes`).
 *
 * Layout (XDG-respecting — honours `$XDG_CONFIG_HOME`, else `~/.config`):
 *
 *   ~/.config/zframes/
 *     config.json            { "default": "<name>" }
 *     dashboards/<name>.json one file per named dashboard
 *     credentials.json       keyed-account secrets (see ./account)
 *
 * One home definition lives here; `./account` reads its credential path from
 * this module so the two never drift to different homes.
 */

/** A dashboard name is a kebab/snake token — never a path. Bounds the filename
 *  and (because it forbids `/`, `.`, `..`) closes any path-traversal vector for
 *  the store-name → file mapping and the in-app switch route. */
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidName(name: string): boolean {
  return name.length <= 64 && NAME_RE.test(name);
}

/** The store home, honouring `$XDG_CONFIG_HOME` (read live so tests can set it). */
export function storeHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg.trim() : join(homedir(), ".config");
  return join(base, "zframes");
}

export function dashboardsDir(): string {
  return join(storeHome(), "dashboards");
}

export function configPath(): string {
  return join(storeHome(), "config.json");
}

/** Credential file (XDG home) — read/written by `./account`. */
export function credentialsFile(): string {
  return join(storeHome(), "credentials.json");
}

/** Absolute path of a named store dashboard (does not check existence). */
export function dashboardPath(name: string): string {
  return join(dashboardsDir(), `${name}.json`);
}

/**
 * Create the store home + dashboards dir if missing. Cheap + idempotent. The
 * home is created `0700` because it also holds `credentials.json` (see
 * `./account`) — keep the secret-bearing dir private even when a dashboard is
 * what created it. (The dashboards subdir itself isn't sensitive.)
 */
export function ensureHome(): void {
  mkdirSync(storeHome(), { recursive: true, mode: 0o700 });
  mkdirSync(dashboardsDir(), { recursive: true });
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/**
 * An argument is a filesystem PATH (not a store name) when it carries any path
 * signal: a separator, a leading `.`/`~`, or a `.json` suffix. This keeps every
 * pre-store invocation (`serve dashboard.json`, `serve ./foo/x.json`,
 * `serve ~/dash.json`) byte-for-byte backward compatible; a bare token like
 * `crypto` is the new store-name case.
 */
function looksLikePath(arg: string): boolean {
  return (
    arg.includes("/") ||
    arg.includes("\\") ||
    arg.startsWith(".") ||
    arg.startsWith("~") ||
    arg.toLowerCase().endsWith(".json")
  );
}

/** A dashboard the CLI resolved to: either a bare filesystem path or a named
 *  entry in the store. `store` entries are the ones the in-app switcher ranges
 *  over (their assets share the stable `dashboards/` root). */
export type ResolvedTarget =
  | { kind: "path"; file: string }
  | { kind: "store"; name: string; file: string };

/**
 * Classify an explicit argument as a path or a store name (no existence check —
 * callers decide whether a missing file is an error, e.g. `init` creates it).
 * For paths, `file` is the resolved token itself (callers append `dashboard.json`
 * for a directory target); for store names it's `<dashboards>/<name>.json`.
 */
export function classifyTarget(
  arg: string,
  cwd: string,
): ResolvedTarget | { error: string } {
  if (looksLikePath(arg)) {
    return { kind: "path", file: resolve(cwd, expandTilde(arg)) };
  }
  if (!isValidName(arg)) {
    return {
      error: `"${arg}" is not a valid dashboard name (lowercase letters, digits, "-", "_") or a path to a .json file`,
    };
  }
  return { kind: "store", name: arg, file: dashboardPath(arg) };
}

interface StoreConfig {
  default?: string;
}

function readConfig(): StoreConfig {
  try {
    const json = JSON.parse(readFileSync(configPath(), "utf8")) as unknown;
    return json && typeof json === "object" ? (json as StoreConfig) : {};
  } catch {
    return {};
  }
}

/** The configured default dashboard name, or null if unset/empty. */
export function getDefault(): string | null {
  const d = readConfig().default;
  return typeof d === "string" && d ? d : null;
}

/** Set the default dashboard name (merges into config.json, creating the home). */
export function setDefault(name: string): void {
  ensureHome();
  const cfg = readConfig();
  cfg.default = name;
  writeFileSync(configPath(), `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

export interface StoreEntry {
  name: string;
  file: string;
  /** The dashboard's `title`, read cheaply; null if the file is unreadable. */
  title: string | null;
  isDefault: boolean;
}

/** Every named dashboard in the store, sorted by name, default flagged. */
export function listDashboards(): StoreEntry[] {
  let names: string[];
  try {
    names = readdirSync(dashboardsDir())
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .filter(isValidName)
      .sort();
  } catch {
    return [];
  }
  const def = getDefault();
  return names.map((name) => {
    const file = dashboardPath(name);
    let title: string | null = null;
    try {
      const json = JSON.parse(readFileSync(file, "utf8")) as {
        title?: unknown;
      };
      if (typeof json.title === "string") title = json.title;
    } catch {
      /* leave title null — the file is unreadable/malformed */
    }
    return { name, file, title, isDefault: name === def };
  });
}

/**
 * Resolve the dashboard `serve` should host. With an explicit arg, classify it
 * and require the file to exist (with a store-aware hint when it doesn't).
 * Without an arg, resolve GLOBAL-DEFAULT-FIRST: the configured default wins,
 * then a cwd `./dashboard.json` (pre-store back-compat), then a sole store
 * entry, else a guidance error.
 */
export function resolveServeTarget(
  arg: string | undefined,
  cwd: string,
): ResolvedTarget | { error: string } {
  if (arg !== undefined) {
    const c = classifyTarget(arg, cwd);
    if ("error" in c) return c;
    if (!isFile(c.file)) {
      return {
        error:
          c.kind === "store"
            ? `no dashboard named "${c.name}" in the store (${dashboardsDir()})\n  create it with \`zframes init ${c.name}\`, or run \`zframes list\` to see what's there.`
            : `no dashboard.json at ${arg}\n  pass a path, a store name, or run from a directory that has one.`,
      };
    }
    return c;
  }

  // No arg — global-default-first.
  const def = getDefault();
  if (def) {
    const file = dashboardPath(def);
    if (isFile(file)) return { kind: "store", name: def, file };
    // The default points at a missing file — fall through rather than fail hard.
  }
  const cwdFile = join(cwd, "dashboard.json");
  if (isFile(cwdFile)) return { kind: "path", file: cwdFile };

  const entries = listDashboards();
  if (entries.length === 1) {
    return { kind: "store", name: entries[0].name, file: entries[0].file };
  }
  if (entries.length > 1) {
    return {
      error: `no default dashboard set, and ${entries.length} in the store — pass a name (\`zframes serve <name>\`), set a default (\`zframes use <name>\`), or list them (\`zframes list\`).`,
    };
  }
  return {
    error:
      "no dashboard found — create one with `zframes init <name>`, or pass a path to a dashboard.json.",
  };
}
