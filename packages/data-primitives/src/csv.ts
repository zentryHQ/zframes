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
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        // `""` inside a quoted field is one escaped quote; a lone `"` ends it.
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      // A quote only opens a field at its start; mid-field it's literal data.
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
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
