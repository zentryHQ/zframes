import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { resolveDashboard } from "@/app/lib/resolve-dashboard";

// Dynamic 1200×630 social-share card for /d/<id>. next/og's ImageResponse is
// built in (no @vercel/og dep). Node runtime so it can resolve community
// dashboards through the Node-only postgres driver (same pattern as the sibling
// dashboard.json route). Rendered by satori — flexbox subset only, every
// multi-child element needs display:flex, inline styles only.
export const runtime = "nodejs";
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

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await resolveDashboard(id);
  // Node runtime: read the (static, non-variable) fonts off disk. fetch(new URL(
  // ..., import.meta.url)) doesn't work here — Next emits the asset to a relative
  // /_next/static/media URL fetch can't parse. Prod is covered by
  // outputFileTracingIncludes in next.config.
  const [regular, bold] = await Promise.all([
    readFile(join(process.cwd(), "assets", "DMSans-Regular.ttf")),
    readFile(join(process.cwd(), "assets", "DMSans-Bold.ttf")),
  ]);

  const title = entry?.title ?? "zframes";
  const frames = ((entry?.spec as { frames?: Frame[] })?.frames ?? []) as Frame[];
  const tags = (entry?.tags ?? []).slice(0, 4);
  const cells = miniMap(frames);

  return new ImageResponse(
    (
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
        {/* Brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 48,
              height: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: "linear-gradient(180deg, #15151E, #0A0A11)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                backgroundImage: "linear-gradient(135deg, #5C8CFF, #A974FF)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Z
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
            <span style={{ color: "#ffffff" }}>zframes</span>
            <span style={{ color: "#818cf8" }}>.explorer</span>
          </div>
        </div>

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
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
                {frames.length} {frames.length === 1 ? "frame" : "frames"}
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
                    border: `1px solid ${c.heading ? "transparent" : `${c.color}66`}`,
                    borderBottom: `2px solid ${c.heading ? `${NEUTRAL}66` : `${c.color}66`}`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer — the fork story */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: "#34d399",
            }}
          />
          <div style={{ display: "flex", fontSize: 20, color: "rgba(231,236,246,0.5)" }}>
            npx skills add zentryhq/zframes
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "DM Sans", data: regular, weight: 400, style: "normal" },
        { name: "DM Sans", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
