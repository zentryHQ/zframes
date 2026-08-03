import { describe, expect, it } from "vitest";
import { parseCsvRows, splitCsvRow } from "./csv";

// What this file pins, and why it matters:
//
// The whole reason this primitive exists is that `line.split(",")` is silently
// wrong on the official files: Zillow's `"Austin, TX"` and the FHFA's
// `"Abilene, TX"` are quoted precisely because the region name contains a comma.
// A naive split shifts every later column by one, so a metro's *size rank* lands
// where the parser expects its home value — a plausible-looking number in the
// wrong place, which no amount of eyeballing the card would catch.
//
// So the cases below pin: quoted commas, escaped `""` quotes, the fact that a
// quote only opens a field at its START (a mid-field quote is data, e.g. a 5' 9"
// measurement), tolerance of an unterminated quote (one bad row must not throw
// away a 4 MB download), empty fields at every position, and CRLF + trailing
// blank-line handling for `parseCsvRows`.

describe("splitCsvRow", () => {
  it("splits a plain row", () => {
    expect(splitCsvRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a comma inside a quoted field — the case a naive split gets wrong", () => {
    expect(splitCsvRow('"Austin, TX",12420,2026,1,502.80')).toEqual([
      "Austin, TX",
      "12420",
      "2026",
      "1",
      "502.80",
    ]);
  });

  it("strips the surrounding quotes but not inner characters", () => {
    expect(
      splitCsvRow('"New York-Jersey City-White Plains, NY-NJ (MSAD)",1'),
    ).toEqual(["New York-Jersey City-White Plains, NY-NJ (MSAD)", "1"]);
  });

  it('reads "" inside a quoted field as one literal quote', () => {
    expect(splitCsvRow('"say ""hi"", now",2')).toEqual(['say "hi", now', "2"]);
  });

  it("treats a quote that is not at the field start as data", () => {
    // A height like `5' 9"` must survive verbatim; only a LEADING quote opens a
    // quoted field, so this row has no quoting semantics at all.
    expect(splitCsvRow("5' 9\",b")).toEqual(["5' 9\"", "b"]);
  });

  it("tolerates an unterminated quote by taking the rest of the line", () => {
    // A truncated upstream row should cost that row, not the whole file.
    expect(splitCsvRow('"Austin, TX,12420')).toEqual(["Austin, TX,12420"]);
  });

  it("preserves empty fields at the start, middle and end", () => {
    expect(splitCsvRow(",a,,b,")).toEqual(["", "a", "", "b", ""]);
  });

  it("returns one empty field for an empty line", () => {
    expect(splitCsvRow("")).toEqual([""]);
  });

  it("does not trim — leading spaces can be meaningful in a published file", () => {
    expect(splitCsvRow("a, b ,c")).toEqual(["a", " b ", "c"]);
  });

  it("handles a quoted field that is itself empty", () => {
    expect(splitCsvRow('a,"",c')).toEqual(["a", "", "c"]);
  });
});

describe("parseCsvRows", () => {
  it("splits LF and CRLF documents identically", () => {
    expect(parseCsvRows("a,b\n1,2")).toEqual(parseCsvRows("a,b\r\n1,2"));
    expect(parseCsvRows("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops blank lines, including the trailing newline every file ends with", () => {
    // Without this the final "row" would be a single empty field and reach the
    // caller as real data.
    expect(parseCsvRows("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns no rows for an empty document", () => {
    expect(parseCsvRows("")).toEqual([]);
  });

  it("applies quote handling per row", () => {
    expect(parseCsvRows('name,v\n"Dallas, TX",4')).toEqual([
      ["name", "v"],
      ["Dallas, TX", "4"],
    ]);
  });
});
