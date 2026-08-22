import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/**
 * The two-column head of a data card: an eyebrow-plus-hero-figure on the left,
 * a secondary reading right-aligned opposite it.
 *
 * Forty-one frames build this by hand, and the drift is in the joinery rather
 * than the design: `items-end` (23 frames), `items-start` (21) and
 * `items-baseline` (13) for the same row, `min-w-0` present or absent on the
 * left column, `shrink-0 text-right` (17) or bare `text-right` (18) on the
 * right. Those are not four intentions, they are four habits.
 *
 * WHY A COMPOUND. The columns are not symmetric and their parts are not
 * interchangeable: the left column's figure is the card's hero (`metric-xl`,
 * `leading-none`), the right column's is a supporting number (`body-md`, bold,
 * tabular), and the sub-line under each is sized to match its own column. As
 * props that means `heroSize` / `asideSize` / `heroSub` / `asideSub` and a
 * caller who has to remember which is which. As a compound, `Main` and `Aside`
 * publish which column their children are in, and `Value`/`Sub` pick the right
 * treatment themselves:
 *
 *     <CardHeader align="end">
 *       <CardHeader.Main>
 *         <CardHeader.Eyebrow>{tickerOf(config.symbol)} · institutional</CardHeader.Eyebrow>
 *         <CardHeader.Value>{formatPct(pct, 1)}</CardHeader.Value>
 *       </CardHeader.Main>
 *       <CardHeader.Aside>
 *         <CardHeader.Value>{money.compact(holdings)}</CardHeader.Value>
 *         <CardHeader.Sub>held</CardHeader.Sub>
 *       </CardHeader.Aside>
 *     </CardHeader>
 *
 * Arity varies a lot across the 41 — three lines over two, two over two, a
 * nested sentence, an `AssetLogo` plus a two-line identity — and that is fine
 * precisely because every slot is optional and repeatable. Frames whose head is
 * genuinely one-of-a-kind (`crypto-profile`'s identity block,
 * `metal-cot-disaggregated`'s inline sentence) should keep their own markup
 * rather than being bent through this.
 *
 * `size` and `tint` stay available for the frames that mean something different
 * — a `metric-lg` where the figure has to share the row, a semantic up/down
 * colour from `changeColor()`. Defaults cover the common case; overrides are
 * for the cases that are actually different.
 */

type HeaderColumn = "main" | "aside";

const HeaderColumnContext = createContext<HeaderColumn>("main");

/**
 * Size carries no ink; ink is resolved separately and exactly once.
 *
 * The first cut appended `text-strong` whenever there was no `tint`, which put
 * both `text-normal` (already inside `body-md`) and `text-strong` on the same
 * element — so the winning ink was decided by the order those two utilities
 * happen to sit in the stylesheet rather than by the caller. Splitting the two
 * axes means exactly one ink class lands, whatever the size; a `tint` still
 * beats all of them because it arrives as an inline style.
 *
 * `metric-lg` looks like it is missing `tabular-nums` next to `metric-xl`, but
 * the `metric-lg` utility already applies it (`packages/charts/src/theme.css`).
 *
 * `leading-none` is applied per size according to what the package actually
 * does, which is not uniform: of the existing uses, `metric-xl` carries it
 * 14/20 of the time and `metric-lg` 21/36, but `metric-sm` only **2 of 43** —
 * so baking it into `metric-sm` made that size unusable for its own common
 * case, silently tightening the line box wherever it was chosen. Counted, not
 * guessed, and the odd one out is the one that changed.
 */
const VALUE_SIZES = {
  /** A step under `body-md`, for an aside figure on a dense trend card. */
  "body-sm": "body-sm font-bold tabular-nums",
  "body-md": "body-md font-bold tabular-nums",
  "metric-sm": "metric-sm",
  "metric-md": "metric-md leading-none",
  "metric-lg": "metric-lg leading-none",
  "metric-xl": "metric-xl leading-none tabular-nums",
} as const;

/**
 * Figure ink. Defaults per column — the hero reads strong, its supporting
 * figure reads normal, which is what the hand-written markup said before this
 * existed (`metric-xl text-strong` left, `body-md text-normal` right).
 *
 * Overridable, because **the columns invert for a whole family of heads**: the
 * "official published series" shape puts the LABEL on the left and the hero
 * figure on the right, so its aside needs `strong`. Five sites do this
 * (`SeriesHeader` — itself four adopters — plus `credit-quality-gap`,
 * `misery-index`, `crypto-dilution`, `crypto-profile`). Column position is a
 * good guess at emphasis, not a law, and the alternatives were both worse: a
 * `className="text-strong"` puts two ink utilities on one element (the exact
 * bug this split was made to fix), and a `tint` of a CSS token abuses a prop
 * documented as a resolved semantic colour.
 */
const VALUE_INKS = {
  strong: "text-strong",
  normal: "text-normal",
} as const;

export type CardHeaderValueInk = keyof typeof VALUE_INKS;

const DEFAULT_VALUE_INK: Record<HeaderColumn, CardHeaderValueInk> = {
  main: "strong",
  aside: "normal",
};

export type CardHeaderValueSize = keyof typeof VALUE_SIZES;

/** What each column's figure is by default: hero on the left, support on the right. */
const DEFAULT_VALUE_SIZE: Record<HeaderColumn, CardHeaderValueSize> = {
  main: "metric-xl",
  aside: "body-md",
};

/**
 * The sub-line follows its own column's weight by default — but the size is
 * overridable, because "the main column's sub-line is `body-sm`" turned out to
 * be wrong for a whole family.
 *
 * Three separate conversion passes hit this independently: seven metals frames
 * and `token-unlock-schedule` all want a `caption`-sized sub-line under the
 * hero figure, and with no way to ask for one they had to keep hand-written
 * divs — the exact duplication this file exists to remove. A default that eight
 * frames must escape is a default, not a rule.
 */
