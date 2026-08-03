import { describe, expect, it } from "vitest";
import {
  boardArea,
  CAPTURE_WATERMARK_BAND,
  coverFit,
  imageSize,
} from "./thumb-image";

// Guards the two pure halves of the /d/[id] og:image compositor. Both fail
// SILENTLY if they drift — an unparseable header or a bad fit just falls the
// share card back to the synthetic mini-map (or letterboxes the capture), which
// looks like "no capture yet" rather than a bug. Nothing else would catch it
// short of eyeballing an unfurl.

const OG = { width: 1200, height: 630 };

// Minimal-but-valid headers: the parsers only ever read as far as the size.
function png(width: number, height: number) {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0); // signature (first half)
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

// SOI, then a JFIF APP0 the walker must SKIP by its length, then SOF0.
function jpeg(width: number, height: number, sofMarker = 0xc0) {
  const app0 = Buffer.alloc(2 + 16);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2); // segment length, excluding the marker
  const sof = Buffer.alloc(2 + 11);
  sof.writeUInt16BE(0xff00 | sofMarker, 0);
  sof.writeUInt16BE(11, 2);
  sof.writeUInt8(8, 4); // sample precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

describe("imageSize", () => {
  it("reads JPEG dimensions past a preceding segment", () => {
    // Height BEFORE width in a SOF — the field order is the easy thing to swap.
    expect(imageSize(jpeg(1392, 2480))).toEqual({ width: 1392, height: 2480 });
  });

  it("reads progressive JPEGs (SOF2), which the capture may emit", () => {
    expect(imageSize(jpeg(1392, 900, 0xc2))).toEqual({
      width: 1392,
      height: 900,
    });
  });

  it("does not mistake a Huffman table (DHT) in the SOF range for a frame", () => {
    const dht = Buffer.alloc(2 + 20);
    dht.writeUInt16BE(0xffc4, 0); // 0xc4 sits inside 0xc0..0xcf
    dht.writeUInt16BE(20, 2);
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      dht,
      jpeg(800, 600).subarray(2),
    ]);
    expect(imageSize(buf)).toEqual({ width: 800, height: 600 });
  });

  it("reads PNG dimensions", () => {
    expect(imageSize(png(1200, 4000))).toEqual({ width: 1200, height: 4000 });
  });

  it("returns null for a non-image blob rather than throwing", () => {
    expect(imageSize(Buffer.from("not an image at all"))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    // A truncated JPEG: valid SOI, but the frame header never arrives.
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBeNull();
  });
});

describe("coverFit", () => {
  it("anchors a tall board to the top, so the crop keeps its first rows", () => {
    const fit = coverFit({ width: 1392, height: 4000 }, OG);
    expect(fit.top).toBe(0);
    expect(fit.width).toBe(1200); // width is the binding axis
    expect(fit.height).toBeGreaterThan(OG.height);
    expect(fit.left).toBe(0);
  });

  it("fills the box on both axes for a wide, short board", () => {
    const fit = coverFit({ width: 1440, height: 500 }, OG);
    expect(fit.height).toBe(OG.height); // height binds — no letterbox
    expect(fit.width).toBeGreaterThanOrEqual(OG.width);
    expect(fit.left).toBeLessThanOrEqual(0); // overflow centred, not clipped left
    expect(fit.left * 2 + fit.width).toBeGreaterThanOrEqual(OG.width);
  });

  // The og:image draws its own lockup, so the capture's watermark band must land
  // BELOW the 630px canvas. Tall boards get that for free from the top-anchored
  // crop; a short, wide board does not — it's the case that would silently show
  // the mark twice, so it's the case pinned here.
  // Asserted as an invariant, not a snapshot: the band has to be tall enough to
  // actually hold the 26px watermark badge plus breathing room. Without this the
  // test below passes trivially when the band drifts to 0 — which would put the
  // watermark on top of the last row of cards.
  it("reserves a band big enough for the watermark it holds", () => {
    expect(CAPTURE_WATERMARK_BAND).toBeGreaterThanOrEqual(40);
    expect(boardArea({ width: 1280, height: 1000 }).height).toBe(
      1000 - CAPTURE_WATERMARK_BAND,
    );
  });

  it("keeps the capture's watermark band off-canvas, even for a short board", () => {
    for (const src of [
      { width: 1280, height: 400 + CAPTURE_WATERMARK_BAND }, // wider than 1.9:1
      { width: 1280, height: 660 + CAPTURE_WATERMARK_BAND },
      { width: 1280, height: 1440 + CAPTURE_WATERMARK_BAND },
    ]) {
      const board = boardArea(src); // the exact call the og:image route makes
      const fit = coverFit(board, { width: 1200, height: 630 });
      // Where the band starts once the whole capture is drawn at the fit scale.
      const scale = fit.width / src.width;
      const bandTop = board.height * scale;
      expect(bandTop).toBeGreaterThanOrEqual(630);
    }
  });

  it("never leaves a gap, whatever the aspect ratio", () => {
    for (const src of [
      { width: 1392, height: 300 },
      { width: 1392, height: 783 }, // ≈ the 1200×630 aspect itself
      { width: 1392, height: 6000 },
      { width: 400, height: 4000 },
    ]) {
      const fit = coverFit(src, OG);
      expect(fit.width).toBeGreaterThanOrEqual(OG.width);
      expect(fit.height).toBeGreaterThanOrEqual(OG.height);
    }
  });
});
