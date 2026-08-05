/**
 * Minimal CSV row parsing for providers whose upstream publishes CSV rather than
 * JSON (FRED's fredgraph, Zillow's research files, the FHFA HPI datasets, the
 * OFR stress index).
 *
 * A plain `line.split(",")` is right only while no field contains a comma — and
 * it silently produces garbage the moment one does. Zillow's region names
 * (`"Austin, TX"`) and the FHFA's metro names (`"Abilene, TX"`) are quoted
 * precisely because they do, so a naive split shifts every column after them by
 * one and the values land under the wrong header.
 *
 * Deliberately NOT a full CSV library: this handles the subset the official
 * publishers actually emit — double-quoted fields, `""` as an escaped quote
 * inside one, and unquoted fields elsewhere. It parses a single row, so a caller
 * can stream a large file line by line instead of materialising a parsed table
 * (the FHFA metro dataset is ~4 MB, Zillow's ~4.4 MB).
 *
 * React-free on purpose (deep export `@zframes/data-primitives/csv`), like the
 * fetch and cache primitives beside it.
 */

/**
 * Split one CSV line into its fields, honouring double-quoted fields that may
 * contain commas, and `""` as a literal quote inside such a field. Surrounding
 * quotes are stripped; unquoted fields are returned verbatim (not trimmed —
 * leading spaces are meaningful in some published files, and callers that want
 * them gone can trim).
 *
 * An unterminated quote is tolerated rather than thrown: the rest of the line is
 * taken as the final field, because a truncated upstream row should cost one
 * row, not the whole download.
 */
export function splitCsvRow(line: string): string[] {
  // Fast path: with no quote anywhere in the row there are no quoting semantics
  // to honour, so the engine's own split does the whole job in one pass. Most
  // rows of the wide official tables (all-numeric months) take this branch.
  if (line.indexOf('"') === -1) return line.split(",");

  const fields: string[] = [];
  // The current field is `carried + line.slice(start, i)`: `start` marks the
  // beginning of the run that can still be taken as one slice, and `carried`
  // holds the earlier runs, non-empty only once a quote forced a break. Slicing
  // runs instead of appending characters is the whole point — a 4.4 MB file has
  // ~4.4M characters but only ~280k field boundaries.
  let carried = "";
  let start = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (quoted) {
      if (line.charCodeAt(i) !== 34 /* " */) continue;
      carried += line.slice(start, i);
      if (line[i + 1] === '"') {
        // `""` inside a quoted field is one escaped quote; a lone `"` ends it.
        carried += '"';
        i++;
      } else {
        quoted = false;
      }
      start = i + 1;
      continue;
    }
    const code = line.charCodeAt(i);
    if (code === 34 /* " */) {
      // A quote only opens a field at its start; mid-field it's literal data,
      // so it stays inside the pending slice.
      if (carried === "" && start === i) {
        quoted = true;
        start = i + 1;
      }
    } else if (code === 44 /* , */) {
      fields.push(carried + line.slice(start, i));
      carried = "";
      start = i + 1;
    }
  }
  fields.push(carried + line.slice(start));
  return fields;
}

/**
 * Split a CSV document into non-empty rows, each already field-split by
 * {@link splitCsvRow}. Handles CRLF and LF, and drops blank lines (published
 * files routinely end with one, which would otherwise parse as a single empty
 * field and reach callers as a row).
 *
 * Assumes no embedded newlines inside quoted fields — none of the official
 * datasets this serves contain them, and supporting them would require the
 * whole-document state machine this module deliberately isn't.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === "") continue;
    rows.push(splitCsvRow(line));
  }
  return rows;
}

/**
 * How long a chunked parse may hold the thread before yielding. A 60fps frame is
 * ~16ms, so a third of it leaves room for the render the yield exists to let
 * through. Lower would cost real time — each yield is a ~1ms timer hop, and the
 * ZHVI parse takes ~10 of them as it is.
 */
const YIELD_BUDGET_MS = 5;

/** Hand the event loop back so a pending render or input can run. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * {@link parseCsvRows}, but yielding to the event loop every few milliseconds so
 * a large document doesn't parse inside a single task.
 *
 * The output is identical — this exists purely for *when* the work happens.
 * Zillow's ZHVI table is ~895 rows × ~318 columns (~4.4 MB), enough that parsing
 * it synchronously drops frames on the poll that refreshes it; the small files
 * (FRED series, the FHFA state table) are fine either way and keep using the
 * sync entry point.
 */
export async function parseCsvRowsAsync(text: string): Promise<string[][]> {
  // The budget starts before the line split, because on a multi-megabyte
  // document that split is itself several milliseconds of unbroken work — start
  // the clock after it and the first chunk runs for split + budget.
  let deadline = Date.now() + YIELD_BUDGET_MS;
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") continue;
    rows.push(splitCsvRow(line));
    // Checked per row rather than per fixed chunk: row width varies enough
    // across the official files that a row count is a poor proxy for time.
    if (Date.now() >= deadline) {
      await yieldToEventLoop();
      deadline = Date.now() + YIELD_BUDGET_MS;
    }
  }
  return rows;
}
