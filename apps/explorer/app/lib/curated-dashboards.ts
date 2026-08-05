import { BACKGROUND_SCENES } from "@zframes/spec";

// Curated dashboards for the gallery (Phase 2). Plain data — imported by both the
// server gallery page and the client preview. Built only from frame types verified
// to render cleanly. Each spec is a minimal-but-complete envelope; DashboardSpecSchema
// fills grid/theme/typography/appearance/background defaults on parse.
//
// NOTE: this static set is the Phase-2 stand-in for what becomes the Neon-backed
// store in Phase 3 (each entry → a `dashboards` row with a jsonb spec).

type Frame = {
  id: string;
  frame: string;
  title?: string;
  position: { x: number; y: number; w: number; h: number };
  config?: Record<string, unknown>;
  /**
   * Frames nested inside this one — only meaningful when `frame` is a container
   * (`group`). Each child's `position` is in the GROUP's own `columns` × `rows`
   * units, not the board's 12, so the cluster fills the group's slot and moves
   * as one card. Groups don't nest, hence `ChildFrame` rather than `Frame`.
   */
  children?: ChildFrame[];
};

type ChildFrame = Omit<Frame, "children">;

/**
 * A container frame holding a cluster that reads as one object — a row of
 * valuation ratios, a set of desk tools, a chart over its own numbers. Used on
 * the boards where cards genuinely belong together; the chart-heavy boards are
 * deliberately left flat, since grouping a full-width chart only shrinks it.
 *
 * `columns`/`rows` are the INNER grid; `w`/`h` is the group's own board
 * footprint, so keeping `w`/`h` equal to the bounding box of the cards it
 * replaces (and `columns`/`rows` equal to how they were arranged) leaves the
 * board looking the same while making the cluster a single draggable unit.
 */
function group(
  id: string,
  position: Frame["position"],
  inner: { columns: number; rows: number; gap?: number; panel?: boolean },
  children: ChildFrame[],
  title?: string,
): Frame {
  return {
    id,
    frame: "group",
    ...(title ? { title } : {}),
    position,
    config: { gap: 8, ...inner },
    children,
  };
}

/** A child of a {@link group}, positioned in that group's inner units. */
function kid(
  id: string,
  frame: string,
  position: Frame["position"],
  config?: Record<string, unknown>,
  title?: string,
): ChildFrame {
  return {
    id,
    frame,
    ...(title ? { title } : {}),
    position,
    ...(config ? { config } : {}),
  };
}

// A per-board cosmetic identity — colour + type + card surface. Mirrors the
// THEME_PRESETS in @zframes/spec (kept inline as plain data so this file stays
// React/Node-free). Each showcase board gets a DISTINCT look so the landing reads
// as three different terminals, not three clones — the `--zf-*` vars the embedded
// DashboardRenderer paints from differ per board.
type Cosmetics = {
  theme?: {
    accentHue: number;
    accentSat: number;
    baseHue: number;
    baseSat: number;
  };
  typography?: {
    fontFamily: "sans" | "mono" | "serif";
    numericStyle: "proportional" | "tabular";
  };
  appearance?: {
    radius: number;
    borderStrength: number;
    surfaceOpacity: number;
    density: number;
    elevation: number;
  };
};

// Each showcase board also declares its OWN Unicorn scene (background.type =
// "unicorn"), paired so the scene's authored hue ≈ the board's accent hue — the
// embed backdrop then renders essentially as authored (0° hue-rotate) and the
// five landing cards each carry a visibly different living scene. Tuned for the
// iframed preview: opacity above the runtime's subtle 0.16 default so the scene
// reads inside a card-sized frame, and scale 0.9 + dpi 1.25 so each scene
// renders at roughly half the default (1 × 1.5) pixel cost — lower aliases the
// scenes' grain/dither texture into visible blocks.
type SceneBackground = {
  type: "unicorn";
  projectId: string;
  opacity: number;
  scale: number;
  dpi: number;
};

function sceneBg(key: string): SceneBackground {
  const scene = BACKGROUND_SCENES.find((s) => s.key === key);
  if (!scene) throw new Error(`unknown background scene: ${key}`);
  return {
    type: "unicorn",
    projectId: scene.projectId,
    opacity: 0.5,
    scale: 0.9,
    dpi: 1.25,
  };
}

// Phosphor-green monospace, sharp dense flat cards — a quant trading terminal.
const LOOK_TERMINAL: Cosmetics = {
  theme: { accentHue: 145, accentSat: 85, baseHue: 150, baseSat: 16 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 4,
    borderStrength: 0.34,
    surfaceOpacity: 1,
    density: 0.85,
    elevation: 0.4,
  },
};

// Hot magenta on violet-black, glassy lifted cards — a vivid crypto desk.
const LOOK_SYNTHWAVE: Cosmetics = {
  theme: { accentHue: 320, accentSat: 88, baseHue: 280, baseSat: 26 },
  typography: { fontFamily: "sans", numericStyle: "proportional" },
  appearance: {
    radius: 20,
    borderStrength: 0.3,
    surfaceOpacity: 0.9,
    density: 1,
    elevation: 1.7,
  },
};

// Warm serif on charcoal-brown, roomy gentle-lift cards — a macro broadsheet.
const LOOK_EDITORIAL: Cosmetics = {
  theme: { accentHue: 22, accentSat: 60, baseHue: 28, baseSat: 12 },
  typography: { fontFamily: "serif", numericStyle: "proportional" },
  appearance: {
    radius: 10,
    borderStrength: 0.18,
    surfaceOpacity: 1,
    density: 1.15,
    elevation: 0.8,
  },
};

// Cool teal on deep blue-black, crisp tabular cards — an on-chain flow desk.
const LOOK_TIDE: Cosmetics = {
  theme: { accentHue: 190, accentSat: 72, baseHue: 202, baseSat: 20 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 12,
    borderStrength: 0.26,
    surfaceOpacity: 0.96,
    density: 0.95,
    elevation: 0.9,
  },
};

// Deep violet glass, lifted glossy cards — a derivatives / vol desk.
const LOOK_NEBULA: Cosmetics = {
  theme: { accentHue: 268, accentSat: 80, baseHue: 258, baseSat: 24 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 16,
    borderStrength: 0.28,
    surfaceOpacity: 0.92,
    density: 1,
    elevation: 1.3,
  },
};

// Signature indigo on cool slate — soft-cornered, borderless, roomy and flat.
// This is what a board looks like straight out of `zframes init`, which is why
// the newest board wears it. It sits closest in HUE to Nebula (242 vs 268), so
// the separation is carried by the SURFACE instead: opaque and flat where
// Nebula is glassy and lifted, and the roundest, airiest, least-bordered cards
// of the six.
const LOOK_AURORA: Cosmetics = {
  theme: { accentHue: 242, accentSat: 72, baseHue: 224, baseSat: 18 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 22,
    borderStrength: 0.14,
    surfaceOpacity: 1,
    density: 1.2,
    elevation: 0.5,
  },
};

// Warm gold on a brown-black vault, serif with tabular figures — a bullion
// ledger. Serif like LOOK_EDITORIAL, and its scene doubles up with that board
// (Ember is the only warm one of the six), so the separation is carried by hue
// and surface: 43 gold against 22 ember, and harder, tighter, denser cards
// against the broadsheet's roomy low-border ones.
const LOOK_BULLION: Cosmetics = {
  theme: { accentHue: 43, accentSat: 90, baseHue: 32, baseSat: 20 },
  typography: { fontFamily: "serif", numericStyle: "tabular" },
  appearance: {
    radius: 6,
    borderStrength: 0.36,
    surfaceOpacity: 1,
    density: 0.95,
    elevation: 0.5,
  },
};

// Steel blue on ink, flat monospaced tabular cards — an interbank dealing board,
// where every card is a rate and nothing is decorative. Shares the Tide scene
// with On-chain & DeFi (212 against its 190), separated by type and surface:
// monospaced and hard-cornered against that board's sans and softer cards.
const LOOK_INTERBANK: Cosmetics = {
  theme: { accentHue: 212, accentSat: 76, baseHue: 220, baseSat: 18 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 6,
    borderStrength: 0.3,
    surfaceOpacity: 1,
    density: 0.9,
    elevation: 0.5,
  },
};

// Bitcoin orange on a warm brown-black, monospaced tabular figures, hard flat
// dense cards — a node operator's console rather than a trading desk. Nothing
// here is a price: the cards are fee rates, block heights, sat/vB and EH/s, so
// the look is deliberately utilitarian — 4px corners, the strongest borders of
// any board, fully opaque surfaces and the tightest density, closer to a
// terminal readout than to the glassy market boards. It shares the Ember scene
// with the editorial and bullion boards; the separation is hue (32 orange
// against 22 and 43) and type (mono, where both of those are serif).
const LOOK_HEARTH: Cosmetics = {
  theme: { accentHue: 32, accentSat: 88, baseHue: 26, baseSat: 22 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 4,
    borderStrength: 0.34,
    surfaceOpacity: 1,
    density: 0.88,
    elevation: 0.35,
  },
};

// Spring teal on a green-black slate, glassy mid-lift cards — an on-chain
// research lab. Every card here is a derived statistic rather than a quote, so
// the identity is deliberately laboratory-cool: a single high-saturation teal
// accent (168) reading as instrument-panel green against a near-neutral base
// (172 at just 18 sat), sans with tabular figures so a column of oscillator
// readings lines up digit-for-digit, and a mid-lift glassy surface — softer and
// more floated than Terminal's hard flat cards, but far more restrained than
// Synthwave's 1.7 elevation. It shares the teal end of the wheel with Tide
// (190) and Terminal (145) and sits between them, so the separation is carried
// by saturation and surface: brighter and glassier than the flow desk, rounder
// and airier than the quant terminal.
const LOOK_LAB: Cosmetics = {
  theme: { accentHue: 168, accentSat: 78, baseHue: 172, baseSat: 18 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 14,
    borderStrength: 0.24,
    surfaceOpacity: 0.94,
    density: 1,
    elevation: 1.1,
  },
};

// Steel cyan on cool ink, serif with tabular figures, roomy near-borderless
// cards — an allocator's flow ledger. The serif pairs it with LOOK_EDITORIAL and
// LOOK_BULLION, but the hue separates it cleanly (205 steel against 22 ember and
// 43 gold), and the surface is the opposite of the bullion vault's hard, tight,
// heavily-bordered cards: opaque, softly rounded and airy, because every card on
// this board is a *ledger row* of dated flow figures that wants whitespace and
// column alignment rather than chrome. Tabular figures are load-bearing here —
// the whole board is dollar amounts read down a column.
const LOOK_LEDGER: Cosmetics = {
  theme: { accentHue: 205, accentSat: 70, baseHue: 210, baseSat: 14 },
  typography: { fontFamily: "serif", numericStyle: "tabular" },
  appearance: {
    radius: 10,
    borderStrength: 0.16,
    surfaceOpacity: 1,
    density: 1.15,
    elevation: 0.7,
  },
};

// Orchid on a violet-black wall, big soft radii and lifted glass — a gallery
// hang rather than a dealing board. Every card here is a *picture* of the market
// (treemaps, bubble clouds, a scatter), so the surface is deliberately the
// roundest and most floating of the set: generous 22px corners, a barely-there
// border, and the highest elevation, so each tile reads as a framed piece with
// air around it. It sits between Synthwave (320) and Nebula (268) in hue, and is
// separated from both by SURFACE — glassier and rounder than Nebula, calmer and
// less saturated than Synthwave's hot magenta. Proportional sans, not tabular:
// nothing on this board is a rate you read digit-by-digit, it is rotation you
// read by shape and colour.
const LOOK_GALLERY: Cosmetics = {
  theme: { accentHue: 292, accentSat: 82, baseHue: 278, baseSat: 24 },
  typography: { fontFamily: "sans", numericStyle: "proportional" },
  appearance: {
    radius: 22,
    borderStrength: 0.2,
    surfaceOpacity: 0.9,
    density: 1.05,
    elevation: 1.6,
  },
};

// Crimson on a near-black plum wash, monospaced and tabular, with the tightest
// cards of the set — a vol trader's console, where every surface is an alarm
// panel and nothing is decorative. Hue 350 sits deliberately on the boundary
// between the semantic `--zf-down` red and the accent, because on an options
// desk the two are the same mood; the separation from LOOK_SYNTHWAVE (320) is
// carried entirely by the SURFACE — hard 5px corners, a heavy 0.32 border, full
// opacity and almost no lift, against that board's glassy round glow. Density
// 0.85 packs the strike ladders and smiles as close together as the grid allows,
// which is the point: a surface is read across cards, not one card at a time.
const LOOK_VOLATILE: Cosmetics = {
  theme: { accentHue: 350, accentSat: 84, baseHue: 340, baseSat: 20 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 5,
    borderStrength: 0.32,
    surfaceOpacity: 1,
    density: 0.85,
    elevation: 0.45,
  },
};

// Lime on a faintly green-grey ink, monospaced with tabular figures, and the
// hardest, flattest surface of the set — a basis desk's carry sheet. Carry is
// an accounting job before it is a trade: you are reading a column of signed
// rates and asking which ones still pay after the spread, so the board is
// deliberately unglamorous. Squared corners (radius 3), a visible hairline
// border (0.3) and almost no lift (elevation 0.3) make the cards read as ruled
// cells rather than floating panels; density 0.9 tightens them so more of the
// rate table fits in one glance. Its lime (96) sits far enough from Terminal's
// phosphor green (145) to be a different desk, and the mono/tabular type is
// what keeps a column of funding rates aligned digit-for-digit.
const LOOK_CARRY: Cosmetics = {
  theme: { accentHue: 96, accentSat: 74, baseHue: 100, baseSat: 14 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 3,
    borderStrength: 0.3,
    surfaceOpacity: 1,
    density: 0.9,
    elevation: 0.3,
  },
};

