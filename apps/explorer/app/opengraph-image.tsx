import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { INSTALL_COMMAND, SITE_NAME } from "@/app/lib/site";

/**
 * The site-wide 1200×630 share card.
 *
 * Until now only `/dashboard/<id>` had one, so every OTHER page — the homepage
 * included — unfurled in Slack, X, Discord and LinkedIn as a bare link with no
 * image. Sitting at `app/` makes this the inherited default for every route that
 * does not define its own, which is all of them except the board previews.
 *
 * Static, unlike the per-board card: nothing here depends on a row, so Next
 * renders it once at build time. It deliberately does NOT read the database —
 * that would put the single-connection dev PGlite socket in the build's path,
 * which is the trap `/dashboard/[id]` documents.
 *
 * satori constraints (same as the sibling board card): flexbox subset only,
 * every multi-child element needs `display: flex`, inline styles only.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} — free, open-source market terminals your AI agent builds`;

const INK = "#e7ecf6";
const MUTED = "rgba(231,236,246,0.62)";

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.13)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: "9px 18px",
        fontSize: 21,
        color: MUTED,
      }}
    >
      {children}
    </div>
  );
}

export default async function Image() {
  // Node runtime: the fonts and the brand mark are read off disk rather than
  // fetched. `fetch(new URL(..., import.meta.url))` does not work here — Next
  // emits the asset to a relative /_next/static/media URL fetch cannot parse.
  // The mark is a PNG, not inline SVG, because satori does not resolve `<defs>` /
  // `url(#id)` gradient references and the real mark is built from three.
  const [regular, bold, markPng] = await Promise.all([
    readFile(join(process.cwd(), "assets", "DMSans-Regular.ttf")),
    readFile(join(process.cwd(), "assets", "DMSans-Bold.ttf")),
    readFile(join(process.cwd(), "assets", "zframes-icon-512.png")),
  ]);
  const mark = `data:image/png;base64,${markPng.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 64,
        justifyContent: "space-between",
        color: INK,
        fontFamily: "DM Sans",
        backgroundColor: "#06060b",
        backgroundImage:
          "radial-gradient(900px 560px at 14% -10%, rgba(89,84,255,0.30), transparent 62%), radial-gradient(820px 640px at 102% 4%, rgba(150,90,240,0.22), transparent 58%)",
      }}
    >
      {/* Lockup — the same mark + wordmark as the site header and the board
            card, so the three surfaces read as one brand. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <img src={mark} width={52} height={52} alt="" />
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          {SITE_NAME}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.06,
            color: "#ffffff",
            maxWidth: 940,
          }}
        >
          <div style={{ display: "flex" }}>Describe your dashboard.</div>
          <div style={{ display: "flex", color: "#b8b4ff" }}>
            An agent builds it.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 26,
            lineHeight: 1.4,
            color: MUTED,
            maxWidth: 880,
          }}
        >
          Live market terminals for stocks and crypto — built by your AI coding
          agent from one dashboard.json you own.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pill>Free &amp; open source</Pill>
          <Pill>MIT</Pill>
          <Pill>No API keys</Pill>
          <Pill>No account</Pill>
        </div>
      </div>

      {/* The actual entry point, verbatim — the one thing a reader can act on
            straight off the card. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            display: "flex",
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: "#3fd08f",
          }}
        />
        <div style={{ display: "flex", fontSize: 23, color: MUTED }}>
          {INSTALL_COMMAND}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "DM Sans", data: regular, weight: 400, style: "normal" },
        { name: "DM Sans", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
