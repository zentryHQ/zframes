import { existsSync } from "node:fs";
import {
  dashboardPath,
  dashboardsDir,
  isValidName,
  listDashboards,
  setDefault,
} from "@zframes/store/store";

/** `zframes list` — show the named dashboards in the global store, default flagged. */
export function list(): number {
  const entries = listDashboards();
  if (entries.length === 0) {
    console.log(`no dashboards in your store yet (${dashboardsDir()})`);
    console.log("  create one: npx --yes zframes@latest init <name>");
    return 0;
  }
  console.log(`dashboards in ${dashboardsDir()}:`);
  for (const e of entries) {
    const mark = e.isDefault ? "*" : " ";
    const title = e.title ? `  — ${e.title}` : "";
    console.log(`  ${mark} ${e.name}${title}`);
  }
  if (entries.some((e) => e.isDefault)) {
    console.log(
      "\n  * = default (served when you run `zframes serve` with no name)",
    );
  } else {
    console.log("\n  no default set — `zframes use <name>` to pick one.");
  }
  return 0;
}

/** `zframes use <name>` — set the default store dashboard. */
export function use(args: string[]): number {
  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    console.error("usage: zframes use <name>");
    return 1;
  }
  if (!isValidName(name)) {
    console.error(
      `✗ "${name}" is not a valid dashboard name (lowercase letters, digits, "-", "_")`,
    );
    return 1;
  }
  if (!existsSync(dashboardPath(name))) {
    console.error(
      `✗ no dashboard named "${name}" in your store (${dashboardsDir()})`,
    );
    console.error(
      `  create it with \`zframes init ${name}\`, or run \`zframes list\` to see what's there.`,
    );
    return 1;
  }
  setDefault(name);
  console.log(`✓ default dashboard is now "${name}"`);
  return 0;
}
