// DashboardThumb — a stylized, static mini-map of a dashboard's layout.
//
// Every gallery card and the hero showcase draw an honest silhouette of the
// board they link to: the real 12-col frame positions, each frame reduced to a
// tiny generative glyph keyed to its kind (chart / list / gauge / tiles / …).
// Purely presentational and fully deterministic (glyph shapes are seeded off the
// frame id), so it's SSR-safe, hydration-stable, and needs no live data — it
// reads as "a real dashboard" without mounting 76 frames + hammering the APIs.

export type ThumbFrame = {
  id: string;
  frame: string;
  position: { x: number; y: number; w: number; h: number };
};

type Kind = "heading" | "chart" | "bars" | "list" | "tiles" | "gauge";

const ACCENTS = {
  brand: "#818cf8",
  violet: "#a78bfa",
  cyan: "#38bdf8",
  up: "#3fd08f",
  down: "#ff6b81",
  neutral: "#c7cbe0",
} as const;

// FNV-1a → seedable RNG. Deterministic per frame id, so the same board always
// draws the same glyphs (no server/client hydration drift).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kindOf(frame: string): Kind {
  const t = frame.toLowerCase();
  if (/head|title|divider|note|label|text/.test(t)) return "heading";
  if (/treemap|heatmap|cap|matrix|grid|dominance/.test(t)) return "tiles";
  if (
    /ticker|watch|list|table|movers|volume|book|news|feed|rank|calendar/.test(t)
  )
    return "list";
  if (
    /gauge|fear|greed|sentiment|ratio|meter|clock|countdown|stress|index/.test(
      t,
    )
  )
    return "gauge";
  if (/bar|short|flow|oi|open-interest|funding|depth|hashrate|fees/.test(t))
    return "bars";
  return "chart"; // price-chart, yield-curve, line, area, spark, and the default
}

function sparkPath(rnd: () => number, up: boolean): string {
  const n = 12;
  const pts: [number, number][] = [];
  let y = up ? 46 : 14;
  const drift = (up ? -1 : 1) * 2.4;
  for (let i = 0; i < n; i++) {
    y += drift + (rnd() - 0.5) * 16;
    y = Math.max(6, Math.min(52, y));
    pts.push([(i / (n - 1)) * 100, y]);
  }
  return pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}