const SUB_SIZES = {
  body: "body-sm",
  caption: "caption",
} as const;

export type CardHeaderSubSize = keyof typeof SUB_SIZES;

const DEFAULT_SUB_SIZE: Record<HeaderColumn, CardHeaderSubSize> = {
  main: "body",
  aside: "caption",
};

/**
 * Sub-line ink, selectable — and worth knowing that `soft` is the MINORITY
 * reading package-wide: across existing sub-lines `body-sm text-normal`
 * outnumbers `body-sm text-soft` 41:17. `soft` stays the default anyway,
 * because it is what the ~40 already-converted call sites were written against
 * and re-inking them wholesale is a bigger change than this refactor claims to
 * be. Every "official published series" head (a label over its print date)
 * wants `normal` and should ask for it.
 */
const SUB_INKS = {
  soft: "text-soft",
  normal: "text-normal",
} as const;

export type CardHeaderSubInk = keyof typeof SUB_INKS;

const ALIGNMENTS = {
  /** Baselines of the two figures sit on the card's reading line. */
  end: "items-end",
  start: "items-start",
  baseline: "items-baseline",
} as const;

export function CardHeader({
  align = "end",
  children,
}: {
  align?: keyof typeof ALIGNMENTS;
  children: ReactNode;
}) {
  return (
    <div className={`flex ${ALIGNMENTS[align]} justify-between gap-3`}>
      {children}
    </div>
  );
}

/**
 * The left column. `min-w-0` unconditionally, because it is what lets a long
 * eyebrow truncate instead of shoving the right column off the card — the
 * single most common omission in the hand-rolled copies.
 */
function CardHeaderMain({ children }: { children: ReactNode }) {
  return (
    <HeaderColumnContext.Provider value="main">
      <div className="min-w-0">{children}</div>
    </HeaderColumnContext.Provider>
  );
}

/**
 * The right column. `shrink-0` so the supporting figure keeps its width and the
 * left column absorbs the squeeze; a right column that shrinks first wraps its
 * own number, which is the worse of the two failures.
 */
function CardHeaderAside({ children }: { children: ReactNode }) {
  return (
    <HeaderColumnContext.Provider value="aside">
      <div className="shrink-0 text-right">{children}</div>
    </HeaderColumnContext.Provider>
  );
}

/**
 * The quiet line naming what the figure is.
 *
 * `caps` exists because an aside's label line is sometimes deliberately
 * sentence-case — "index", "nonfarm payrolls", "since Q1 2020" — and forcing
 * uppercase there sent three frames back to a hand-written div. Uppercase stays
 * the default: it is what the eyebrow above a hero figure does.
 */
function CardHeaderEyebrow({
  caps = true,
  children,
}: {
  caps?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`caption text-soft truncate${caps ? " uppercase" : ""}`}>
      {children}
    </div>
  );
}

/**
 * The figure. Sized for its column unless told otherwise; `tint` takes an
 * already-resolved colour (in practice `changeColor(pct)`), and without one the
 * figure renders in the default strong ink.
 */
function CardHeaderValue({
  size,
  ink,
  tint,
  absent,
  className,
  children,
}: {
  size?: CardHeaderValueSize;
  /** Override the column's default emphasis — see {@link VALUE_INKS}. */
  ink?: CardHeaderValueInk;
  tint?: string;
  /**
   * There is no reading this period — an em-dash, not a number. Renders in
   * disabled ink so it does not read as data: three frames were hand-rolling
   * `body-md text-disabled` for exactly this, and a placeholder that inherits
   * the figure's ink is indistinguishable from a real value at a glance.
   */
  absent?: boolean;
  /**
   * Escape hatch for the per-figure extras — most often `truncate`, for a hero
   * that is a long WORD rather than a number ("Moderate Buy" at `metric-lg`).
   */
  className?: string;
  children: ReactNode;
}) {
  const column = useContext(HeaderColumnContext);
  const resolved = size ?? DEFAULT_VALUE_SIZE[column];
  const inkClass = absent
    ? "text-disabled"
    : VALUE_INKS[ink ?? DEFAULT_VALUE_INK[column]];
  return (
    <div
      className={`${VALUE_SIZES[resolved]} ${inkClass}${className ? ` ${className}` : ""}`}
      style={tint && !absent ? { color: tint } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The line under the figure: a unit, a direction word, a denominator — or a
 * tinted move, which is why it takes a `tint` like `Value` does.
 *
 * `className` is the escape hatch for the genuine per-frame extras that are not
 * worth a vocabulary — the family's `mt-0.5` top nudge, `tabular-nums` on a
 * figure-shaped line, a `leading-snug` on a footnote that wraps to two lines.
 */
function CardHeaderSub({
  size,
  ink = "soft",
  tint,
  className,
  children,
}: {
  size?: CardHeaderSubSize;
  ink?: CardHeaderSubInk;
  /** An already-resolved colour; wins over `ink`, since it arrives inline. */
  tint?: string;
  className?: string;
  children: ReactNode;
}) {
  const column = useContext(HeaderColumnContext);
  const resolved = size ?? DEFAULT_SUB_SIZE[column];
  return (
    <div
      className={`${SUB_SIZES[resolved]} ${SUB_INKS[ink]}${className ? ` ${className}` : ""}`}
      style={tint ? { color: tint } : undefined}
    >
      {children}
    </div>
  );
}

CardHeader.Main = CardHeaderMain;
CardHeader.Aside = CardHeaderAside;
CardHeader.Eyebrow = CardHeaderEyebrow;
CardHeader.Value = CardHeaderValue;
CardHeader.Sub = CardHeaderSub;
