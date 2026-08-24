import {
  BUILTIN_PLUGINS,
  resolveInstallation,
} from "@zframes/plugins/registry";
import type { ProviderPluginManifest } from "@zframes/spec/provider-plugin";
import { getProviders, setProviders } from "@zframes/store/store";

// Extracted from index.ts so it's importable without running the CLI (index.ts
// invokes main() + process.exit() at module load — same reason catalogue.ts and
// lint.ts exist).

export interface ProvidersResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

const USAGE =
  "usage: zframes providers [list | add <id> | remove <id>]\n" +
  `  known plugins: ${[...BUILTIN_PLUGINS.keys()].join(", ")}`;

/** One summary line per plugin, shared by `list` and the add/remove echoes. */
function summaryLine(manifest: ProviderPluginManifest): string {
  const traits = [
    `${manifest.capabilities.length} capabilities`,
    ...(manifest.synthetic ? ["synthetic"] : []),
    ...(manifest.requiresCredentials ? ["needs credentials"] : []),
  ];
  return `${manifest.id} — ${manifest.name} (${traits.join(", ")})${
    manifest.description ? `\n    ${manifest.description}` : ""
  }`;
}

/**
 * The install-time notice: what the operator is agreeing to by installing this
 * plugin, printed in full at the moment of the affirmative act. Hosts come
 * with their reasons (the relay grant is the consequential part — `(relay)`
 * marks the hosts the local proxy will be authorised to reach); terms come
 * from `termsUrl` when the plugin has one voice, else per-source, where each
 * credit's url is where its terms live.
 */
function installNotice(manifest: ProviderPluginManifest): string[] {
  const lines: string[] = [];
  if (manifest.hosts.length > 0) {
    lines.push("  contacts:");
    for (const host of manifest.hosts) {
      lines.push(
        `    ${host.host}${host.proxied ? " (relay)" : ""}${host.reason ? ` — ${host.reason}` : ""}`,
      );
    }
  } else {
    lines.push("  contacts: nothing — no network requests.");
  }
  if (manifest.termsUrl) {
    lines.push(`  terms: ${manifest.termsUrl}`);
  } else if (manifest.sources.length > 0) {
    lines.push(
      `  terms: per source — each upstream's own site governs its data:`,
    );
    for (const credit of manifest.sources) {
      lines.push(`    ${credit.name} — ${credit.url}`);
    }
  }
  return lines;
}

export function providers(args: string[]): ProvidersResult {
  const [action = "list", id] = args;

  if (action === "list") {
    const installed = resolveInstallation(getProviders());
    const lines: string[] = [];
    lines.push("installed (mount order — earlier wins capability routing):");
    if (installed.demoFallback) {
      lines.push(
        "  none — dashboards render on the built-in DEMO data (plainly simulated).",
      );
    } else {
      for (const manifest of installed.manifests)
        lines.push(`  ${summaryLine(manifest)}`);
    }
    if (installed.unknown.length > 0) {
      lines.push(`  ⚠ unknown ids in config: ${installed.unknown.join(", ")}`);
    }
    const mounted = new Set(installed.manifests.map((m) => m.id));
    const available = [...BUILTIN_PLUGINS.values()].filter(
      (m) => !mounted.has(m.id) || installed.demoFallback,
    );
    if (available.length > 0) {
      lines.push("");
      lines.push("available (`zframes providers add <id>`):");
      for (const manifest of available)
        lines.push(`  ${summaryLine(manifest)}`);
    }
    return { code: 0, stdout: lines.join("\n") };
  }

  if (action !== "add" && action !== "remove") {
    return { code: 1, stderr: `✗ unknown action "${action}"\n${USAGE}` };
  }
  if (!id) {
    return { code: 1, stderr: `✗ ${action} needs a plugin id\n${USAGE}` };
  }

  const current = getProviders() ?? [];

  if (action === "add") {
    const manifest = BUILTIN_PLUGINS.get(id);
    if (!manifest) {
      return {
        code: 1,
        stderr: `✗ no provider plugin named "${id}"\n${USAGE}`,
      };
    }
    if (current.includes(id)) {
      return { code: 0, stdout: `✓ "${id}" is already installed.` };
    }
    setProviders([...current, id]);
    const lines = [
      `✓ installed ${summaryLine(manifest)}`,
      ...installNotice(manifest),
    ];
    if (manifest.requiresCredentials) {
      lines.push(
        "  connect the credential from the dashboard once it's serving.",
      );
    }
    lines.push("  restart `zframes serve` to mount it.");
    return { code: 0, stdout: lines.join("\n") };
  }

  if (!current.includes(id)) {
    return { code: 1, stderr: `✗ "${id}" is not installed.` };
  }
  const next = current.filter((entry) => entry !== id);
  setProviders(next);
  const tail =
    next.length === 0
      ? " nothing else is installed, so dashboards fall back to the built-in DEMO data."
      : "";
  return {
    code: 0,
    stdout: `✓ removed "${id}" — restart \`zframes serve\` to apply.${tail}`,
  };
}
