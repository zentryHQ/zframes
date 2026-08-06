/**
 * OCC-21 contract-symbol parsing.
 *
 * Cboe's chain rows carry expiry, strike and side NOWHERE except inside the
 * `option` id, so every row has to be parsed before it means anything.
 *
 * The format is `<ROOT><YY><MM><DD><C|P><strike × 1000, 8 digits>`:
 *
 *     NVDA260805C00110000
 *     ^^^^                root      NVDA
 *         ^^^^^^          expiry    2026-08-05
 *               ^         side      call
 *                ^^^^^^^^ strike    00110000 / 1000 = $110.00
 *
 * **Parse from the RIGHT.** The 15 trailing characters are fixed-width; the
 * root is not — it runs 1–6 characters (`F`, `NVDA`, `GOOGL`) and may contain
 * digits on adjusted/non-standard series. A left-to-right parse that assumes a
 * four-letter root reads Ford's date field out of its strike and silently
 * yields a plausible-looking wrong contract, which is worse than an error.
 */

/** One parsed contract id — the three fields the row itself omits, plus the root. */
export interface ParsedOccSymbol {
  /** Underlying root as written in the id (`NVDA`, `F`, or an adjusted-series root like `NVDA1`). */
  root: string;
  /** Expiry as an ISO date, e.g. "2026-08-05". */
  expiry: string;
  side: "call" | "put";
  /** Strike in dollars — the 8-digit field is in thousandths, so $110.50 encodes as `00110500`. */
  strike: number;
}

/** Fixed-width tail: 6 date digits + 1 side letter + 8 strike digits. */
const TAIL_LENGTH = 15;

/**
 * Parse an OCC-21 id, or return `null` when it isn't one.
 *
 * Returns null rather than throwing: a single malformed row in a 3,900-row
 * chain should cost that row, not the card. Callers skip a null.
 */
export function parseOccSymbol(id: string): ParsedOccSymbol | null {
  if (typeof id !== "string") return null;
  const symbol = id.trim().toUpperCase();
  // A root of at least one character has to precede the fixed tail.
  if (symbol.length < TAIL_LENGTH + 1) return null;

  const root = symbol.slice(0, symbol.length - TAIL_LENGTH);
  const date = symbol.slice(-TAIL_LENGTH, -9);
  const side = symbol.slice(-9, -8);
  const strikeField = symbol.slice(-8);

  if (!/^[A-Z0-9.]+$/.test(root)) return null;
  if (!/^\d{6}$/.test(date)) return null;
  if (side !== "C" && side !== "P") return null;
  if (!/^\d{8}$/.test(strikeField)) return null;

  const year = 2000 + Number(date.slice(0, 2));
  const month = Number(date.slice(2, 4));
  const day = Number(date.slice(4, 6));
  // Round-trip through UTC so an impossible date (`260231`) is rejected instead
  // of rolling forward into March — a rolled date sorts into the wrong expiry.
  const at = new Date(Date.UTC(year, month - 1, day));
  if (
    at.getUTCFullYear() !== year ||
    at.getUTCMonth() !== month - 1 ||
    at.getUTCDate() !== day
  )
    return null;

  const strike = Number(strikeField) / 1000;
  if (!(strike > 0)) return null;

  return {
    root,
    expiry: at.toISOString().slice(0, 10),
    side: side === "C" ? "call" : "put",
    strike,
  };
}