function Glyph({
  kind,
  seed,
  color,
}: {
  kind: Kind;
  seed: number;
  color: string;
}) {
  const rnd = rng(seed);
  const common = {
    preserveAspectRatio: "none" as const,
    className: "h-full w-full",
  };

  if (kind === "heading") {
    return (
      <svg viewBox="0 0 100 30" {...common}>
        <rect
          x="6"
          y="8"
          width="42"
          height="7"
          rx="3.5"
          fill={ACCENTS.neutral}
          opacity="0.85"
        />
        <rect
          x="6"
          y="19"
          width="66"
          height="4"
          rx="2"
          fill="#ffffff"
          opacity="0.22"
        />
      </svg>
    );
  }

  if (kind === "chart") {
    const up = rnd() > 0.42;
    const stroke = up
      ? ACCENTS.up
      : color === ACCENTS.up
        ? ACCENTS.brand
        : color;
    const d = sparkPath(rnd, up);
    const gid = `g${seed.toString(36)}`;
    return (
      <svg viewBox="0 0 100 60" {...common}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L100 60 L0 60 Z`} fill={`url(#${gid})`} />
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === "bars") {
    const bars = Array.from({ length: 8 }, () => 14 + rnd() * 40);
    return (
      <svg viewBox="0 0 100 60" {...common}>
        {bars.map((h, i) => {
          const pos = rnd() > 0.5;
          return (
            <rect
              key={i}
              x={4 + i * 12}
              y={56 - h}
              width="7"
              height={h}
              rx="1.6"
              fill={pos ? ACCENTS.up : ACCENTS.down}
              opacity={0.55 + (i % 3) * 0.14}
            />
          );
        })}
      </svg>
    );
  }

  if (kind === "list") {
    const rows = 4;
    return (
      <svg viewBox="0 0 100 60" {...common}>
        {Array.from({ length: rows }, (_, i) => {
          const y = 8 + i * 13;
          const up = rnd() > 0.5;
          return (
            <g key={i}>
              <circle cx="8" cy={y + 3} r="3" fill={color} opacity="0.85" />
              <rect
                x="16"
                y={y}
                width={30 + rnd() * 22}
                height="4.5"
                rx="2.25"
                fill="#fff"
                opacity="0.32"
              />
              <rect
                x="82"
                y={y}
                width="12"
                height="4.5"
                rx="2.25"
                fill={up ? ACCENTS.up : ACCENTS.down}
                opacity="0.85"
              />
            </g>
          );
        })}
      </svg>
    );
  }

  if (kind === "tiles") {
    const tiles = [
      [4, 6, 40, 30],
      [48, 6, 22, 30],
      [74, 6, 22, 14],
      [74, 24, 22, 12],
      [4, 40, 26, 16],
      [34, 40, 26, 16],
      [64, 40, 32, 16],
    ];
    const cols = [
      ACCENTS.brand,
      ACCENTS.violet,
      ACCENTS.up,
      ACCENTS.cyan,
      ACCENTS.down,
    ];
    return (
      <svg viewBox="0 0 100 60" {...common}>
        {tiles.map((t, i) => (
          <rect
            key={i}
            x={t[0]}
            y={t[1]}
            width={t[2]}
            height={t[3]}
            rx="2.5"
            fill={cols[Math.floor(rnd() * cols.length)]}
            opacity={0.34 + (i % 3) * 0.16}
          />
        ))}
      </svg>
    );
  }

  // gauge — an arc dial (fear/greed, ratios, indices, clocks)
  const pct = 0.25 + rnd() * 0.6;
  const R = 26;
  const cx = 50;
  const cy = 46;
  const a0 = Math.PI;
  const a1 = Math.PI - Math.PI * pct;
  const track = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const value = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${(cx + R * Math.cos(a1)).toFixed(1)} ${(cy - R * Math.sin(a1)).toFixed(1)}`;
  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid"
      className="h-full w-full"
    >
      <path
        d={track}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.14"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d={value}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="3" fill={color} />
    </svg>
  );
}

export function DashboardThumb({
  frames,
  columns = 12,
  gap = 3,
  radius = 4,
  className = "",
}: {
  frames: ThumbFrame[];
  columns?: number;
  gap?: number;
  radius?: number;
  className?: string;
}) {
  const rows = Math.max(1, ...frames.map((f) => f.position.y + f.position.h));
  const accentKeys = [ACCENTS.brand, ACCENTS.violet, ACCENTS.cyan] as const;

  return (
    <div className={`relative h-full w-full ${className}`}>
      {frames.map((f) => {
        const kind = kindOf(f.frame);
        const seed = hash(f.id + f.frame);
        const color =
          kind === "heading"
            ? ACCENTS.neutral
            : kind === "gauge"
              ? ACCENTS.violet
              : accentKeys[seed % accentKeys.length];
        return (
          <div
            key={f.id}
            className="absolute"
            style={{
              left: `${(f.position.x / columns) * 100}%`,
              top: `${(f.position.y / rows) * 100}%`,
              width: `${(f.position.w / columns) * 100}%`,
              height: `${(f.position.h / rows) * 100}%`,
              padding: gap,
            }}
          >
            <div
              className="flex h-full w-full items-center justify-center overflow-hidden border border-white/10 bg-white/[0.035] px-1.5 py-1"
              style={{ borderRadius: radius }}
            >
              <Glyph kind={kind} seed={seed} color={color} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Deterministically synthesize a plausible board layout from a seed + a frame
// count. Used by community cards, whose API rows carry a count but not the spec
// positions — so they still show a real-looking mini-map instead of a blank box.
export function synthLayout(seed: string, count: number): ThumbFrame[] {
  const rnd = rng(hash(seed));
  const kinds = [
    "price-chart",
    "price-ticker",
    "fear-greed",
    "market-cap-treemap",
    "short-volume",
    "yield-curve",
  ];
  const out: ThumbFrame[] = [];
  const n = Math.max(1, Math.min(count || 3, 8));
  // Header band on top for boards with room.
  let y = 0;
  let idx = 0;
  if (n >= 4) {
    out.push({
      id: `${seed}-h`,
      frame: "heading",
      position: { x: 0, y: 0, w: 12, h: 1 },
    });
    y = 1;
  }
  let x = 0;
  while (idx < n) {
    const remaining = n - idx;
    const w = remaining <= 1 ? 12 - x : [3, 4, 6][Math.floor(rnd() * 3)];
    const ww = Math.min(w, 12 - x);
    const h = 2 + Math.floor(rnd() * 2);
    out.push({
      id: `${seed}-${idx}`,
      frame: kinds[Math.floor(rnd() * kinds.length)],
      position: { x, y, w: ww, h },
    });
    x += ww;
    idx++;
    if (x >= 12) {
      x = 0;
      y += 3;
    }
  }
  return out;
}
