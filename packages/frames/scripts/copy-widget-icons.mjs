// Frame palette icons. The editor palette renders each frame's icon as
// <img src="/widget-icons/<name>.png"> — a root-absolute URL owned by
// packages/frames (see the widgetIcon() helper in ../src/schemas.ts). Every app that
// mounts the @zframes/editor palette (runtime, explorer) must serve those PNGs from
// its own static root, so each vendors them from this package on predev/prebuild
// rather than committing a per-app copy (no drift, no git bloat, no app→app reach).
//
// Usage: node <path>/copy-widget-icons.mjs <dest-dir>   (dest resolved from cwd)
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../widget-icons");
const dest = resolve(process.cwd(), process.argv[2] ?? "public/widget-icons");

if (!existsSync(src)) {
  console.error(`widget-icons source missing: ${src}`);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });
console.log(`copied widget-icons → ${dest}`);