// Mint on a cool grey-blue ground, sans with tabular figures, and the softest,
// roundest, least-bordered cards of the set — a calm treasury sheet rather than
// a trading terminal. Yield work is reading columns of rates against each other,
// so the figures are tabular and the surfaces are opaque, airy (density 1.18) and
// barely lifted: nothing competes with the numbers. Mint (158) sits far enough
// from Tide's 190 and Terminal's 145 to read as its own board, and the low
// borderStrength + radius 18 keep it visibly softer than the phosphor desks.
const LOOK_MINT: Cosmetics = {
  theme: { accentHue: 158, accentSat: 66, baseHue: 196, baseSat: 12 },
  typography: { fontFamily: "sans", numericStyle: "tabular" },
  appearance: {
    radius: 18,
    borderStrength: 0.14,
    surfaceOpacity: 1,
    density: 1.18,
    elevation: 0.6,
  },
};

// Ink navy on cold grey, serif with proportional figures, and the hardest,
// most ruled cards of the set — a statistical bureau's own report, deliberately
// unexciting. Every number on this board was published by a government agency
// weeks after the month it describes, so the look is the opposite of a trading
// desk: nothing blinks, nothing glows. The first draft of this board was warm
// brick on Ember, which put it 10° from LOOK_EDITORIAL with the same serif,
// the same scene and nearly the same surface — two boards that read as one.
// It is separated on three axes instead: hue (218 ink against Editorial's 22),
// SATURATION (26 — by far the greyest accent here, so it reads as printers' ink
// rather than as a colour), and surface (radius 2 and borderStrength 0.42, the
// ruled lines of a printed table, against Editorial's soft roomy page). Its
// Aurora neighbour, Housing & Credit, sits 24° away and inverts every one of
// those: vivid sat 72, sans, and the roundest airiest cards on the landing.
const LOOK_BUREAU: Cosmetics = {
  theme: { accentHue: 218, accentSat: 26, baseHue: 220, baseSat: 10 },
  typography: { fontFamily: "serif", numericStyle: "proportional" },
  appearance: {
    radius: 2,
    borderStrength: 0.42,
    surfaceOpacity: 1,
    density: 0.88,
    elevation: 0.2,
  },
};

// Amber instruments on near-black, monospaced and tabular, with the hardest and
// densest cards of the set — a cockpit, not a terminal. The other boards are
// reading surfaces: they render somebody else's data and the look decides how
// pleasant that is. This one is a control surface, and every card is something
// the trader touches — a timer, a sizer, a checklist, a logged call. So the
// identity is instrumentation: amber-on-black (the colour of a gauge lit from
// behind, and the one hue no other board claims), 4px corners and a 0.38 border
// so each control reads as a discrete switch rather than a floating panel,
// surfaceOpacity 1 and elevation 0.3 because a cockpit panel is bolted down, not
// hovering, and density 0.82 — the tightest on the landing — so the whole
// pre-flight sequence fits in one glance instead of scrolling.
const LOOK_COCKPIT: Cosmetics = {
  theme: { accentHue: 48, accentSat: 90, baseHue: 40, baseSat: 8 },
  typography: { fontFamily: "mono", numericStyle: "tabular" },
  appearance: {
    radius: 4,
    borderStrength: 0.38,
    surfaceOpacity: 1,
    density: 0.82,
    elevation: 0.3,
  },
};

// Acid chartreuse on an olive-black wall, glassy high-lift sans cards — a
// sentiment board that is deliberately the loudest of the set, because
// everything on it is an opinion rather than a measurement and the look should
// say so. Highlighter yellow-green is the one hue nothing else on the landing
// claims: the palette runs warm 12–48, then jumps to 96, and this sits in that
// gap at 72. The first draft was hot pink on Dusk, which landed 10° from Crypto
// Desk with the same sans, the same scene and the same glassy lift — loud, but
// indistinguishable from the board above it. Its Verdant neighbours separate on
// type and surface rather than hue: Funding & Carry (96) is dense flat mono,
// On-chain Cycle (168) is a full 96° away, and this is the only high-lift
// proportional card on the scene.
const LOOK_SIGNAL: Cosmetics = {
  theme: { accentHue: 72, accentSat: 95, baseHue: 90, baseSat: 14 },
  typography: { fontFamily: "sans", numericStyle: "proportional" },
  appearance: {
    radius: 16,
    borderStrength: 0.22,
    surfaceOpacity: 0.88,
    density: 1.05,
    elevation: 1.8,
  },
};

export type CuratedDashboard = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  spec: {
    version: string;
    title: string;
    author: string;
    background: { type: "none" } | SceneBackground;
    theme?: Cosmetics["theme"];
    typography?: Cosmetics["typography"];
    appearance?: Cosmetics["appearance"];
    frames: Frame[];
  };
};

function spec(
  title: string,
  frames: Frame[],
  look: Cosmetics = {},
  background: CuratedDashboard["spec"]["background"] = { type: "none" },
): CuratedDashboard["spec"] {
  return {
    version: "1.0.0",
    title,
    author: "zframes",
    background,
    ...look,
    frames,
  };
}

