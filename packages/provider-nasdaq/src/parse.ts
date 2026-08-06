import type { FinancialStatementRow } from "@zframes/spec";

/**
 * Coercion helpers for api.nasdaq.com, which publishes almost every number as a
 * *display string* — `"$219.13"`, `"5,302,946,000,000"`, `"0.47%"`, `"-$187,000"`.
 * Each helper is pure and separately tested, because a silent slip in any of
 * them (a "--" read as 0, a percent read as a price, a thousands table read
 * literally) produces a plausible-looking wrong number with nothing else in the
 * app to contradict it.
 *
 * The one invariant every helper keeps: **an unreadable cell is `null`, never
 * `NaN` and never `0`.** Callers drop the optional field or emit `null`; nothing
 * downstream ever has to test for `NaN`.
 */

/**
 * Cells the exchange prints where there is no value. None of them mean zero —
 * `"--"` in a financial statement is "this line didn't print that year", which a
 * trend chart must draw as a gap.
 */
const BLANK_CELLS = new Set(["", "-", "--", "---", "n/a", "na", "nm"]);

/**
 * True when a cell carries no text at all.
 *
 * Deliberately narrower than {@link parseNumericCell} returning `null`: a
 * financials table distinguishes a **section header** (every value cell is the
 * empty string) from a **line item that didn't print** (`"--"`), and only the
 * former should be dropped. Conflating the two either loses real rows or emits
 * "Operating Expenses" as a data series of nulls.
 */
export function isEmptyCell(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  return typeof raw === "string" && raw.trim() === "";
}

/**
 * Read one published cell as a number, or `null` when it carries no value.
 *
 * One function covers money, percents and plain counts because upstream formats
 * them identically apart from the sigil — separate parsers would just be three
 * copies of the same strip-and-coerce, with three places for a fix to miss.
 * Handles: currency and thousands separators (`"$5,302,946,000,000"`), a
 * trailing percent (`"390.52638%"`), an explicit sign *outside* the currency
 * symbol (`"-$187,000"`, `"+3.43%"`), accounting-parenthesis negatives
 * (`"($1,234)"`), and already-numeric fields (the surprise table types `eps` as
 * a JSON number while its neighbours are strings).
 */
export function parseNumericCell(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (BLANK_CELLS.has(trimmed.toLowerCase())) return null;
  // Parentheses are the minus sign in published accounting tables; strip them but
  // remember the sign, or an outflow lands positive and a drawdown reads as growth.
  const parenthesised = /^\(.*\)$/.test(trimmed);
  const digits = trimmed.replace(/[()\s$,%+]/g, "");
  const value = Number(digits);
  if (digits === "" || !Number.isFinite(value)) return null;
  return parenthesised ? -Math.abs(value) : value;
}

/** Apply a unit scale while preserving the "no value" signal. */
export function scaleOrNull(
  value: number | null,
  factor: number,
): number | null {
  return value === null ? null : value * factor;
}

/** US `M/D/YYYY` → ISO `YYYY-MM-DD`; anything else (including "N/A") → undefined. */
export function parseUsDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return undefined;
  const [, month, day, year] = match;
  // Range-check rather than trusting the shape: Date would happily roll
  // "13/45/2026" forward into a real (wrong) date.
  if (Number(month) < 1 || Number(month) > 12) return undefined;
  if (Number(day) < 1 || Number(day) > 31) return undefined;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Open time for a daily bar dated `M/D/YYYY`, as UTC midnight — the same
 * convention provider-fred uses for daily official prints, so two daily series
 * on one chart share an x grid instead of sitting a few hours apart.
 */
export function dailyBarTime(raw: unknown): number | undefined {
  const iso = parseUsDate(raw);
  if (!iso) return undefined;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) ? time : undefined;
}

/**
 * Split a published high/low pair into its two ends.
 *
 * The two endpoints that carry one disagree about both separator and order —
 * the summary's `FiftTwoWeekHighLow` is `"$236.54/$164.07"` (high first, slash)
 * while the quote's `keyStats.fiftyTwoWeekHighLow` is `"164.07 - 236.54"` (low
 * first, dash). Rather than track which is which, assign by magnitude: the pair
 * is a range, so the larger end IS the high whatever order it arrived in.
 * A closed-session `"N/A"` yields undefined, so the caller omits the fields.
 */
