import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadDashboardThumb } from "@/app/lib/dashboard-thumb";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";
import { boardArea, coverFit, imageSize } from "@/app/lib/thumb-image";

// Dynamic 1200×630 social-share card for /dashboard/<id>. next/og's ImageResponse is
// built in (no @vercel/og dep). Node runtime so it can resolve community
// dashboards through the Node-only postgres driver (same pattern as the sibling
// dashboard.json route). Rendered by satori — flexbox subset only, every
// multi-child element needs display:flex, inline styles only.
//
// The card shows THE SAME capture the gallery shows: the nightly screenshot of
// the live board (dashboard_thumbs, via /api/thumbs/<id>'s loader), composited
// full-bleed under a scrim carrying the title/tags/CTA. When no capture exists
// yet — a board published since the last cron, or a local dev DB — it falls back
// to the synthetic mini-map drawn from the spec's layout geometry.
export const runtime = "nodejs";
// The capture is refreshed nightly and a takedown must drop out of unfurls
// immediately, so this renders per request rather than being baked at build
// time by the page's generateStaticParams (which would freeze the curated ids'
// cards to whatever existed at build). Crawler traffic is negligible, and the
// response still carries an hour of CDN cache below.
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A live market dashboard on zframes";

// Accent palette inlined from DashboardThumb (kept self-contained — no import of
// the UI session's files).
const ACCENTS = ["#818cf8", "#a78bfa", "#38bdf8"];
const NEUTRAL = "#c7cbe0";

type Frame = {
  frame?: string;
  position?: { x: number; y: number; w: number; h: number };
};

function miniMap(frames: Frame[]) {
  const fs = frames.filter((f) => f.position).slice(0, 40);
  const rows = Math.max(1, ...fs.map((f) => f.position!.y + f.position!.h));
  return fs.map((f, i) => {
    const p = f.position!;
    const heading = f.frame === "heading" || f.frame === "divider";
    return {
      left: `${(p.x / 12) * 100}%`,
      top: `${(p.y / rows) * 100}%`,
      width: `${(p.w / 12) * 100}%`,
      height: `${(p.h / rows) * 100}%`,
      color: heading ? NEUTRAL : ACCENTS[i % ACCENTS.length],
      heading,
    };
  });
}

// The nightly capture as a satori-drawable layer: a data URI plus the explicit
// cover-fit geometry (satori has no reliable object-fit/object-position).
async function captureLayer(id: string) {
  try {
    const thumb = await loadDashboardThumb(id);
    if (!thumb) return null;
    const dim = imageSize(thumb.image);
    if (!dim || !dim.width || !dim.height) return null;

    // Fit against the BOARD area, not the raw capture: this card draws the
    // lockup itself, and including the capture's watermark band would put a
    // second mark on-canvas for any board short enough that its bottom shows.
    return {
      src: `data:${thumb.contentType};base64,${thumb.image.toString("base64")}`,
      ...coverFit(boardArea(dim), size),
    };
  } catch {
    // A capture is decoration, never a reason to 500 the unfurl — an
    // unreachable DB or an unparseable blob falls through to the mini-map.
    return null;
  }
}

// The OFFICIAL mark + wordmark, matching the site header (BrandMark.tsx) and
// every other rendered surface. The badge is the real raster icon, not a
// look-alike: this card used to hand-draw a plain letter "Z" with a gradient
// text fill, which is a different glyph from the mark's slash + Z pair. The
// mark is passed in as a data URI rather than inlined as SVG because satori
// doesn't resolve `<defs>` / `url(#id)` gradient references, and the mark is
// built from three of them.
function BrandLockup({ mark }: { mark: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <img src={mark} width={48} height={48} alt="" />
      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 700,
          color: "#ffffff",
        }}
      >
        zframes
      </div>
    </div>
  );
}

