// Pure image geometry for the /d/[id] og:image compositor — no DB, no Next, so
// the guard test can import it directly (the DB loader next door pulls in the
// postgres driver, which needs DATABASE_URL at import time).

// Height of the brand-watermark band scripts/capture-thumbs.ts appends below the
// grid in every capture. The og:image draws its own lockup, so it must exclude
// this band or a SHORT board shows the mark twice — tall boards only avoid it by
// accident of the top-anchored crop. Shared with the capture script so the two
// can't drift; changing it there without here silently double-marks short boards.
export const CAPTURE_WATERMARK_BAND = 52;

// The board region of a capture — the whole thing minus the watermark band. The
// og:image cover-fits against THIS, never the raw dimensions, so the band always
// lands below the card's bottom edge. Lives here (not inline in the route) so the
// guard test exercises the same code the route runs.
export function boardArea(dim: { width: number; height: number }) {
  return {
    width: dim.width,
    height: Math.max(1, dim.height - CAPTURE_WATERMARK_BAND),
  };
}

// Cover-fit a capture into a fixed card box. Satori has no reliable
// object-fit/object-position, so the compositor gets explicit pixel geometry
// instead: fill the box on both axes, centre horizontally, and anchor the crop
// to the TOP — captures run the board's full height, and the top rows are the
// ones a board leads with, so centring vertically would show a tall board's
// midriff.
export function coverFit(
  src: { width: number; height: number },
  box: { width: number; height: number },
) {
  const scale = Math.max(box.width / src.width, box.height / src.height);
  const width = Math.round(src.width * scale);
  const height = Math.round(src.height * scale);
  return { width, height, left: Math.round((box.width - width) / 2), top: 0 };
}

// Intrinsic pixel size, parsed from the file header. The compositor needs real
// dimensions to cover-fit the capture (boards vary from wide-and-short to very
// tall), and satori is happiest given explicit width/height rather than
// inferring them from a data URI. JPEG is what the capture writes; PNG is here
// so a future capture-format change doesn't silently fall back to the mini-map.
export function imageSize(
  buf: Buffer,
): { width: number; height: number } | null {
  // PNG: 8-byte signature, then the IHDR length/type, then w/h as BE uint32s.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;

  // JPEG: walk the marker chain to the start-of-frame, which carries the size.
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++; // resync — padding between segments is legal
      continue;
    }
    const marker = buf[off + 1];
    // Standalone markers (no length field): TEM, RSTn, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) return null;
    // SOF0..SOF15, minus the non-frame markers sharing that range (DHT, JPG, DAC).
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: buf.readUInt16BE(off + 5),
        width: buf.readUInt16BE(off + 7),
      };
    }
    off += 2 + len;
  }
  return null;
}