export function parseHighLowPair(
  raw: unknown,
): { high: number; low: number } | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw.includes("/") ? raw.split("/") : raw.split(/\s+-\s+/);
  if (parts.length !== 2) return undefined;
  const first = parseNumericCell(parts[0]);
  const second = parseNumericCell(parts[1]);
  if (first === null || second === null) return undefined;
  return { high: Math.max(first, second), low: Math.min(first, second) };
}

/**
 * Pull the analyst count out of the ratings blurb ("Based on 39 analysts
 * offering recommendations for 'NVDA'."). The endpoint publishes no numeric
 * consensus and no count field — the sentence is the only place it exists.
 */
export function parseAnalystCount(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /\b([\d,]+)\s+analysts?\b/i.exec(raw);
  if (!match) return undefined;
  const count = parseNumericCell(match[1]);
  return count !== null && count > 0 ? count : undefined;
}

/** Calendar `time-*` slug → the spec's session wording; anything unrecognised is "unknown". */
export function earningsCalendarTime(
  raw: unknown,
): "pre-market" | "after-hours" | "unknown" {
  if (raw === "time-pre-market") return "pre-market";
  if (raw === "time-after-hours") return "after-hours";
  // "time-not-supplied" is the common third value, but the set isn't documented
  // and a new slug must not become a confident wrong answer.
  return "unknown";
}

/**
 * Bare US ticker for a requested symbol: strips a HIP-3 dex prefix
 * ("xyz:NVDA" → "NVDA") and normalises case, since this backend keys on the
 * exchange's own uppercase spelling.
 */
export function tickerOf(symbol: string): string {
  const colon = symbol.indexOf(":");
  return (colon === -1 ? symbol : symbol.slice(colon + 1)).trim().toUpperCase();
}

const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's date on the *exchange's* clock, ISO. Every date this backend takes or
 * returns is a US session date, so a viewer in Bangkok asking for "today" must
 * still get the New York session — a UTC or local day would ask for tomorrow's
 * (empty) calendar for a third of every day.
 */
export function easternDate(atMs: number = Date.now()): string {
  return EASTERN_DAY.format(atMs);
}

/** One financials table as published: a header row plus label-keyed value rows. */
export interface StatementTable {
  headers?: Record<string, string> | null;
  rows?: Record<string, string>[] | null;
}

/**
 * The `valueN` column keys of a financials table in period order, excluding
 * `value1` — which holds the row LABEL ("Period Ending:" in the header, "Total
 * Revenue" in a row), not a period. Sorted numerically rather than taken in
 * `Object.keys` order so a wider quarterly table can't come back with value10
 * ahead of value2.
 */
export function periodKeys(
  headers: Record<string, string> | null | undefined,
): string[] {
  return Object.keys(headers ?? {})
    .map((key) => /^value(\d+)$/.exec(key))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ key: match[0], index: Number(match[1]) }))
    .filter(({ index }) => index > 1)
    .sort((a, b) => a.index - b.index)
    .map(({ key }) => key);
}

/**
 * Parse one financials table into spec rows.
 *
 * `scale` is 1000 for the income/balance/cash-flow tables — their figures are
 * published in THOUSANDS, so NVDA's `"$215,938,000"` of revenue is $215.9bn —
 * and 1 for the ratios table, whose cells are already percents and multiples.
 *
 * Section headers are dropped. Upstream interleaves them as rows with the same
 * shape as data ("Operating Expenses", "Current Liabilities", "Liquidity
 * Ratios"), distinguishable only by their value cells being *empty strings*
 * where a line item that didn't print carries `"--"`. That distinction is the
 * whole rule: empty → structural, drop it; `"--"` → a real row with a real gap,
 * keep it as nulls.
 */
export function parseStatementTable(
  table: StatementTable | null | undefined,
  keys: string[],
  scale: number,
): FinancialStatementRow[] {
  const rows: FinancialStatementRow[] = [];
  for (const row of table?.rows ?? []) {
    const label = (row.value1 ?? "").trim();
    if (!label) continue;
    const cells = keys.map((key) => row[key]);
    if (cells.every(isEmptyCell)) continue;
    rows.push({
      label,
      values: cells.map((cell) => scaleOrNull(parseNumericCell(cell), scale)),
    });
  }
  return rows;
}