export const CURATED: CuratedDashboard[] = [
  {
    id: "stocks-macro",
    title: "Stocks & Macro",
    description:
      "Crypto majors alongside official US macro and the equity indices — the same mix used to prove the proxy end-to-end.",
    tags: ["markets", "macro", "equities"],
    spec: spec(
      "Stocks & Macro",
      [
        {
          id: "hd-markets",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Markets",
            subtitle: "Live crypto — browser-direct",
          },
        },
        {
          id: "chart-btc",
          frame: "price-chart",
          title: "BTC",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: { symbol: "BTC" },
        },
        {
          id: "ticker-1",
          frame: "price-ticker",
          title: "Watchlist",
          position: { x: 6, y: 1, w: 3, h: 3 },
          config: { symbols: ["BTC", "ETH", "SOL", "xyz:TSLA", "xyz:NVDA"] },
        },
        {
          id: "feargreed-1",
          frame: "fear-greed",
          position: { x: 9, y: 1, w: 3, h: 3 },
          config: {},
        },
        {
          id: "mcap-treemap",
          frame: "market-cap-treemap",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: {},
        },
        {
          id: "tvl-treemap",
          frame: "tvl-treemap",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: {},
        },
        // ── Indices & volatility ──────────────────────────────────────────
        // The equity half this board was named for but never had: it showed
        // crypto, rates and short volume, and nothing that says what the market
        // itself did. All four cards read one FRED capability (`index-level`),
        // so the section costs one request per series, not per card.
        {
          id: "hd-indices",
          frame: "heading",
          position: { x: 0, y: 8, w: 12, h: 1 },
          config: {
            title: "Indices & Volatility",
            subtitle:
              "S&P 500, Nasdaq and the VIX — read off FRED's own published CSV, still no key",
          },
        },
        {
          id: "spx-chart",
          frame: "index-level-chart",
          title: "S&P 500",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: { series: "SP500", years: 10 },
        },
        {
          // Nasdaq, not the S&P: FRED licences SP500 with a ~10-year rolling
          // window, which cannot contain the drawdown worth showing.
          // NASDAQCOM runs to 1971, so the dot-com trough is actually in frame.
          id: "ndx-drawdown",
          frame: "index-drawdown",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: { series: "NASDAQCOM", years: 30 },
        },
        {
          id: "spx-years",
          frame: "index-annual-returns",
          position: { x: 0, y: 13, w: 6, h: 4 },
          config: { series: "SP500", years: 20 },
        },
        // Grouped: level and volatility are the two-number read on the index —
        // "where is it" beside "how nervous is it". They only mean something
        // together, so they occupy one slot beside the returns chart.
        // Panelled, untitled — same reasoning as gold-desk's pair: visible on a
        // landing board, still level with the returns chart sharing its row.
        group(
          "grp-index-now",
          { x: 6, y: 13, w: 6, h: 4 },
          { columns: 2, rows: 1, gap: 8, panel: true },
          [
            kid(
              "ndx-level",
              "index-level",
              { x: 0, y: 0, w: 1, h: 1 },
              { series: "NASDAQCOM", trendDays: 180 },
              "Nasdaq Composite",
            ),
            kid("vix-1", "vix-gauge", { x: 1, y: 0, w: 1, h: 1 }, { max: 50 }),
          ],
        ),
        {
          id: "hd-macro",
          frame: "heading",
          position: { x: 0, y: 17, w: 12, h: 1 },
          config: {
            title: "Macro & Equities",
            subtitle: "Official data via /__zframes/proxy",
          },
        },
        {
          id: "yieldcurve-1",
          frame: "yield-curve",
          position: { x: 0, y: 18, w: 4, h: 3 },
          config: {},
        },
        {
          id: "finstress-1",
          frame: "financial-stress",
          position: { x: 4, y: 18, w: 4, h: 3 },
          config: {},
        },
        {
          id: "shortvol-1",
          frame: "short-volume",
          position: { x: 8, y: 18, w: 4, h: 4 },
          config: { symbols: ["TSLA", "NVDA", "AAPL", "AMD"] },
        },
      ],
      LOOK_TERMINAL,
      sceneBg("verdant"), // green light ≈ the terminal's phosphor accent (145)
    ),
  },
  {
    id: "crypto-desk",
    title: "Crypto Desk",
    description:
      "A crypto-first board — BTC/ETH charts, a majors watchlist, sentiment, and the market-cap + TVL landscape.",
    tags: ["crypto", "markets"],
    spec: spec(
      "Crypto Desk",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Crypto Desk",
            subtitle: "Majors, sentiment, and on-chain",
          },
        },
        // Grouped: the same frame twice, one per major — a like-for-like
        // comparison, not two unrelated charts. Titled AND panelled on purpose:
        // this board is one of the three on the landing page, and it spans the
        // full row, so there is no neighbour to misalign against and the grouping
        // is legible to a first-time visitor rather than merely structural.
        group(
          "grp-majors",
          { x: 0, y: 1, w: 12, h: 3 },
          { columns: 2, rows: 1, gap: 8, panel: true },
          [
            kid(
              "btc",
              "price-chart",
              { x: 0, y: 0, w: 1, h: 1 },
              { symbol: "BTC" },
              "BTC",
            ),
            kid(
              "eth",
              "price-chart",
              { x: 1, y: 0, w: 1, h: 1 },
              { symbol: "ETH" },
              "ETH",
            ),
          ],
          "The majors, side by side",
        ),
        {
          id: "watch",
          frame: "price-ticker",
          title: "Majors",
          position: { x: 0, y: 4, w: 4, h: 3 },
          config: { symbols: ["BTC", "ETH", "SOL", "AVAX", "LINK"] },
        },
        {
          id: "fg",
          frame: "fear-greed",
          position: { x: 4, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "mcap",
          frame: "market-cap-treemap",
          position: { x: 8, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "tvl",
          frame: "tvl-treemap",
          position: { x: 0, y: 7, w: 12, h: 4 },
          config: {},
        },
      ],
      LOOK_SYNTHWAVE,
      sceneBg("dusk"), // magenta-pink glow ≈ the synthwave accent (320)
    ),
  },
  {
    // The board for the newest keyless sources — FRED, Zillow and the FHFA.
    // Deliberately NOT folded into "Macro & Rates": that board is the rates
    // story, and this one answers a different question — what a house costs and
    // what the market charges to lend against it. Its centrepiece is Mortgage
    // Payment, the only frame in the catalogue that needs TWO providers to say
    // anything (Zillow's home value × FRED's live 30-year rate); the index
    // sources alone can only tell you prices rose, never whether a buyer can pay.
    //
    // Cost note: the ZHVI table is one uncompressed ~4.4 MB CSV, and the board's
    // three Zillow cards share a single download (the provider caches the parsed
    // TABLE under a constant key). It is paid only when a visitor scrolls this
    // board into the focus band — the embed iframe mounts lazily.
    id: "housing-credit",
    title: "Housing & Credit",
    description:
      "What a home costs, what it costs to borrow, and what the credit market charges for risk — Zillow, the FHFA and the Fed's own series, all keyless.",
    tags: ["housing", "credit", "macro"],
    spec: spec(
      "Housing & Credit",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Housing & Credit",
            subtitle: "Zillow, FHFA and FRED — no keys, no signup",
          },
        },
        // The level, in actual money rather than index points.
        {
          id: "zhvi-chart",
          frame: "home-value-chart",
          position: { x: 0, y: 1, w: 6, h: 4 },
          config: {
            regions: ["United States", "Austin, TX", "Miami, FL"],
            years: 25,
          },
        },
        // The rate that decides whether that level is affordable.
        {
          id: "mortgage-rate",
          frame: "mortgage-rate-chart",
          position: { x: 6, y: 1, w: 6, h: 4 },
          config: { years: 25 },
        },
        // ★ The cross-provider card: value × rate → the monthly payment.
        {
          id: "payment",
          frame: "mortgage-payment",
          position: { x: 0, y: 5, w: 4, h: 4 },
          config: { region: "Austin, TX", downPaymentPct: 20, termYears: 30 },
        },
        {
          id: "case-shiller",
          frame: "home-price-index",
          position: { x: 4, y: 5, w: 4, h: 4 },
          config: { years: 25 },
        },
        {
          id: "credit",
          frame: "credit-spread-chart",
          position: { x: 8, y: 5, w: 4, h: 4 },
          config: {},
        },
        // State level (~190 KB), not metro (~4 MB) — the divergence a single
        // national index averages away, at a download an embed can afford.
        {
          id: "fhfa-states",
          frame: "regional-home-prices",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: {
            level: "state",
            regions: ["CA", "TX", "FL", "NY", "WA"],
            years: 20,
          },
        },
        {
          id: "zhvi-metros",
          frame: "metro-home-values",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: {},
        },

        // ── Divergence ────────────────────────────────────────────────────
        // The rows above answer "what does it cost"; these answer "where is it
        // still moving", which a national index averages away entirely. Every
        // Zillow card here rides the SAME ~4.4 MB table the section above
        // already downloaded (the provider caches the parsed table under a
        // constant key), so the whole row is free in bandwidth terms.
        {
          id: "hd-divergence",
          frame: "heading",
          position: { x: 0, y: 13, w: 12, h: 1 },
          config: {
            title: "Divergence",
            subtitle:
              "Which markets are still appreciating, and what credit charges for quality",
          },
        },
        {
          id: "zhvi-momentum",
          frame: "home-value-momentum",
          position: { x: 0, y: 14, w: 4, h: 4 },
          config: {},
        },
        {
          id: "zhvi-bars",
          frame: "home-value-bars",
          position: { x: 4, y: 14, w: 4, h: 4 },
          config: {},
        },
        {
          id: "fhfa-bars",
          frame: "regional-home-price-bars",
          position: { x: 8, y: 14, w: 4, h: 4 },
          config: { level: "state" },
        },
        {
          // The quadrant view: expensive-and-cooling separates from
          // cheap-and-heating, which neither a ranked list nor a single chart
          // shows.
          id: "zhvi-quadrants",
          frame: "home-value-scatter",
          position: { x: 0, y: 18, w: 6, h: 4 },
          config: {},
        },
        {
          // The pair above plots both spreads; this isolates the GAP between
          // them, which strips out the level of rates and leaves only credit's
          // appetite for risk.
          id: "credit-gap",
          frame: "credit-quality-gap",
          position: { x: 6, y: 18, w: 6, h: 4 },
          config: { years: 3 },
        },
      ],
      LOOK_AURORA,
      sceneBg("aurora"), // the signature indigo ≈ the board's accent (242)
    ),
  },
  {
    id: "macro-rates",
    title: "Macro & Rates",
    description:
      "The official-data board — Treasury yield curve, OFR financial stress, FINRA short volume, and equity perps.",
    tags: ["macro", "equities"],
    spec: spec(
      "Macro & Rates",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Macro & Rates",
            subtitle: "Official US data via the same-origin proxy",
          },
        },
        {
          id: "yc",
          frame: "yield-curve",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "fs",
          frame: "financial-stress",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "sv",
          frame: "short-volume",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: { symbols: ["TSLA", "NVDA", "AAPL", "AMD", "MSFT"] },
        },
        {
          id: "eq",
          frame: "price-ticker",
          title: "Equity perps",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: { symbols: ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL", "xyz:AMD"] },
        },
      ],
      LOOK_EDITORIAL,
      sceneBg("ember"), // warm ember tones ≈ the editorial accent (22)
    ),
  },
  {
    id: "onchain-defi",
    title: "On-chain & DeFi",
    description:
      "The chain-level view — stablecoin supply, cross-chain activity, hot DEX pools, protocol fees, and the best live yields.",
    tags: ["defi", "on-chain"],
    spec: spec(
      "On-chain & DeFi",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "On-chain & DeFi",
            subtitle: "Stablecoins, chains, pools, and yields",
          },
        },
        {
          id: "stables",
          frame: "stablecoin-supply",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "chains",
          frame: "chain-activity",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: {},
        },
        {
          id: "pools",
          frame: "dex-hot-pools",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: {},
        },
        {
          id: "fees",
          frame: "protocol-fees-treemap",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: {},
        },
        {
          id: "yields",
          frame: "yield-scanner",
          position: { x: 0, y: 8, w: 12, h: 3 },
          config: {},
        },
      ],
      LOOK_TIDE,
      sceneBg("tide"), // teal currents ≈ the on-chain accent (190)
    ),
  },
  {
    id: "derivatives-desk",
    title: "Derivatives Desk",
    description:
      "Funding, open interest, and the BTC options surface — put/call ratio, DVOL, and open interest by strike from Deribit.",
    tags: ["derivatives", "options"],
    spec: spec(
      "Derivatives Desk",
      [
        {
          id: "hd",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Derivatives Desk",
            subtitle: "Funding, open interest, and options",
          },
        },
        {
          id: "funding",
          frame: "funding-rate-chart",
          position: { x: 0, y: 1, w: 6, h: 3 },
          config: { symbols: ["BTC", "ETH"] },
        },
        {
          id: "oi",
          frame: "open-interest",
          position: { x: 6, y: 1, w: 6, h: 3 },
          config: { symbols: ["BTC", "ETH", "SOL", "xyz:TSLA"] },
        },
        {
          id: "pcr",
          frame: "options-put-call",
          position: { x: 0, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "iv",
          frame: "options-iv",
          position: { x: 4, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "strikes",
          frame: "options-oi-strike",
          position: { x: 8, y: 4, w: 4, h: 3 },
          config: {},
        },
        {
          id: "carry",
          frame: "funding-comparison",
          position: { x: 0, y: 7, w: 12, h: 3 },
          config: {},
        },
      ],
      LOOK_NEBULA,
      sceneBg("nebula"), // violet nebula ≈ the derivatives accent (268)
    ),
  },
  {
    // Gold end to end, from one provider with an unusually long memory: the
    // LBMA publishes its daily London fix back to 1968, which is what makes the
    // seasonality, milestone and drawdown cards here possible at all — no other
    // source in the fleet reaches that far. Spot is a separate keyless quote, so
    // the top of the board is live while the history warms up behind it.
    //
    // Cost note: history is ~150 KB gzipped per metal on a 6h TTL and is NOT
    // persisted, and every card below shares one download per metal. The
    // Metals Board lists only the precious four — copper is quoted but has no
    // London fix, so its change column would sit permanently blank on a board
    // whose whole premise is the fix.
    id: "gold-desk",
    title: "Gold Desk",
    description:
      "Bullion end to end — live spot, the LBMA London fix back to 1968, CFTC positioning, and the vaults the US Treasury reports every month.",
    tags: ["metals", "gold", "macro"],
    spec: spec(
      "Gold Desk",
      [
        {
          id: "hd-spot",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Gold Desk",
            subtitle:
              "Live spot, and the London fix the physical market settles against",
          },
        },
        {
          id: "complex",
          frame: "metals-board",
          position: { x: 0, y: 1, w: 3, h: 4 },
          config: { symbols: ["XAU", "XAG", "XPT", "XPD"], showChange: true },
        },
        {
          id: "gold-chart",
          frame: "metal-price-chart",
          title: "Gold — London fix",
          position: { x: 3, y: 1, w: 6, h: 4 },
          config: {
            symbols: ["XAU"],
            currency: "USD",
            years: 20,
            logScale: false,
          },
        },
        // Grouped: spot and distance-from-high are the two numbers you read
        // together beside the chart — "what is it" and "where is that". They were
        // already a stacked column; the group makes that pairing survive a
        // rearrange.
        // No panel, and NOT for lack of trying: a panel's padding costs each child
        // ~12px, and `metal-ath` at h:2 is already tight enough that losing that
        // made its headline number overlap its own date line (seen in the
        // browser). A group whose children are height-constrained takes the
        // invisible form — the pairing is still structural, just not decorated.
        // crypto-desk carries the visible demonstration on the landing page.
        group(
          "grp-gold-now",
          { x: 9, y: 1, w: 3, h: 4 },
          { columns: 1, rows: 2, gap: 8 },
          [
            kid(
              "gold-spot",
              "metal-price",
              { x: 0, y: 0, w: 1, h: 1 },
              { symbol: "XAU", unit: "ounce", showFix: true },
            ),
            kid(
              "gold-ath",
              "metal-ath",
              { x: 0, y: 1, w: 1, h: 1 },
              { symbol: "XAU" },
            ),
          ],
        ),
        {
          id: "gold-perf",
          frame: "metal-performance",
          position: { x: 0, y: 5, w: 4, h: 4 },
          config: { symbol: "XAU", mode: "cumulative" },
        },
        {
          // h:3, its meta's natural height — the chart frames either side take
          // h:4 because a fixed-height plot needs it, but this card is
          // content-driven and at h:4 it left ~310px of dead space.
          id: "gsr",
          frame: "gold-silver-ratio",
          position: { x: 4, y: 5, w: 4, h: 3 },
          config: { years: 20, showPercentile: true },
        },
        {
          id: "us-reserve",
          frame: "us-gold-reserve",
          position: { x: 8, y: 5, w: 4, h: 4 },
          config: { showMarketValue: true },
        },
        {
          id: "gold-underwater",
          frame: "metal-drawdown",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: { symbol: "XAU", years: 45 },
        },
        {
          id: "gold-years",
          frame: "metal-annual-returns",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: { symbol: "XAU", years: 25 },
        },

        // ── Positioning & vaults ──────────────────────────────────────────
        {
          id: "hd-positioning",
          frame: "heading",
          position: { x: 0, y: 13, w: 12, h: 1 },
          config: {
            title: "Positioning & Vaults",
            subtitle:
              "Who is long the paper, where the physical sits, and what the tokenized version costs",
          },
        },
        // Grouped: three views of ONE weekly CFTC print — the net history, the
        // trader classes behind it, and where it sits in its own range. Uneven
        // widths are preserved by giving the inner grid 12 columns and keeping
        // each child's 5/4/3 span, so the group changes what they ARE (one
        // reading) without changing how they look.
        group(
          "grp-cot",
          { x: 0, y: 14, w: 12, h: 4 },
          { columns: 12, rows: 1, gap: 8 },
          [
            kid(
              "cot-net",
              "metal-cot-net",
              { x: 0, y: 0, w: 5, h: 1 },
              { symbol: "XAU", years: 5, showOpenInterest: false },
            ),
            kid(
              "cot-classes",
              "metal-cot-breakdown",
              { x: 5, y: 0, w: 4, h: 1 },
              { symbol: "XAU" },
            ),
            kid(
              "cot-gauge",
              "metal-cot-gauge",
              { x: 9, y: 0, w: 3, h: 1 },
              { symbol: "XAU" },
            ),
          ],
          "CFTC positioning · gold",
        ),
        {
          id: "vaults",
          frame: "us-gold-vaults",
          position: { x: 0, y: 18, w: 4, h: 4 },
          config: { mode: "treemap" },
        },
        {
          id: "paxg",
          frame: "tokenized-gold",
          position: { x: 4, y: 18, w: 4, h: 4 },
          config: { showPremium: true },
        },
        {
          id: "fixes",
          frame: "metal-fix-table",
          position: { x: 8, y: 18, w: 4, h: 4 },
          config: { symbol: "XAU", currency: "USD", rows: 12 },
        },

        // ── The long record ───────────────────────────────────────────────
        // The three cards only six decades of daily fixes can answer.
        {
          id: "hd-record",
          frame: "heading",
          position: { x: 0, y: 22, w: 12, h: 1 },
          config: {
            title: "The Long Record",
            subtitle: "Six decades of daily London fixes, LBMA's own files",
          },
        },
        {
          id: "seasonality",
          frame: "metal-seasonality",
          position: { x: 0, y: 23, w: 5, h: 4 },
          config: { symbol: "XAU", years: 25 },
        },
        {
          id: "btc-gold",
          frame: "btc-in-gold",
          position: { x: 5, y: 23, w: 4, h: 4 },
          config: { years: 12, logScale: true },
        },
        {
          id: "milestones",
          frame: "metal-milestones",
          position: { x: 9, y: 23, w: 3, h: 4 },
          config: { symbol: "XAU", newestFirst: true },
        },
      ],
      LOOK_BULLION,
      // Ember is the only warm scene of the six, so this board shares it with
      // Macro & Rates. They sit three apart in the stack and 21° apart in
      // accent, and LOOK_BULLION's harder surface carries the rest.
      sceneBg("ember"),
    ),
  },
  {
    // Foreign exchange, which is the one data family on the front door that
    // needs neither a key NOR the proxy: provider-fx resolves the ECB's daily
    // reference fixings through four keyless CORS-open upstreams in order, so
    // this board is also the honest demonstration that a zframes dashboard
    // keeps working when an upstream goes down.
    //
    // Every card reads the same fixing snapshot, so the crosses are internally
    // consistent by construction rather than by luck — which is exactly why the
    // note at the bottom spells out that these are fixings, not tradable
    // quotes. It is the single most common misreading of ECB rates.
    id: "fx-desk",
    title: "FX Desk",
    description:
      "The dollar and its counterparties — daily reference fixings, the full cross matrix, the day's movers, and DXY. Keyless, no proxy, four fallback sources deep.",
    tags: ["fx", "macro", "currencies"],
    spec: spec(
      "FX Desk",
      [
        {
          id: "hd-majors",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "FX Desk",
            subtitle:
              "ECB daily reference rates — no key, no proxy, four keyless sources deep",
          },
        },
        {
          id: "majors",
          frame: "fx-board",
          title: "Majors vs USD",
          position: { x: 0, y: 1, w: 4, h: 4 },
          config: {
            base: "USD",
            symbols: ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK"],
            showSparkline: true,
          },
        },
        {
          id: "majors-trend",
          frame: "fx-trend-chart",
          position: { x: 4, y: 1, w: 5, h: 4 },
          config: { base: "USD", symbols: ["EUR", "GBP", "JPY", "CHF"] },
        },
        {
          // h:3 for the same reason as the ratio card on Gold Desk: a headline
          // number plus a sparkline does not fill h:4, and the void reads as a
          // broken card rather than as air.
          id: "dxy-now",
          frame: "dxy",
          position: { x: 9, y: 1, w: 3, h: 3 },
          config: {},
        },
        {
          // Every cell is derived from the same day's fixing against a common
          // pivot, so the matrix cannot disagree with the board above it.
          id: "crosses",
          frame: "fx-cross-heatmap",
          position: { x: 0, y: 5, w: 6, h: 4 },
          config: { symbols: ["USD", "EUR", "GBP", "JPY", "CHF", "CAD"] },
        },
        {
          id: "dxy-history",
          frame: "dxy-chart",
          position: { x: 6, y: 5, w: 6, h: 4 },
          config: {},
        },

        // ── Beyond the majors ─────────────────────────────────────────────
        {
          id: "hd-wider",
          frame: "heading",
          position: { x: 0, y: 9, w: 12, h: 1 },
          config: {
            title: "Beyond the Majors",
            subtitle:
              "Asia, Latin America and the Nordics — same feed, same day's fixing",
          },
        },
        {
          id: "wider",
          frame: "fx-board",
          title: "Asia & LatAm vs USD",
          position: { x: 0, y: 10, w: 4, h: 4 },
          config: {
            base: "USD",
            symbols: ["THB", "SGD", "KRW", "INR", "CNY", "MXN", "BRL", "ZAR"],
            showSparkline: true,
          },
        },
        {
          id: "movers",
          frame: "fx-movers-bars",
          position: { x: 4, y: 10, w: 4, h: 4 },
          config: {
            base: "USD",
            symbols: [
              "EUR",
              "GBP",
              "JPY",
              "CHF",
              "CAD",
              "AUD",
              "NZD",
              "SEK",
              "NOK",
              "PLN",
            ],
          },
        },
        {
          // Base EUR, deliberately: the same currencies read differently from
          // the other side of the world's second reserve currency, and it shows
          // the board is not hard-wired to the dollar.
          id: "eur-trend",
          frame: "fx-trend-chart",
          title: "Trend vs EUR",
          position: { x: 8, y: 10, w: 4, h: 4 },
          config: { base: "EUR", symbols: ["USD", "GBP", "CHF", "SEK"] },
        },
        // Grouped: four clocks are a single instrument — the FX day read east to
        // west. Their order is the meaning, so they move as one strip rather than
        // as four cards that could end up shuffled out of sequence.
        group(
          "grp-clocks",
          { x: 0, y: 14, w: 12, h: 2 },
          { columns: 4, rows: 1, gap: 8 },
          [
            kid(
              "clock-tokyo",
              "clock",
              { x: 0, y: 0, w: 1, h: 1 },
              { timezone: "Asia/Tokyo", label: "Tokyo", showSeconds: true },
            ),
            kid(
              "clock-london",
              "clock",
              { x: 1, y: 0, w: 1, h: 1 },
              {
                timezone: "Europe/London",
                label: "London",
                showSeconds: true,
              },
            ),
            kid(
              "clock-ny",
              "clock",
              { x: 2, y: 0, w: 1, h: 1 },
              {
                timezone: "America/New_York",
                label: "New York",
                showSeconds: true,
              },
            ),
            kid(
              "clock-utc",
              "clock",
              { x: 3, y: 0, w: 1, h: 1 },
              { timezone: "UTC", label: "UTC", showSeconds: true },
            ),
          ],
          "The FX day",
        ),
        {
          id: "fixing-note",
          frame: "note",
          position: { x: 0, y: 16, w: 12, h: 3 },
          config: {
            text: "**These are reference fixings, not tradable quotes.** The ECB publishes one set of rates each working day around 16:00 CET, and every cross on this board is derived from that same snapshot — so a weekend or a holiday shows the last working day's fixing rather than a stale tick.\n\nzframes resolves them through four keyless sources in order — Frankfurter/ECB, FXRatesAPI, currency-api and the ECB Data Portal — so one upstream going down does not blank the board.",
            align: "left",
          },
        },
      ],
      LOOK_INTERBANK,
      // Tide, not Aurora: Aurora is cast as the out-of-the-box look on
      // Housing & Credit, and taking it here would undercut that. 212 against
      // Tide's authored 190 is a 22° rotate — still cool, still steel.
      sceneBg("tide"),
    ),
  },
  {
    // The only board built entirely on ONE provider: every card except the BTC
    // price chart reads mempool.space, which serves its whole API keyless and
    // CORS-open — no proxy hop, so this board keeps working on a static host
    // where the Treasury/FRED boards degrade to empty. It also answers a
    // different question from Crypto Desk: not what bitcoin is worth, but what
    // the network is doing — what a transaction costs right now, how full the
    // next blocks are, and who is mining them.
    id: "bitcoin-node",
    title: "Bitcoin Node",
    description:
      "The network behind the price — live mempool congestion, fee tiers, recent blocks, hashrate, the difficulty epoch, pool concentration and Lightning. One keyless source, no proxy.",
    tags: ["bitcoin", "onchain", "mempool"],
    spec: spec(
      "Bitcoin Node",
      [
        // ── Mempool & fees ──────────────────────────────────────────────────
        // What it costs to transact in the next few blocks, which is the only
        // number a node operator checks more than once an hour.
        {
          id: "hd-mempool",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Mempool & Fees",
            subtitle: "Live from mempool.space — keyless, browser-direct",
          },
        },
        // Grouped: the instantaneous state of the node — what a block costs, what
        // is queued, and when the next retarget lands. One glance, so one card.
        // The inner grid keeps 12 columns so the authored 3/5/4 widths survive.
        group(
          "grp-node-now",
          { x: 0, y: 1, w: 12, h: 3 },
          { columns: 12, rows: 1, gap: 8, panel: true },
          [
            kid(
              "fees",
              "btc-fees",
              { x: 0, y: 0, w: 3, h: 1 },
              { tiers: ["fastest", "halfHour", "hour", "economy"] },
            ),
            kid(
              "mempool",
              "btc-mempool",
              { x: 3, y: 0, w: 5, h: 1 },
              { projectedBlocks: 5 },
            ),
            kid(
              "difficulty",
              "btc-difficulty",
              { x: 8, y: 0, w: 4, h: 1 },
              { showPrevious: true },
            ),
          ],
          "Node right now",
        ),
        // The fee curve and the price side by side: the pair that shows whether
        // a fee spike is being driven by the market moving or by something
        // purely on-chain (an inscription wave, a large consolidation).
        {
          id: "fee-curve",
          frame: "mempool-fee-curve",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: { projectedBlocks: 6 },
        },
        {
          id: "btc-price",
          frame: "price-chart",
          title: "BTC",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: {
            symbol: "BTC",
            interval: "1h",
            mode: "line",
            // Bitcoin orange rather than the default indigo — the one card on
            // this board that takes an explicit colour, so it sits with the
            // accent instead of against it.
            color: "#f7931a",
          },
        },

        // ── Blocks ──────────────────────────────────────────────────────────
        // The same recent blocks read two ways: the feed carries the detail
        // (pool, fees, age) and the bars carry the shape — how close to full
        // the network has actually been running.
        {
          id: "hd-blocks",
          frame: "heading",
          position: { x: 0, y: 8, w: 12, h: 1 },
          config: {
            title: "Blocks",
            subtitle: "Who found them, how full they were",
          },
        },
        {
          id: "blocks",
          frame: "btc-blocks",
          position: { x: 0, y: 9, w: 6, h: 4 },
          config: { count: 10 },
        },
        {
          id: "block-sizes",
          frame: "btc-block-size-bars",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: { count: 12 },
        },

        // ── Hashpower & security ────────────────────────────────────────────
        // Two years of window on both charts: one retarget epoch is two weeks,
        // so a 1y view shows the noise and not the trend that pays for it.
        {
          id: "hd-hashpower",
          frame: "heading",
          position: { x: 0, y: 13, w: 12, h: 1 },
          config: {
            title: "Hashpower & Security",
            subtitle:
              "Two years of hashrate, difficulty and pool concentration",
          },
        },
        {
          id: "hashrate",
          frame: "btc-hashrate",
          position: { x: 0, y: 14, w: 6, h: 4 },
          config: { window: "2y" },
        },
        {
          id: "difficulty-chart",
          frame: "btc-difficulty-chart",
          position: { x: 6, y: 14, w: 6, h: 4 },
          config: { window: "2y" },
        },
        // Pool share twice over, on purpose: the treemap ranks the long tail,
        // the donut puts the top-3 combined share in the middle — the single
        // figure the centralisation argument actually turns on.
        {
          id: "pools",
          frame: "mining-pools",
          position: { x: 0, y: 18, w: 5, h: 4 },
          config: { window: "1w", topN: 12 },
        },
        {
          id: "pools-share",
          frame: "mining-pools-share",
          position: { x: 5, y: 18, w: 3, h: 4 },
          config: { window: "1w", topN: 5 },
        },
        {
          id: "lightning",
          frame: "lightning-stats",
          position: { x: 8, y: 18, w: 4, h: 4 },
          config: { showSplit: true },
        },
        {
          id: "source-note",
          frame: "note",
          position: { x: 0, y: 22, w: 12, h: 3 },
          config: {
            text: "**Source: [mempool.space](https://mempool.space), keyless.** Every card above except the BTC chart reads one public API — no key, no signup, and no same-origin proxy, because mempool.space serves CORS-open. That is why this board still renders on a static host where the SEC, Treasury and FRED boards go empty.\n\nFee tiers are estimates the node derives from what is currently sitting in *its* mempool, so two nodes can disagree during a spike; the projected blocks are a template of what would be mined next, not a promise. Difficulty retargets every 2016 blocks (~2 weeks) and the estimated change drifts until the epoch is most of the way through. Pool attribution comes from coinbase tags, which pools set themselves — treat concentration figures as a strong hint rather than a measurement.",
            align: "left",
          },
        },
      ],
      LOOK_HEARTH,
      sceneBg("ember"), // warm orange light ≈ the board's accent (32)
    ),
  },
  {
    id: "onchain-cycle",
    title: "On-chain Cycle",
    description:
      "Bitcoin's cycle-valuation oscillators on one board — MVRV, NUPL, SOPR, Puell, Mayer and Pi Cycle, each against its own historical extreme, then composited.",
    tags: ["bitcoin", "on-chain", "cycle"],
    spec: spec(
      "On-chain Cycle",
      [
        // ── Valuation: where price sits against on-chain cost basis ───────────
        // The four gauges give the instantaneous read; the two full-history
        // charts underneath give the same two metrics their shape, which is the
        // only way an "extreme" reading means anything.
        {
          id: "hd-valuation",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Valuation",
            subtitle: "Price against on-chain cost basis",
          },
        },
        // Grouped: the four gauges are ONE reading of the same question, so they
        // travel as one card. Same footprint and same 4-across arrangement as
        // when they were four peers — a panel surface around them is what makes
        // "these four together" visible rather than implied.
        group(
          "grp-valuation",
          { x: 0, y: 1, w: 12, h: 3 },
          { columns: 4, rows: 1, gap: 8, panel: true },
          [
            kid(
              "mvrv-1",
              "mvrv",
              { x: 0, y: 0, w: 1, h: 1 },
              { window: "all" },
            ),
            kid(
              "nupl-1",
              "nupl",
              { x: 1, y: 0, w: 1, h: 1 },
              { window: "all" },
            ),
            kid(
              "mayer-1",
              "mayer-multiple",
              { x: 2, y: 0, w: 1, h: 1 },
              { window: "2Y" },
            ),
            kid(
              "puell-1",
              "puell-multiple",
              { x: 3, y: 0, w: 1, h: 1 },
              { window: "1Y" },
            ),
          ],
          "Valuation ratios",
        ),
        // Full-history windows on both charts on purpose: the Z-score and NUPL
        // bands are only legible across multiple halvings.
        {
          id: "mvrv-z-chart",
          frame: "mvrv-zscore-chart",
          position: { x: 0, y: 4, w: 6, h: 4 },
          config: { window: "all" },
        },
        {
          id: "nupl-chart",
          frame: "nupl-cycle-chart",
          position: { x: 6, y: 4, w: 6, h: 4 },
          config: { window: "all" },
        },

        // ── Timing: the signals that fire near turns rather than describe level ──
        {
          id: "hd-timing",
          frame: "heading",
          position: { x: 0, y: 8, w: 12, h: 1 },
          config: {
            title: "Cycle Timing",
            subtitle: "Spend behaviour, moving-average crosses, the checklist",
          },
        },
        // Grouped: the two timing oscillators pair off against the checklist
        // beside them, so they read as one "signals" half of the row.
        group(
          "grp-timing",
          { x: 0, y: 9, w: 6, h: 3 },
          { columns: 2, rows: 1, gap: 8 },
          [
            kid("sopr-1", "sopr", { x: 0, y: 0, w: 1, h: 1 }, { window: "1Y" }),
            kid(
              "pi-cycle-1",
              "pi-cycle",
              { x: 1, y: 0, w: 1, h: 1 },
              { window: "4Y" },
            ),
          ],
          // Untitled for the same reason as traders-desk's pair: `cycle-signals`
          // sits beside this group on the same row, and a label row here would
          // drop these two cards below its top edge.
        ),
        // The capstone card — seven of this board's own metrics checked against
        // their historical extremes with a live "X of N firing" tally, so it gets
        // half the row and an extra row of height for the full checklist.
        {
          id: "cycle-signals-1",
          frame: "cycle-signals",
          title: "Top Signals Firing",
          position: { x: 6, y: 9, w: 6, h: 4 },
          config: { mode: "peak" },
        },
        // Full width: the market-vs-realized crossover is the single most-cited
        // bottom marker on the board and deserves the horizontal resolution.
        {
          id: "realized-1",
          frame: "realized-price",
          position: { x: 0, y: 13, w: 12, h: 4 },
          config: { window: "4Y" },
        },

        // ── Composites: the same signals normalized onto one comparable axis ───
        {
          id: "hd-composite",
          frame: "heading",
          position: { x: 0, y: 17, w: 12, h: 1 },
          config: {
            title: "Composite Reads",
            subtitle: "Unrelated scales normalized 0–100% and overlaid",
          },
        },
        {
          id: "composite-1",
          frame: "cycle-valuation-composite",
          position: { x: 0, y: 18, w: 6, h: 4 },
          config: { window: "2Y" },
        },
        {
          id: "oscillators-1",
          frame: "onchain-oscillator-overlay",
          position: { x: 6, y: 18, w: 6, h: 4 },
          config: { window: "1Y" },
        },
        {
          id: "note-limits",
          frame: "note",
          position: { x: 0, y: 22, w: 12, h: 3 },
          config: {
            align: "left",
            text: "### Reading these oscillators\n\nEvery metric here answers one question: **is Bitcoin expensive relative to what its holders actually paid?** MVRV and NUPL compare market cap to realized cap — the aggregate on-chain cost basis — so a high reading means most coins are sitting in unrealized profit and have something to sell. SOPR says whether coins that *did* move went out in profit or loss. Puell measures miner revenue against its own annual average. Mayer and Pi Cycle are pure price-versus-moving-average, included because they have historically turned in the same weeks as the on-chain set.\n\n**The limits are real.** These are cycle-scale indicators with a handful of observations each — four halvings is not a sample size, and every threshold on this board (MVRV 3, Mayer 2.4, NUPL 75%) was fitted after the fact to the very tops it now claims to predict. They say nothing about *when*, only *how stretched*; MVRV sat above 3 for months in 2017 and never reached it in 2021. Spot ETFs and custodial rehypothecation have also broken the assumption that an on-chain move means a change of owner, which biases SOPR and realized price in ways nobody has cleanly measured yet. Read the composites for agreement between independent signals, not any single card for a call.",
          },
        },
      ],
      LOOK_LAB,
      sceneBg("verdant"),
    ),
  },
  {
    // The institutional-demand board. Every card except the closing context row
    // reads ONE capability (`etf-flows`, keyless via SoSoValue), so the whole
    // upper board costs two requests — one per asset complex — however many cards
    // are on it. That is what makes it affordable to show the same flow series in
    // four different shapes: the trend line, the per-day bars, the per-issuer
    // ranking, and the calendar. They are not redundant — a flow tape only means
    // something when you can see the level, the daily prints, WHO is taking the
    // asset, and the weekly rhythm at the same time.
    //
    // Best-effort caveat: SoSoValue is an unofficial mirror of issuer disclosures,
    // so these cards render empty rather than wrong when it is unavailable. The
    // closing note says so on the board itself.
    id: "etf-flows",
    title: "ETF Flow Desk",
    description:
      "Where institutional money actually went — spot BTC and ETH ETF net flows, per-issuer share, and the weekly rhythm, alongside the allocation context.",
    tags: ["crypto", "etf", "flows", "institutional"],
    spec: spec(
      "ETF Flow Desk",
      [
        {
          id: "hd-tape",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "The Flow Tape",
            subtitle:
              "Spot BTC and ETH ETF net creations — keyless, no signup, best-effort",
          },
        },
        // The two complexes side by side at the same window, because the whole
        // question this board answers is comparative: BTC and ETH ETFs launched
        // 9 months apart and gather at wildly different rates.
        {
          id: "flow-line-btc",
          frame: "etf-flows-chart",
          title: "Bitcoin — net flow trend",
          position: { x: 0, y: 1, w: 6, h: 4 },
          config: { asset: "btc", lookback: "3M" },
        },
        {
          id: "flow-line-eth",
          frame: "etf-flows-chart",
          title: "Ethereum — net flow trend",
          position: { x: 6, y: 1, w: 6, h: 4 },
          config: { asset: "eth", lookback: "3M" },
        },
        // The line above shows direction; the bars show DISPERSION — a quiet month
        // averaging near zero and a violent month averaging near zero look
        // identical on a trend line and nothing alike here.
        {
          id: "flow-bars-btc",
          frame: "etf-flow-bars",
          title: "Bitcoin — daily prints",
          position: { x: 0, y: 5, w: 6, h: 4 },
          config: { asset: "btc", lookback: "1M" },
        },
        // Grouped: the same frame twice, once per asset — a comparison, not two
        // independent cards. Splitting them would leave a BTC issuer list beside
        // whatever happened to land next, which is how a like-for-like read gets
        // misread.
        group(
          "grp-issuers",
          { x: 6, y: 5, w: 6, h: 4 },
          { columns: 2, rows: 1, gap: 8 },
          [
            kid(
              "flows-btc",
              "etf-flows",
              { x: 0, y: 0, w: 1, h: 1 },
              { asset: "btc", limit: 8 },
              "BTC issuers",
            ),
            kid(
              "flows-eth",
              "etf-flows",
              { x: 1, y: 0, w: 1, h: 1 },
              { asset: "eth", limit: 8 },
              "ETH issuers",
            ),
          ],
          // Untitled: `etf-flow-bars` shares this row, so a label row would drop
          // the two issuer lists below its top edge.
        ),

        // ── Issuer share ────────────────────────────────────────────────────
        // The section above is about how much; this one is about who. The two
        // are genuinely different questions — a day of heavy net inflow can
        // still be a day one issuer bled assets to another.
        {
          id: "hd-issuers",
          frame: "heading",
          position: { x: 0, y: 9, w: 12, h: 1 },
          config: {
            title: "Issuer Share",
            subtitle:
              "Who holds the assets, and who is gathering or losing them today",
          },
        },
        // Size = AUM (the stock), tint = today's flow (the change). One tile
        // being large and red is the single most informative thing on the board.
        {
          id: "issuer-treemap",
          frame: "etf-issuer-treemap",
          title: "BTC issuers by AUM",
          position: { x: 0, y: 10, w: 5, h: 4 },
          config: { asset: "btc", limit: 10 },
        },
        {
          id: "issuer-bars-btc",
          frame: "etf-issuer-bars",
          title: "BTC — today's flow by issuer",
          position: { x: 5, y: 10, w: 4, h: 4 },
          config: { asset: "btc", limit: 10 },
        },
        {
          id: "issuer-bars-eth",
          frame: "etf-issuer-bars",
          title: "ETH — today's flow by issuer",
          position: { x: 9, y: 10, w: 3, h: 4 },
          config: { asset: "eth", limit: 8 },
        },
        // Full width and a full year: the calendar is the only card that shows
        // the *cadence* — clustered inflow weeks, the holidays with no print at
        // all, and the fact that flows arrive in runs rather than evenly.
        {
          id: "flow-calendar",
          frame: "etf-flow-calendar",
          title: "Bitcoin — a year of daily prints",
          position: { x: 0, y: 14, w: 12, h: 5 },
          config: { asset: "btc", lookback: "1Y" },
        },

        // ── Allocation context ──────────────────────────────────────────────
        // Flows are a numerator with no denominator. These three give it one:
        // how the market's weight is split, and what the asset being bought
        // actually yields and issues.
        {
          id: "hd-context",
          frame: "heading",
          position: { x: 0, y: 19, w: 12, h: 1 },
          config: {
            title: "Allocation Context",
            subtitle: "What the flows are buying into",
          },
        },
        {
          id: "dominance",
          frame: "bitcoin-dominance",
          position: { x: 0, y: 20, w: 5, h: 3 },
          config: { showTotalMarketCap: true },
        },
        {
          id: "eth-supply",
          frame: "eth-supply",
          position: { x: 5, y: 20, w: 4, h: 3 },
          config: {},
        },
        {
          id: "eth-staking",
          frame: "eth-staking",
          position: { x: 9, y: 20, w: 3, h: 3 },
          config: {},
        },
        {
          id: "note-caveats",
          frame: "note",
          position: { x: 0, y: 23, w: 12, h: 3 },
          config: {
            align: "left",
            text: "### Reading these numbers\n\nA daily net flow is **creations minus redemptions** in the ETF wrapper — the shares the authorised participants struck that day, not the number of coins any one investor bought. It is the cleanest institutional-demand series that exists in crypto, because it is disclosed rather than inferred.\n\nWhat it is **not**: it is not net market demand. A redemption can be one holder rotating from GBTC into IBIT, which prints as a large outflow and a large inflow on the same day and moves nothing on-chain. It is not a price driver you can trade directly — flows are published after the close, so the tape you are reading here has already been priced. And it is not the whole market: perps, spot venues and OTC desks dwarf the ETF complex on most days.\n\nSource is [SoSoValue](https://sosovalue.com), a keyless mirror of issuer disclosures. These cards render **empty rather than wrong** when it is unreachable — a blank flow card means no print was available, never a zero-flow day. Market holidays genuinely have no print, which is why the calendar has gaps.",
          },
        },
      ],
      LOOK_LEDGER,
      sceneBg("tide"),
    ),
  },
  {
    // The rotation board: where attention and capital are moving *within* crypto,
    // rather than what any one asset is worth. Three questions in three sections —
    // what the blue-chip NFT market is doing, which sectors are bidding, and what
    // retail is actually searching for. All fifteen data cards ride exactly TWO
    // CoinGecko capabilities (`nft-market`, `sector-performance`) plus
    // `trending-coins`, so each section costs one request no matter how many ways
    // it is drawn — the treemap, the bubbles and the list on a row are the same
    // response rendered three times.
    id: "nft-sectors",
    title: "NFT & Sector Rotation",
    description:
      "Where crypto capital and attention are rotating — blue-chip NFT floors, sector market caps, and the coins retail is searching for, all off CoinGecko's keyless tier.",
    tags: ["crypto", "nft", "rotation"],
    spec: spec(
      "NFT & Sector Rotation",
      [
        {
          id: "hd-nft",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Blue-chip NFTs",
            subtitle:
              "Floors, caps and sales for ten curated majors — keyless CoinGecko",
          },
        },
        // The two wide views first: size (treemap) and the volume-vs-move
        // relationship (scatter). The scatter is the one that separates a floor
        // moving on real trading from a floor moving on two sales.
        {
          id: "nft-map",
          frame: "nft-treemap",
          position: { x: 0, y: 1, w: 6, h: 4 },
          config: { topN: 8 },
        },
        {
          id: "nft-quadrants",
          frame: "nft-scatter",
          position: { x: 6, y: 1, w: 6, h: 4 },
          config: { limit: 12 },
        },
        // The same response drawn three ways: the readable list, the shape, and
        // the one metric a floor price hides — how many pieces actually changed
        // hands.
        {
          id: "nft-list",
          frame: "nft-collections",
          position: { x: 0, y: 5, w: 4, h: 4 },
          config: { topN: 8 },
        },
        {
          id: "nft-cloud",
          frame: "nft-bubbles",
          position: { x: 4, y: 5, w: 4, h: 4 },
          config: { topN: 8 },
        },
        {
          id: "nft-sales",
          frame: "nft-activity-bars",
          position: { x: 8, y: 5, w: 4, h: 4 },
          config: { limit: 10 },
        },

        // ── Sector rotation ────────────────────────────────────────────────
        // Categories, not coins: L1s, DeFi, AI, memes, RWA. This is the section
        // that answers "which theme is bid today" without needing a view on any
        // single ticker.
        {
          id: "hd-sectors",
          frame: "heading",
          position: { x: 0, y: 9, w: 12, h: 1 },
          config: {
            title: "Sector Rotation",
            subtitle:
              "Market categories ranked by 24h market-cap change — where capital moved",
          },
        },
        {
          id: "sector-map",
          frame: "sector-treemap",
          position: { x: 0, y: 10, w: 6, h: 4 },
          config: { limit: 16 },
        },
        {
          id: "sector-cloud",
          frame: "sector-bubbles",
          position: { x: 6, y: 10, w: 6, h: 4 },
          config: { limit: 16 },
        },
        {
          // The treemap above sizes by cap, so a 40% move in a small category is
          // an invisible tile. The diverging bars rank by the move itself, which
          // is where rotation actually shows up first.
          id: "sector-move",
          frame: "sector-bars",
          position: { x: 0, y: 14, w: 6, h: 4 },
          config: { limit: 12 },
        },
        {
          id: "sector-list",
          frame: "sector-performance",
          position: { x: 6, y: 14, w: 6, h: 4 },
          config: { limit: 12 },
        },

        // ── Attention ──────────────────────────────────────────────────────
        // Search interest, not price. It leads the sector rows about as often as
        // it lags them, which is the point of putting it on the same board.
        {
          id: "hd-attention",
          frame: "heading",
          position: { x: 0, y: 18, w: 12, h: 1 },
          config: {
            title: "Attention",
            subtitle: "What retail is searching for on CoinGecko right now",
          },
        },
        {
          id: "trend-cloud",
          frame: "trending-bubbles",
          position: { x: 0, y: 19, w: 6, h: 5 },
          config: { limit: 10 },
        },
        {
          id: "trend-list",
          frame: "trending-coins",
          position: { x: 6, y: 19, w: 3, h: 5 },
          config: { limit: 7 },
        },
        {
          id: "trend-move",
          frame: "trending-bars",
          position: { x: 9, y: 19, w: 3, h: 5 },
          config: { limit: 7 },
        },

        {
          id: "nft-caveat",
          frame: "note",
          position: { x: 0, y: 24, w: 12, h: 3 },
          config: {
            align: "left",
            text: "**About the NFT data.** CoinGecko's keyless tier has no bulk NFT endpoint, so the provider walks a hand-picked list of ten majors (Bored Ape, CryptoPunks, Pudgy Penguins, Azuki, …) **one `/nfts/{id}` call at a time**, skipping any collection that fails rather than dropping the whole card. That has three consequences worth knowing before you read a number off this board:\n\n- The set is **curated, not ranked** — a collection that mooned last night is not here unless it was already on the list.\n- The sequential walk shares this provider's rate limit with the sector and trending rows above, so the NFT cards are cached on a **long ~45 minute TTL** and lag the others.\n- A missing tile means that one collection's call was skipped, not that it went to zero.\n\nThe sector and trending sections have proper bulk endpoints and refresh on a normal short cycle.",
          },
        },
      ],
      LOOK_GALLERY,
      sceneBg("nebula"), // violet scene ≈ the gallery accent (292)
    ),
  },
  {
    // The options board. Deliberately NOT folded into "Derivatives Desk": that
    // board reads perp funding and open interest — the linear side of the market,
    // where a position is a direction. This one reads the OPTIONS book, where a
    // position is a distribution: which strikes are loaded, what the market pays
    // for each tail, and where the term structure pins price.
    //
    // Every card on the board reads ONE Deribit capability (`options-summary`,
    // plus `volatility-index` for the spread chart), so the whole surface costs a
    // handful of requests, not one per strike ladder. It is the densest single-
    // provider board in the set, which is what makes it a good showcase for
    // capability routing: ten data cards, one source, no key.
    id: "vol-surface",
    title: "Volatility Surface",
    description:
      "The Deribit options book, read as a surface — vol indices, the smile, OI across strike and expiry, and where max pain pins each dated book.",
    tags: ["options", "volatility", "derivatives"],
    spec: spec(
      "Volatility Surface",
      [
        {
          id: "hd-level",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Volatility Surface",
            subtitle: "Deribit options — the level, the skew and the term",
          },
        },
        // The level first: what the market is charging for optionality at all,
        // before any question of which strike. A 3M window rather than 1M so a
        // vol regime change is visible as a shape, not just a number.
        {
          id: "dvol-spread",
          frame: "options-vol-spread",
          title: "BTC vs ETH Implied Vol",
          position: { x: 0, y: 1, w: 8, h: 4 },
          config: { lookback: "3M" },
        },
        // The one scalar on the board. On open-interest basis, not volume:
        // standing positioning is the slower, more honest read, and the flow
        // side gets its own section below.
        {
          id: "pc-gauge",
          frame: "put-call-gauge",
          position: { x: 8, y: 1, w: 4, h: 4 },
          config: { currency: "BTC", basis: "oi" },
        },
        // The surface proper — the only card that shows strike AND expiry at
        // once. Everything below it is a slice through this.
        {
          id: "oi-ladder",
          frame: "options-oi-ladder-heatmap",
          position: { x: 0, y: 5, w: 8, h: 5 },
          config: { currency: "BTC", expiries: 8, buckets: 12 },
        },
        // The term structure of the pin, as % from spot — which dated books are
        // holding price up and which are holding it down.
        {
          id: "maxpain-term",
          frame: "options-max-pain-multi",
          position: { x: 8, y: 5, w: 4, h: 5 },
          config: { currency: "BTC", expiries: 8 },
        },

        // ── The smile ──────────────────────────────────────────────────────
        // The cross-section: one expiry, IV by strike. Both books side by side
        // because the SHAPES diverge even when the levels agree — ETH's smile
        // routinely carries a fatter call wing than BTC's, and a single-asset
        // card can never show that.
        {
          id: "hd-smile",
          frame: "heading",
          position: { x: 0, y: 10, w: 12, h: 1 },
          config: {
            title: "The Smile",
            subtitle: "Nearest expiry — what each tail costs, strike by strike",
          },
        },
        {
          id: "smile-btc",
          frame: "options-vol-smile",
          title: "BTC Vol Smile",
          position: { x: 0, y: 11, w: 6, h: 4 },
          config: { currency: "BTC" },
        },
        {
          id: "smile-eth",
          frame: "options-vol-smile",
          title: "ETH Vol Smile",
          position: { x: 6, y: 11, w: 6, h: 4 },
          config: { currency: "ETH" },
        },
        // The same expiry read two other ways: where the OI actually sits (net
        // call-minus-put), and what it would cost writers to settle there.
        {
          id: "oi-skew-btc",
          frame: "options-oi-skew",
          position: { x: 0, y: 15, w: 6, h: 4 },
          config: { currency: "BTC", strikes: 16 },
        },
        {
          id: "maxpain-btc",
          frame: "options-max-pain",
          position: { x: 6, y: 15, w: 6, h: 4 },
          config: { currency: "BTC" },
        },

        // ── Flow vs positioning ────────────────────────────────────────────
        // The last question the ladders can't answer: is today's flow agreeing
        // with the standing book or fighting it? Each card plots both bases at
        // once, so a divergence reads as two bars pointing opposite ways.
        {
          id: "hd-flow",
          frame: "heading",
          position: { x: 0, y: 19, w: 12, h: 1 },
          config: {
            title: "Flow vs Positioning",
            subtitle: "24h volume skew against standing open-interest skew",
          },
        },
        {
          id: "flow-btc",
          frame: "options-flow-skew",
          title: "BTC — Flow vs OI",
          position: { x: 0, y: 20, w: 6, h: 4 },
          config: { currency: "BTC" },
        },
        {
          id: "flow-eth",
          frame: "options-flow-skew",
          title: "ETH — Flow vs OI",
          position: { x: 6, y: 20, w: 6, h: 4 },
          config: { currency: "ETH" },
        },
        {
          id: "read-me",
          frame: "note",
          title: "How to read this board",
          position: { x: 0, y: 24, w: 12, h: 4 },
          config: {
            text: "**Max pain** is the settlement strike at which option writers pay out the least — the point where the most contracts expire worthless. It is an *arithmetic property of the open book*, not a forecast: it moves whenever positioning moves, and it is recomputed from scratch on every poll. Price does drift toward it into a large expiry, but the honest reading is “here is where the book is heaviest”, not “here is where price is going”.\n\n**Skew** is the asymmetry between the call and put sides. On the OI-skew card that is the standing book; on the flow-skew cards it is netted against 24h volume, so the two bases fighting each other is the interesting state — fresh flow buying calls into a put-heavy book is a different market from one where both agree.\n\n**The smile** is implied vol by strike for one expiry. Its *shape* is the signal: a steep put wing means the market pays up for downside protection, a lifted call wing means it is paying for upside convexity. A flat smile is a market pricing no tail at all.\n\nCaveats worth holding onto: every card here reads **Deribit only**, which is the deepest crypto options venue but not the whole market — OTC and CME books are invisible. Illiquid far strikes carry wide, stale marks, so the wings of the smile are the least trustworthy part of it. And OI is a *stock*, not a flow: a large number at a strike says a position exists, never who is long it or why.",
            align: "left",
          },
        },
      ],
      LOOK_VOLATILE,
      sceneBg("dusk"),
    ),
  },
  {
    // The carry board. Every other showcase asks what a price is doing; this one
    // asks what it costs to hold the position — the funding leg that decides
    // whether a basis trade is income or a slow bleed. Deliberately disjoint
    // from "Derivatives Desk", which owns the three single-symbol funding cards
    // (funding-rate-chart, funding-comparison, open-interest): this board is the
    // cross-sectional view — the whole universe ranked, bucketed and mapped —
    // so the two never render the same card twice.
    //
    // Reading order is three questions, one per section: what is funding right
    // now and what has it paid (top), where do the venues disagree (middle),
    // and where is that disagreement backed by enough size to squeeze (bottom).
    id: "funding-carry",
    title: "Funding & Carry",
    description:
      "What it costs to hold a perp — funding ranked across the whole Hyperliquid universe, its cross-venue spreads, and the open interest crowded behind them.",
    tags: ["derivatives", "funding", "crypto"],
    spec: spec(
      "Funding & Carry",
      [
        {
          id: "hd-now",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Funding & Carry",
            subtitle: "The cost of holding, ranked across the perp universe",
          },
        },
        // The current extremes — the most expensive (and most rewarded) sides to
        // be on at this instant, crypto and HIP-3 equities ranked together.
        {
          id: "leaderboard",
          frame: "funding-leaderboard-bars",
          position: { x: 0, y: 1, w: 4, h: 4 },
          config: { limit: 12 },
        },
        // …and what those rates have actually added up to. A rate is a claim;
        // cumulative carry is the receipt, which is the number a basis book is
        // marked against.
        {
          id: "carry",
          frame: "funding-carry-area",
          position: { x: 4, y: 1, w: 8, h: 4 },
          config: { symbols: ["BTC", "ETH", "SOL"], lookback: "1M" },
        },
        // Two views of the SAME hourly BTC prints, because the pair answers
        // questions neither can alone: the calendar shows whether the carry was
        // a steady drip or three violent days, the histogram shows the shape the
        // trade is actually priced off (how often you get paid, and how far the
        // tail reaches when you don't).
        {
          id: "calendar",
          frame: "funding-calendar",
          position: { x: 0, y: 5, w: 6, h: 4 },
          config: { symbol: "BTC", lookback: "3M", weekStart: "monday" },
        },
        {
          id: "histogram",
          frame: "funding-distribution",
          position: { x: 6, y: 5, w: 6, h: 4 },
          config: { symbol: "BTC", lookback: "3M" },
        },

        // ── Venue dispersion ──────────────────────────────────────────────
        // Funding is not one number: it is set per venue, per hour, by that
        // venue's own book. The gap between them is the arb.
        {
          id: "hd-venue",
          frame: "heading",
          position: { x: 0, y: 9, w: 12, h: 1 },
          config: {
            title: "Venue dispersion",
            subtitle:
              "Where Hyperliquid, Binance and Bybit disagree on the price of time",
          },
        },
        // The ranked spread answers "how wide"; the heatmap answers "which side
        // of it is which venue on" — you need both before the spread is tradable.
        {
          id: "spread",
          frame: "funding-spread-bars",
          position: { x: 0, y: 10, w: 4, h: 4 },
          config: { limit: 10 },
        },
        {
          id: "venue-map",
          frame: "funding-venue-heatmap",
          position: { x: 4, y: 10, w: 8, h: 4 },
          config: { limit: 10 },
        },

        // ── Crowding & liquidity ──────────────────────────────────────────
        // A stretched rate only matters if there is size behind it, and only
        // exits cleanly if the book is deep enough to leave.
        {
          id: "hd-crowding",
          frame: "heading",
          position: { x: 0, y: 14, w: 12, h: 1 },
          config: {
            title: "Crowding & liquidity",
            subtitle:
              "Which stretched rates have the size behind them to squeeze",
          },
        },
        // The quadrant that names the trade: stretched funding on the y-axis,
        // a big open-interest bubble, and a price already run — that corner is
        // the crowded long, and it is where liquidations start.
        {
          id: "crowding",
          frame: "funding-crowding-scatter",
          position: { x: 0, y: 15, w: 6, h: 4 },
          config: { limit: 40 },
        },
        {
          id: "oi",
          frame: "oi-treemap",
          position: { x: 6, y: 15, w: 6, h: 4 },
          config: { limit: 14 },
        },
        // Open interest says where capital SITS; volume says where it is moving
        // today. The scatter separates the busy-and-moving from the busy-and-flat.
        {
          id: "vol-movers",
          frame: "volume-movers-scatter",
          position: { x: 0, y: 19, w: 6, h: 4 },
          config: { limit: 40 },
        },
        {
          id: "vol-share",
          frame: "volume-share-donut",
          position: { x: 6, y: 19, w: 3, h: 4 },
          config: { limit: 8 },
        },
        // Basis rather than spread: mark-vs-oracle in bps is the same stretch
        // funding is paid to close, so it is the cross-check on every rate above.
        {
          id: "basis",
          frame: "liquidity-basis-bars",
          position: { x: 9, y: 19, w: 3, h: 4 },
          config: { metric: "basis", limit: 10 },
        },
        {
          id: "btc-volume",
          frame: "ohlcv-volume-bars",
          position: { x: 0, y: 23, w: 8, h: 4 },
          config: { symbol: "BTC", interval: "4h" },
        },
        {
          id: "explainer",
          frame: "note",
          position: { x: 8, y: 23, w: 4, h: 4 },
          config: {
            text: "**What funding is.** A perp has no expiry, so nothing forces it back to spot. Funding does the forcing: every hour, whichever side is trading rich pays the other. Positive funding means longs pay shorts — the market is leaning long and paying for the privilege.\n\nSo the rate is a *price of positioning*, not a price of the asset. Hold a perp for a month at 30% annualised funding and you have paid 2.5% before the trade is right or wrong.\n\n**Why the venue spread matters.** Each venue sets its own rate off its own book, so the same coin can pay on one and charge on another. That gap is a delta-neutral trade: long where funding is negative, short where it is positive, collect the difference. It is also a warning — a rate stretched far past its neighbours usually means one venue's longs are crowded, and crowded longs are what liquidation cascades are made of.",
            align: "left",
          },
        },
      ],
      LOOK_CARRY,
      sceneBg("verdant"),
    ),
  },
  {
    id: "yield-stables",
    title: "Yield & Stablecoins",
    description:
      "What DeFi actually pays and where the stablecoin float sits — the yield distribution behind the headline pools, the incentive-vs-organic split, and the capital that funds it.",
    tags: ["defi", "yield", "stablecoins"],
    spec: spec(
      "Yield & Stablecoins",
      [
        {
          id: "hd-yield",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "What DeFi pays",
            subtitle: "Every pool above the TVL floor — not just the top ten",
          },
        },
        // The distribution first, then the scatter: a headline APY only means
        // something against the shape of the sample it was drawn from.
        {
          id: "yield-hist",
          frame: "yield-distribution",
          position: { x: 0, y: 1, w: 5, h: 4 },
          config: {
            stablecoinOnly: false,
            minTvlUsd: 5_000_000,
            maxApy: 150,
          },
        },
        {
          id: "yield-scatter",
          frame: "yield-scatter",
          position: { x: 5, y: 1, w: 7, h: 4 },
          config: { limit: 45, maxApy: 60, stablecoinOnly: false },
        },
        // Composition is deliberately stablecoin-only — with no impermanent-loss
        // premium in the sample, whatever is left on the reward axis is pure
        // token incentive. The pie next to it says how much of the whole yield
        // pool carries IL exposure at all.
        {
          id: "yield-composition",
          frame: "yield-composition-scatter",
          title: "Organic vs Incentive APY — Stables",
          position: { x: 0, y: 5, w: 5, h: 5 },
          config: { limit: 40, stablecoinOnly: true },
        },
        {
          id: "yield-momentum",
          frame: "yield-momentum-bars",
          position: { x: 5, y: 5, w: 3, h: 5 },
          config: { limit: 12, minTvlUsd: 5_000_000 },
        },
        {
          id: "yield-risk",
          frame: "yield-risk-pie",
          position: { x: 8, y: 5, w: 4, h: 5 },
        },
        {
          id: "hd-float",
          frame: "heading",
          position: { x: 0, y: 10, w: 12, h: 1 },
          config: {
            title: "The float and the capital",
            subtitle: "Where stablecoins sit, and which slice of DeFi holds it",
          },
        },
        {
          id: "stable-chains",
          frame: "stablecoin-chains",
          position: { x: 0, y: 11, w: 5, h: 4 },
          config: { limit: 12 },
        },
        {
          id: "tvl-category",
          frame: "protocol-tvl-by-category",
          position: { x: 5, y: 11, w: 4, h: 4 },
          config: { limit: 10 },
        },
        {
          id: "defi-rev",
          frame: "defi-revenue",
          position: { x: 9, y: 11, w: 3, h: 4 },
        },
        // Both stacked areas answer "is the mix shifting?", which the ranked
        // snapshots above cannot: TVL on the capital side, volume on the flow side.
        {
          id: "tvl-share",
          frame: "protocol-tvl-share-area",
          position: { x: 0, y: 15, w: 6, h: 4 },
          config: {
            protocols: ["lido", "aave", "eigenlayer", "uniswap"],
            lookback: "3M",
          },
        },
        {
          id: "dex-share",
          frame: "dex-volume-share-area",
          position: { x: 6, y: 15, w: 6, h: 4 },
          config: {
            protocols: ["uniswap", "pancakeswap", "aerodrome-slipstream"],
            lookback: "3M",
          },
        },
        {
          id: "hd-eth",
          frame: "heading",
          position: { x: 0, y: 19, w: 12, h: 1 },
          config: {
            title: "Ethereum's own rate",
            subtitle: "The staking yield every DeFi APY is quoted against",
          },
        },
        // Grouped: yield, supply and issuance are one argument — the rate, what
        // backs it, and what it costs to mint. The section heading above already
        // says so; the group makes the board itself say it.
        group(
          "grp-eth-rate",
          { x: 0, y: 20, w: 12, h: 3 },
          { columns: 12, rows: 1, gap: 8 },
          [
            kid("eth-apr", "eth-staking", { x: 0, y: 0, w: 3, h: 1 }),
            kid("eth-supply", "eth-supply", { x: 3, y: 0, w: 4, h: 1 }),
            kid("eth-issuance", "eth-issuance-impact", {
              x: 7,
              y: 0,
              w: 5,
              h: 1,
            }),
          ],
          "Ethereum's own rate",
        ),
        {
          id: "yield-note",
          frame: "note",
          position: { x: 0, y: 23, w: 12, h: 3 },
          config: {
            text: "**Advertised APY is not risk-adjusted.** Every yield number on this board is a quoted rate, not an expected return: it carries no charge for smart-contract risk, no haircut for the depeg risk in a stablecoin pair, and — where the reward axis of the composition scatter is doing the work — no guarantee the emissions funding it survive the next epoch. The impermanent-loss donut splits pools by *exposure*, not by realised loss.\n\nPool, TVL, category and DEX-volume figures come from [DefiLlama](https://defillama.com) (keyless public API, daily granularity on the stacked areas); ETH issuance, burn and staking APR come from ultrasound.money. Nothing here is a recommendation.",
            align: "left",
          },
        },
      ],
      LOOK_MINT,
      sceneBg("tide"),
    ),
  },
  {
    // The board about people rather than prices. Every other macro board here
    // reads a market's opinion of the economy — yields, spreads, stress indices,
    // all of them repriced continuously by someone with money at risk. This one
    // reads the economy itself, as counted: the BLS's household and establishment
    // surveys and the Treasury's own books. Nothing on it ticks, and that is the
    // point — the labor and price series move once a month, on a published
    // release calendar, which is why the board ends with a countdown to the next
    // print instead of a live feed.
    //
    // Both halves are deliberately paired with their chart-first sibling: the
    // Labor Market scalar next to Payrolls Bars, the National Debt total next to
    // its composition area. The scalar answers "what is it", the chart answers
    // "how did it get there", and the pair costs ONE request — each pair reads a
    // single capability (`macro-series`, `national-debt`), so the second card is
    // free.
    id: "labor-inflation",
    title: "Labor & Inflation",
    description:
      "Jobs, wages and the price level as the statistical agencies actually publish them — BLS payrolls, participation and CPI beside the Treasury's own debt books, all keyless.",
    tags: ["macro", "labor", "inflation"],
    spec: spec(
      "Labor & Inflation",
      [
        // ── Labor ───────────────────────────────────────────────────────────
        {
          id: "hd-labor",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "Labor",
            subtitle:
              "The BLS household and establishment surveys — monthly, revised twice",
          },
        },
        // The headline pair: the level, then the flow that produced it.
        {
          id: "labor-snapshot",
          frame: "labor-market",
          position: { x: 0, y: 1, w: 4, h: 4 },
          config: { months: 24 },
        },
        {
          // Two full years of prints, because a single month of payrolls is
          // mostly revision noise — the shape of the bars is the signal.
          id: "payrolls",
          frame: "payrolls-bars",
          position: { x: 4, y: 1, w: 8, h: 4 },
          config: { months: 24 },
        },
        {
          // The question a falling unemployment rate can't answer on its own:
          // did people find work, or stop looking? Participation is what
          // separates the two, so the pair is plotted on one chart.
          id: "participation",
          frame: "labor-force-flow",
          position: { x: 0, y: 5, w: 6, h: 4 },
          config: { months: 36 },
        },
        {
          // The bridge card between the two halves of the board — earnings
          // growth against CPI. It belongs to labor and to prices equally, and
          // it is the only card here that answers whether a paycheck went
          // further than last year.
          id: "real-wages",
          frame: "real-wages",
          position: { x: 6, y: 5, w: 6, h: 4 },
          config: { months: 36 },
        },

        // ── Prices ──────────────────────────────────────────────────────────
        {
          id: "hd-prices",
          frame: "heading",
          position: { x: 0, y: 9, w: 12, h: 1 },
          config: {
            title: "Prices",
            subtitle: "CPI-U all items, and what it costs when jobs go with it",
          },
        },
        {
          id: "cpi",
          frame: "inflation-pulse",
          position: { x: 0, y: 10, w: 4, h: 4 },
          config: { months: 24 },
        },
        {
          // Inflation plus unemployment, stacked. A crude measure by design —
          // it weights a point of each equally — but it is the one series that
          // refuses to let a good number on one side hide a bad one on the other.
          id: "misery",
          frame: "misery-index",
          position: { x: 4, y: 10, w: 4, h: 4 },
          config: { months: 36 },
        },
        {
          // Release dates, not forecasts. Every other card on this board is
          // already stale by construction; this one says how stale, and when
          // the next print lands.
          id: "calendar",
          frame: "macro-calendar",
          position: { x: 8, y: 10, w: 4, h: 4 },
          config: {
            limit: 6,
            events: [
              { date: "2026-08-12", label: "CPI — July" },
              { date: "2026-09-04", label: "Jobs report — August" },
              { date: "2026-09-11", label: "CPI — August" },
              { date: "2026-09-16", label: "FOMC decision" },
              { date: "2026-10-02", label: "Jobs report — September" },
              { date: "2026-10-13", label: "CPI — September" },
              { date: "2026-10-28", label: "FOMC decision" },
            ],
          },
        },

        // ── The public ledger ───────────────────────────────────────────────
        // What the same government owes while it counts the above. Kept on this
        // board rather than the rates board because the interesting comparison
        // is against wages and prices — a debt total means little until you ask
        // what a dollar of it buys.
        {
          id: "hd-ledger",
          frame: "heading",
          position: { x: 0, y: 14, w: 12, h: 1 },
          config: {
            title: "The Public Ledger",
            subtitle:
              "Treasury debt and what it costs to carry — daily, official",
          },
        },
        {
          // showSplit off: the card beside it IS the split, over time and at
          // full width. Printing the same two numbers twice would only make the
          // scalar noisier.
          id: "debt-total",
          frame: "national-debt",
          position: { x: 0, y: 15, w: 4, h: 4 },
          config: { trendDays: 365, showSplit: false },
        },
        {
          id: "debt-composition",
          frame: "treasury-debt-composition-area",
          position: { x: 4, y: 15, w: 8, h: 4 },
          config: { trendDays: 365 },
        },
        {
          // The carry: what the outstanding stock actually pays, by security
          // class. Ranked, so the long-dated legacy coupons separate visibly
          // from the bills rolling at today's rate.
          id: "avg-rates",
          frame: "treasury-avg-rate-bars",
          position: { x: 0, y: 19, w: 6, h: 4 },
          config: { limit: 14 },
        },
        {
          // The one market-priced card on an otherwise survey-based board, and
          // the reason it earns a place: it is the fastest of these series by
          // far (daily, not monthly), so when the stacked categories move before
          // the next CPI print, the market has an opinion the surveys haven't
          // caught up to yet.
          id: "stress-categories",
          frame: "ofr-stress-category-area",
          position: { x: 6, y: 19, w: 6, h: 4 },
          config: { trendDays: 90 },
        },
        {
          id: "provenance",
          frame: "note",
          position: { x: 0, y: 23, w: 12, h: 3 },
          config: {
            text: "**Everything here is an official published series** — the Bureau of Labor Statistics' payroll, participation, earnings and CPI prints, the Treasury's Debt to the Penny and average interest rates, and the OFR's stress index. None of it is modelled, estimated or forecast by zframes.\n\n**Read the lag.** The labor and CPI series describe a month that ended weeks ago, and the BLS revises payrolls twice after first publication — the most recent bar on the payrolls chart is the least trustworthy one on it. Only the Treasury and OFR cards update daily.\n\n**These route through the runtime's proxy.** BLS, Treasury and OFR all refuse cross-origin browser requests, so `zframes serve` relays them same-origin. On a static host with no runtime, every card above blanks.",
          },
        },
      ],
      LOOK_BUREAU,
      // Aurora, not Ember: the warm end of the palette already carries three
      // boards and two of them are serif, which is what made the first draft of
      // this one indistinguishable from Macro & Rates. 218 ink against Aurora's
      // authored 242 is a 24° rotate — still cold, still quiet.
      sceneBg("aurora"),
    ),
  },
  {
    // The workflow board. Every other curated board answers "what is the market
    // doing"; this one answers "am I ready, how big, and did it work" — the
    // three questions that decide the P&L of the same read. It is deliberately
    // the only board on the landing that fetches almost nothing: the session
    // frames compute from bundled exchange hours and holiday tables, the sizing
    // frames are client-side arithmetic over numbers the trader typed, and the
    // journal frames read the trader's own log. That is the point — it shows
    // that a zframes board is a place you work, not just a place you watch.
    //
    // Note the sample content is a coherent single setup rather than filler: the
    // calculator, risk/reward and break-even cards are all describing the same
    // NVDA long, so the row reads as one decision sized three ways.
    id: "traders-desk",
    title: "Trader's Desk",
    description:
      "The discipline layer — session clocks, position sizing, and a decision journal. Almost nothing here is market data; it is the trader's own process, laid out as a board.",
    tags: ["tools", "journal", "workflow"],
    spec: spec(
      "Trader's Desk",
      [
        // ── The session ───────────────────────────────────────────────────
        // Timing first, because half the sizing mistakes are really timing
        // mistakes — sized for a trend day, entered forty minutes before a
        // close. All five cards compute client-side from bundled exchange
        // hours + the 2026 holiday table, so this whole zone costs no requests.
        {
          id: "hd-session",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "The Session",
            subtitle:
              "Where the trading day actually is — computed client-side, no data provider",
          },
        },
        {
          id: "hours",
          frame: "market-hours",
          position: { x: 0, y: 1, w: 4, h: 4 },
          config: {
            exchanges: ["NYSE", "NASDAQ", "LSE", "TSE", "HKEX", "SGX"],
            sort: "status",
          },
        },
        {
          // Sorted by status above, listed by date here: the two answer
          // different questions ("can I trade now" vs "which day is a trap").
          id: "holidays",
          frame: "holiday-calendar",
          title: "Closures Ahead",
          position: { x: 4, y: 1, w: 4, h: 4 },
          config: { exchange: "NYSE", count: 5, label: "New York" },
        },
        // Grouped: both cards answer "how much time is left" at two scales —
        // this session, and the next decision. They were already stacked in one
        // column; as a group they stay stacked wherever the board is rearranged.
        group(
          "grp-clocks",
          { x: 8, y: 1, w: 4, h: 4 },
          { columns: 1, rows: 2, gap: 8 },
          [
            kid(
              "session-nyse",
              "session-progress",
              { x: 0, y: 0, w: 1, h: 1 },
              { exchange: "NYSE", label: "Cash session", showCountdown: true },
            ),
            // A dated anchor rather than a rolling one: the next FOMC decision,
            // pinned to New York so the instant is unambiguous wherever the
            // board is opened.
            kid(
              "fomc",
              "countdown",
              { x: 0, y: 1, w: 1, h: 1 },
              {
                target: "2026-09-17T14:00:00-04:00",
                label: "FOMC Decision",
                showTarget: true,
              },
            ),
          ],
          // No group label, deliberately: a titled group reserves a row for it,
          // which pushes its children below the tops of the ungrouped cards
          // beside them on the same row. Both children already carry their own
          // titles, so the label was decoration bought with a ragged row. Groups
          // that span the full width have no neighbour to misalign against and
          // do carry one.
        ),
        {
          // Full width because it is a strip, not a panel — the week read left
          // to right, with the holidays above flagged in place.
          id: "week",
          frame: "day-meter",
          position: { x: 0, y: 5, w: 12, h: 2 },
          config: { exchange: "NYSE", weekdaysOnly: true, label: "This week" },
        },

        // ── Sizing & risk ─────────────────────────────────────────────────
        // One setup, sized three ways: 10k account risking 1% on a 182.40 entry
        // with a 174.80 stop, the same levels carried into the R:R planner, and
        // the fills that entry was actually built from. Written as one trade on
        // purpose — three unrelated example trades would teach nothing about how
        // the cards relate.
        {
          id: "hd-sizing",
          frame: "heading",
          position: { x: 0, y: 7, w: 12, h: 1 },
          config: {
            title: "Sizing & Risk",
            subtitle:
              "One setup, sized before it is taken — pure client-side math",
          },
        },
        // Grouped, and the clearest case on any of these boards: all four cards
        // describe ONE trade (a 25k account risking 1% on a 182.40 entry with a
        // 174.80 stop). Splitting them apart on a rearrange would leave four
        // cards quoting the same numbers with nothing saying they belong to the
        // same setup — the panel surface is that statement.
        group(
          "grp-setup",
          { x: 0, y: 8, w: 12, h: 4 },
          { columns: 4, rows: 1, gap: 8, panel: true },
          [
            kid(
              "sizer",
              "calculator",
              { x: 0, y: 0, w: 1, h: 1 },
              {
                account: 25000,
                riskPct: 1,
                entry: 182.4,
                stop: 174.8,
                currency: "$",
              },
              "Position Size",
            ),
            kid(
              "rr",
              "risk-reward",
              { x: 1, y: 0, w: 1, h: 1 },
              {
                entry: 182.4,
                stop: 174.8,
                target: 205.2,
                direction: "long",
                label: "NVDA · 3R",
              },
            ),
            // Scaled in over three fills, so the average entry is not the number
            // on the ticket — which is exactly the case where guessing it costs
            // you the stop distance.
            kid(
              "avg",
              "breakeven",
              { x: 2, y: 0, w: 1, h: 1 },
              {
                fills: [
                  { price: 181.2, size: 12 },
                  { price: 183.05, size: 8 },
                  { price: 184.6, size: 13 },
                ],
                currentPrice: 189.7,
                label: "NVDA long",
              },
            ),
            // The gate the three cards to its left exist to satisfy. Checked
            // state persists into the dashboard, so a half-finished routine is
            // still half-finished after a reload.
            kid(
              "preflight",
              "checklist",
              { x: 3, y: 0, w: 1, h: 1 },
              {
                title: "Pre-flight",
                items: [
                  "Higher-timeframe bias agrees",
                  "Stop is at a level, not a number",
                  "Size respects the 1% budget",
                  "No print inside the hold window",
                  "I can name what invalidates this",
                ],
                checked: [true, true, true, false, false],
              },
            ),
          ],
          "One setup, sized",
        ),

        // ── The journal ───────────────────────────────────────────────────
        // The loop the board is built around: log the call at the live price,
        // watch it mark, read it back graded. Log and Open are the only cards
        // on this board that touch a provider at all (Hyperliquid quotes), and
        // they use it to price the trader's own decisions, not to show a market.
        {
          id: "hd-journal",
          frame: "heading",
          position: { x: 0, y: 12, w: 12, h: 1 },
          config: {
            title: "The Journal",
            subtitle: "Log the call, watch it mark, read it back graded",
          },
        },
        // Grouped: log → open → graded is one loop read left to right, and the
        // order carries the meaning. As three peers a rearrange could put
        // "graded" before "log"; as a group the sequence is structural.
        group(
          "grp-journal",
          { x: 0, y: 13, w: 12, h: 5 },
          { columns: 3, rows: 1, gap: 8 },
          [
            kid("log", "journal-log", { x: 0, y: 0, w: 1, h: 1 }, {}),
            kid("open", "journal-open", { x: 1, y: 0, w: 1, h: 1 }, { max: 6 }),
            kid(
              "results",
              "journal-results",
              { x: 2, y: 0, w: 1, h: 1 },
              { max: 6 },
            ),
          ],
          "The loop",
        ),
        {
          id: "score",
          frame: "journal-score",
          position: { x: 0, y: 18, w: 4, h: 3 },
          config: {},
        },
        {
          // Pinned and always visible, unlike the rotating `quote` frame — a
          // rule you have to wait twelve seconds to read is not a rule.
          id: "rules",
          frame: "rules-card",
          position: { x: 4, y: 18, w: 4, h: 3 },
          config: {
            title: "Desk rules",
            rules: [
              "No trade without a written invalidation",
              "One percent, whatever the conviction",
              "Never widen a stop; you may only cut",
              "Two losses closes the session",
              "Log it at the price, not at the memory",
            ],
          },
        },
        {
          id: "about",
          frame: "note",
          title: "About this board",
          position: { x: 8, y: 18, w: 4, h: 3 },
          config: {
            text: "**Nothing on this board is live market data.** The clocks are computed from bundled exchange hours, the sizing cards are arithmetic over numbers you typed, and the journal is your own log — the only feed anywhere here is the quote the journal marks your open calls against.\n\nThat is deliberate. The other boards tell you what the market did; this one is the part you control. Edit every value on it — the fills, the rules, the checklist, the countdown — because the defaults are somebody else's trade.",
            align: "left",
          },
        },
      ],
      LOOK_COCKPIT,
      sceneBg("aurora"),
    ),
  },
  {
    // The only board built entirely out of *beliefs*. Every other showcase
    // shows what happened — a price, a yield, a TVL. This one shows what the
    // crowd currently thinks will happen, and how it feels about it: real-money
    // Polymarket odds up top, the fear/greed mood in the middle, and the tape
    // plus the dispersion of actual returns at the bottom as the reality check.
    // Ordered that way on purpose — expectation, then emotion, then outcome.
    //
    // Cost note: the four Polymarket cards all read the one `prediction-markets`
    // capability and the two mood cards the one `sentiment` capability, so the
    // top two-thirds of the board is two upstream requests, not six.
    id: "crowd-signal",
    title: "Crowd Signal",
    description:
      "What the crowd believes, priced — live Polymarket odds, the fear & greed mood, the news tape, and the return distribution that eventually settles the argument.",
    tags: ["sentiment", "prediction-markets", "crypto"],
    spec: spec(
      "Crowd Signal",
      [
        // ── The odds ──────────────────────────────────────────────────────
        // Four views of the same Polymarket feed, because a probability alone
        // is nearly useless: the list gives the question, the bars the ranking,
        // the scatter the conviction-vs-liquidity trade-off, and the bubbles the
        // shape of the whole board at a glance.
        {
          id: "hd-odds",
          frame: "heading",
          position: { x: 0, y: 0, w: 12, h: 1 },
          config: {
            title: "The Odds",
            subtitle:
              "Live Polymarket — real money, staked on what happens next",
          },
        },
        {
          id: "pm-list",
          frame: "prediction-markets",
          title: "Highest-Volume Markets",
          position: { x: 0, y: 1, w: 4, h: 5 },
          config: { limit: 8 },
        },
        {
          id: "pm-bars",
          frame: "prediction-market-bars",
          position: { x: 4, y: 1, w: 5, h: 5 },
          config: { limit: 10 },
        },
        // The mood dial sits inside the odds block rather than with the other
        // sentiment cards: it is the one number that says how the crowd feels
        // while it is placing all of those bets.
        {
          id: "mood-dial",
          frame: "sentiment-gauge",
          title: "Crowd Mood",
          position: { x: 9, y: 1, w: 3, h: 5 },
          config: {},
        },
        {
          // Conviction on x, money on y (log) — the quadrant that matters is
          // high-probability *and* high-volume; a 95% market with no volume is
          // an opinion nobody paid for.
          id: "pm-scatter",
          frame: "prediction-market-scatter",
          position: { x: 0, y: 6, w: 6, h: 5 },
          config: { limit: 20 },
        },
        {
          id: "pm-bubbles",
          frame: "prediction-markets-bubble",
          position: { x: 6, y: 6, w: 6, h: 5 },
          config: { limit: 14 },
        },

        // ── Mood ──────────────────────────────────────────────────────────
        // The same fear & greed series read two ways. The line shows the swing;
        // the calendar shows the *persistence* — how many consecutive weeks the
        // market stayed afraid, which a wandering line hides completely.
        {
          id: "hd-mood",
          frame: "heading",
          position: { x: 0, y: 11, w: 12, h: 1 },
          config: {
            title: "Mood",
            subtitle:
              "A year of fear and greed — the swing, and how long it stuck",
          },
        },
        {
          id: "fg-chart",
          frame: "fear-greed-chart",
          position: { x: 0, y: 12, w: 6, h: 4 },
          config: { days: 365 },
        },
        {
          id: "fg-calendar",
          frame: "sentiment-calendar",
          position: { x: 6, y: 12, w: 6, h: 4 },
          config: { days: 365, weekStart: "monday" },
        },
        {
          // Sentiment claims a regime; momentum shows whether the field is
          // actually moving with it. Rows × timeframes catches the case where
          // the mood is greedy but only the majors are participating.
          id: "momentum-heatmap",
          frame: "coin-momentum-heatmap",
          position: { x: 0, y: 16, w: 5, h: 5 },
          config: { limit: 18 },
        },
        {
          id: "momentum-scatter",
          frame: "coin-momentum-scatter",
          position: { x: 5, y: 16, w: 7, h: 5 },
          config: { limit: 60 },
        },

        // ── The tape, and the reality check ───────────────────────────────
        // Headlines are the narrative the crowd is reacting to; the two
        // histograms are what the market actually did. Put together so the
        // story and the data are read in the same glance.
        {
          id: "hd-tape",
          frame: "heading",
          position: { x: 0, y: 21, w: 12, h: 1 },
          config: {
            title: "The Tape & The Reality Check",
            subtitle:
              "What the crowd is reading, against what the market actually did",
          },
        },
        {
          id: "tape",
          frame: "news-feed",
          title: "Markets Tape",
          position: { x: 0, y: 22, w: 4, h: 5 },
          config: { source: "cnbc", count: 10 },
        },
        {
          // Was today's move broad or a handful of megacaps? A narrow spike
          // straddling zero is a quiet tape however loud the headlines are.
          id: "breadth",
          frame: "breadth-histogram",
          position: { x: 4, y: 22, w: 4, h: 5 },
          config: { window: "24h", minRank: 200 },
        },
        {
          // Two years of BTC daily returns against the normal curve they are
          // supposed to follow. The gap in the tails is the size of the move
          // the crowd is systematically not pricing.
          id: "btc-returns",
          frame: "return-distribution",
          position: { x: 8, y: 22, w: 4, h: 5 },
          config: {
            symbol: "BTC",
            period: "daily",
            lookback: "2Y",
            showNormalCurve: true,
          },
        },
        {
          id: "reading-note",
          frame: "note",
          position: { x: 0, y: 27, w: 12, h: 3 },
          config: {
            text: '**How to read this board.** A prediction-market price is a *price*, not a promise. "68%" means someone was willing to pay 68 cents for a dollar that pays out if the event happens — a number shaped by who showed up, how much capital they had, and what it costs them to hold the position until settlement. Thin markets drift, and a resolution months away carries a funding cost that pulls the quote away from anyone\'s honest estimate. Read the volume beside the odds; the scatter above is there for exactly that reason.\n\nSentiment is the same trap in a different shape. Fear & greed measures *how the crowd feels*, which is most useful when it disagrees with what the crowd is doing — extreme readings have historically marked turns more often than continuations, so treat it as a contrarian input rather than a signal to follow. Nothing here is a forecast. It is a record of what people currently believe, worth exactly as much as the money standing behind it.',
          },
        },
      ],
      LOOK_SIGNAL,
      // Verdant, not Dusk: Dusk already carries Crypto Desk and Volatility
      // Surface, and a third glassy sans board on it read as a duplicate of the
      // first. 72 acid against Verdant's authored 150 is a wide rotate, but
      // both sit in the yellow-green family, and the two other Verdant boards
      // are dense flat mono — nothing else here is lifted and proportional.
      sceneBg("verdant"),
    ),
  },
];

export function curatedById(id: string): CuratedDashboard | undefined {
  return CURATED.find((d) => d.id === id);
}

// The landing's focus-scroll stack shows only THESE three, in this order — one
// board per asset class the product leads with (bullion, equities, crypto). The
// gallery still lists every curated board; the front door deliberately does not,
// because each landing board now dwells long enough to scroll its whole content
// past the viewport, and eighteen of those is a scroll nobody finishes.
const LANDING_IDS = ["gold-desk", "stocks-macro", "crypto-desk"] as const;

export const LANDING_BOARDS: CuratedDashboard[] = LANDING_IDS.map((id) => {
  const board = curatedById(id);
  if (!board) throw new Error(`landing board not in CURATED: ${id}`);
  return board;
});
