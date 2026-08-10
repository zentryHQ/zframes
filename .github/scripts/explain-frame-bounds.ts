/**
 * Prints the probe matrix for one or more frames as a fault grid — which span
 * failed which check — so a derived bound can be traced back to the measurement
 * that produced it.
 *
 *   EXPLAIN=countdown,market-hours pnpm tsx .github/scripts/explain-frame-bounds.ts
 */
import { readFileSync } from "node:fs";

const probeFile = process.env.PROBE_IN ?? "frame-size-probe.json";
const boundsFile = process.env.BOUNDS_IN ?? "frame-size-bounds.json";
const only = (process.env.EXPLAIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const probe = JSON.parse(readFileSync(probeFile, "utf8")) as {
  maxW: number;
  maxH: number;
  results: { frame: string; cells: Record<string, number | boolean>[] }[];
};
const bounds = JSON.parse(readFileSync(boundsFile, "utf8")) as {
  rows: {
    frame: string;
    current: Record<string, number>;
    derived: Record<string, number | null>;
    evidence: Record<string, unknown>;
    flags: string[];
  }[];
};
const boundBy = new Map(bounds.rows.map((r) => [r.frame, r]));

for (const result of probe.results) {
  if (only.length && !only.includes(result.frame)) continue;
  const b = boundBy.get(result.frame);
  console.log(`\n=== ${result.frame}`);
  if (b) {
    console.log(
      `    current ${JSON.stringify(b.current)}  ->  derived ${JSON.stringify(
        b.derived,
      )}`,
    );
    console.log(`    flags: ${b.flags.join(", ") || "-"}`);
    console.log(`    evidence: ${JSON.stringify(b.evidence)}`);
  }
  const at = new Map<string, Record<string, number | boolean>>();
  for (const c of result.cells) at.set(`${c.w}x${c.h}`, c);
  const keys = [
    "clipY",
    "clipX",
    "ell",
    "chartW",
    "chartH",
    "rows",
    "inkN",
    "inkW",
    "inkH",
  ];
  for (const key of keys) {
    const header = Array.from({ length: probe.maxW }, (_, i) =>
      String(i + 1).padStart(6),
    ).join("");
    console.log(`  ${key}      w:${header}`);
    for (let h = 1; h <= probe.maxH; h++) {
      const row = Array.from({ length: probe.maxW }, (_, i) => {
        const c = at.get(`${i + 1}x${h}`);
        const v = c ? c[key] : undefined;
        return String(
          typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
        ).padStart(6);
      }).join("");
      console.log(`     h=${h}          ${row}`);
    }
  }
}
