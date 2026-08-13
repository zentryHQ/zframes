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
 * The chunked fallback for {@link parseCsvRowsAsync}: parse on the calling
 * thread, but yield to the event loop every few milliseconds so a large
 * document doesn't parse inside a single task. Exported for tests; callers use
 * {@link parseCsvRowsAsync}, which prefers the worker.
 */
export async function parseCsvRowsChunked(text: string): Promise<string[][]> {
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

// ── Worker offload ───────────────────────────────────────────────────────────
// The big official files (Zillow ~4.4 MB, FHFA metro ~4 MB) cost tens of
// milliseconds of pure parsing; the chunked fallback above only decides WHEN
// that cost lands, a worker removes it from the main thread entirely (what
// remains is the native structured-clone receive of the parsed rows, far
// cheaper than the parse). The worker is built from a Blob URL whose source
// embeds `splitCsvRow.toString()` — one implementation, no bundler asset
// wiring, works identically under Vite, Next/Turbopack and the tsup CLI.

/** The worker's whole script. Exported so tests can eval + round-trip it. */
export function csvWorkerSource(): string {
  return `"use strict";
const splitCsvRow = ${splitCsvRow.toString()};
self.onmessage = (e) => {
  const { id, text } = e.data;
  try {
    const rows = [];
    for (const line of text.split(/\\r?\\n/)) {
      if (line === "") continue;
      rows.push(splitCsvRow(line));
    }
    self.postMessage({ id, rows });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};`;
}

type PendingParse = {
  resolve: (rows: string[][]) => void;
  reject: (error: unknown) => void;
  /** Kept so a worker failure can re-parse on the fallback path. */
  text: string;
};

/** Terminate an idle worker after this long — frees its heap between polls
 * (the files behind this re-fetch on multi-hour TTLs). */
const WORKER_IDLE_MS = 30_000;

let csvWorker: Worker | null = null;
let csvWorkerUrl: string | null = null;
/** Set on any construction/runtime failure: this environment gets the chunked
 * fallback from then on rather than retrying a broken worker per call. */
let workerFailed = false;
let nextParseId = 0;
const pendingParses = new Map<number, PendingParse>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleWorkerShutdown(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (pendingParses.size > 0) return;
    csvWorker?.terminate();
    csvWorker = null;
    if (csvWorkerUrl) URL.revokeObjectURL(csvWorkerUrl);
    csvWorkerUrl = null;
  }, WORKER_IDLE_MS);
}

/** Fail the worker permanently and settle every in-flight parse via the
 * chunked fallback — a worker crash must cost latency, never a result. */
function failWorker(): void {
  workerFailed = true;
  csvWorker?.terminate();
  csvWorker = null;
  if (csvWorkerUrl) URL.revokeObjectURL(csvWorkerUrl);
  csvWorkerUrl = null;
  const inFlight = [...pendingParses.values()];
  pendingParses.clear();
  for (const entry of inFlight)
    parseCsvRowsChunked(entry.text).then(entry.resolve, entry.reject);
}

function getCsvWorker(): Worker | null {
  if (workerFailed) return null;
  if (csvWorker) return csvWorker;
  if (
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  )
    return null;
  try {
    const url = URL.createObjectURL(
      new Blob([csvWorkerSource()], { type: "text/javascript" }),
    );
    const worker = new Worker(url);
    worker.onmessage = (e: MessageEvent) => {
      const { id, rows, error } = e.data as {
        id: number;
        rows?: string[][];
        error?: string;
      };
      const entry = pendingParses.get(id);
      if (!entry) return;
      pendingParses.delete(id);
      if (rows) entry.resolve(rows);
      // A per-message error is near-impossible (the parser throws on nothing);
      // fall back rather than reject so the caller still gets its table.
      else if (error)
        parseCsvRowsChunked(entry.text).then(entry.resolve, entry.reject);
      if (pendingParses.size === 0) scheduleWorkerShutdown();
    };
    worker.onerror = failWorker;
    csvWorker = worker;
    csvWorkerUrl = url;
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/**
 * {@link parseCsvRows}, off the calling thread. In a browser the parse runs in
 * a shared Web Worker (created on first use, torn down after 30 s idle); where
 * workers don't exist (Node, tests, SSR) or ever fail, it degrades to
 * {@link parseCsvRowsChunked}, which yields to the event loop instead.
 *
 * The output is identical to the sync entry — these exist purely for *where*
 * and *when* the work happens. Zillow's ZHVI table is ~895 rows × ~318 columns
 * (~4.4 MB) and the FHFA metro file is ~4 MB, enough that parsing them on the
 * main thread drops frames; the small files (FRED series, the OFR index) are
 * fine either way and keep using the sync entry point.
 */
export function parseCsvRowsAsync(text: string): Promise<string[][]> {
  const worker = getCsvWorker();
  if (!worker) return parseCsvRowsChunked(text);
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  const id = nextParseId++;
  return new Promise<string[][]>((resolve, reject) => {
    pendingParses.set(id, { resolve, reject, text });
    worker.postMessage({ id, text });
  });
}