function Pills({ frameCount, tags }: { frameCount: number; tags: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.04)",
          padding: "6px 14px",
          fontSize: 18,
          color: "rgba(231,236,246,0.75)",
        }}
      >
        {frameCount} {frameCount === 1 ? "frame" : "frames"}
      </div>
      {tags.map((t) => (
        <div
          key={t}
          style={{
            display: "flex",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.03)",
            padding: "6px 12px",
            fontSize: 15,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "rgba(231,236,246,0.5)",
          }}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

function Cta() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          display: "flex",
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: "#3fd08f",
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: "rgba(231,236,246,0.5)",
        }}
      >
        npx skills add zentryhq/zframes
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [entry, capture] = await Promise.all([
    resolveDashboard(id),
    captureLayer(id),
  ]);
  // Node runtime: read the (static, non-variable) fonts + brand mark off disk.
  // fetch(new URL(..., import.meta.url)) doesn't work here — Next emits the
  // asset to a relative /_next/static/media URL fetch can't parse. All three are
  // covered by outputFileTracingIncludes in next.config; the mark is a copy of
  // docs/assets/zframes-icon-512.png, kept inside the app so tracing can reach it.
  const [regular, bold, markPng] = await Promise.all([
    readFile(join(process.cwd(), "assets", "DMSans-Regular.ttf")),
    readFile(join(process.cwd(), "assets", "DMSans-Bold.ttf")),
    readFile(join(process.cwd(), "assets", "zframes-icon-512.png")),
  ]);
  const mark = `data:image/png;base64,${markPng.toString("base64")}`;

  const title = entry?.title ?? "zframes";
  const frames = ((entry?.spec as { frames?: Frame[] })?.frames ??
    []) as Frame[];
  const tags = (entry?.tags ?? []).slice(0, 4);

  const fonts = [
    {
      name: "DM Sans",
      data: regular,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "DM Sans",
      data: bold,
      weight: 700 as const,
      style: "normal" as const,
    },
  ];
  // Crawlers refetch on their own cadence; an hour of shared cache keeps the
  // per-request render cheap without outliving the nightly capture.
  const headers = {
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  };

  // ── Real capture: the board itself is the card ──────────────────────────────
  if (capture) {
    return new ImageResponse(
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          color: "#e7ecf6",
          fontFamily: "DM Sans",
          backgroundColor: "#06060b",
        }}
      >
        <img
          src={capture.src}
          width={capture.width}
          height={capture.height}
          style={{
            position: "absolute",
            top: capture.top,
            left: capture.left,
          }}
          alt=""
        />
        {/* Two scrim bands rather than one full-height gradient: the text sits
            over near-solid backdrop at the top and bottom edges while the middle
            stays an untouched window onto the real board. A single soft gradient
            left the lockup fighting whatever card happened to be under it. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 190,
            // Solid past the lockup's baseline (y≈110) before it fades: boards
            // lead with their own heading frame, and a translucent band left it
            // ghosting through the brand mark.
            backgroundImage:
              "linear-gradient(180deg, rgba(6,6,11,1) 0%, rgba(6,6,11,0.99) 58%, rgba(6,6,11,0.45) 80%, rgba(6,6,11,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 230,
            left: 0,
            width: "100%",
            height: 400,
            backgroundImage:
              "linear-gradient(180deg, rgba(6,6,11,0) 0%, rgba(6,6,11,0.80) 40%, rgba(6,6,11,0.97) 68%, rgba(6,6,11,1) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            padding: 56,
            justifyContent: "space-between",
          }}
        >
          <BrandLockup mark={mark} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                fontSize: title.length > 28 ? 46 : 56,
                fontWeight: 700,
                lineHeight: 1.05,
                color: "#ffffff",
                maxWidth: 900,
              }}
            >
              {title}
            </div>
            <Pills frameCount={frames.length} tags={tags} />
            <Cta />
          </div>
        </div>
      </div>,
      { ...size, fonts, headers },
    );
  }

  // ── No capture yet: synthetic mini-map from the spec's layout geometry ──────
  const cells = miniMap(frames);
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 60,
        color: "#e7ecf6",
        fontFamily: "DM Sans",
        backgroundColor: "#06060b",
        backgroundImage:
          "radial-gradient(900px 520px at 12% -8%, rgba(89,84,255,0.28), transparent 62%), radial-gradient(820px 620px at 100% 0%, rgba(150,90,240,0.20), transparent 58%)",
      }}
    >
      <BrandLockup mark={mark} />

      {/* Body */}
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          gap: 52,
          paddingTop: 28,
        }}
      >
        {/* Left */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: title.length > 24 ? 54 : 66,
              fontWeight: 700,
              lineHeight: 1.05,
              color: "#ffffff",
              maxWidth: 560,
            }}
          >
            {title}
          </div>
          <Pills frameCount={frames.length} tags={tags} />
        </div>

        {/* Right — mini-map of the real layout */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 520,
            height: 300,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.08)",
            backgroundImage: "linear-gradient(160deg, #0a0a14, #08080f)",
            boxShadow: "0 30px 90px -40px rgba(124,92,255,0.7)",
          }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                position: "absolute",
                left: c.left,
                top: c.top,
                width: c.width,
                height: c.height,
                padding: 5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  borderRadius: 7,
                  backgroundColor: c.heading ? "transparent" : `${c.color}22`,
                  border: `1px solid ${
                    c.heading ? "transparent" : `${c.color}66`
                  }`,
                  borderBottom: `2px solid ${
                    c.heading ? `${NEUTRAL}66` : `${c.color}66`
                  }`,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer — the fork story */}
      <Cta />
    </div>,
    { ...size, fonts, headers },
  );
}
