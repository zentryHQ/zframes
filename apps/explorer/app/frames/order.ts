import { FRAME_CATEGORIES, type FrameCategory } from "@zframes/spec/frame";

/**
 * Stocks-first DISPLAY order for the public catalogue: lead with the
 * equity-relevant families (live prices, single-company fundamentals & filings,
 * macro context and the commodity complex), then the crypto families, then
 * everything else. This reorders the catalogue's sections only — the global
 * `FRAME_CATEGORIES` order (which drives the editor palette and the AI
 * catalogue) is deliberately left untouched.
 *
 * Lives in its own module, imported from `@zframes/spec/frame` rather than
 * `@zframes/core`, because BOTH halves of `/frames` need it: the client-only
 * live grid (`FramesView`) and the server-rendered text index (`FrameIndex`).
 * `@zframes/spec` is React-free, so a Server Component can import this without
 * pulling the presentation layer into the server graph.
 */
export const CATALOGUE_CATEGORY_ORDER = [
  "markets", // Prices & Markets — equity perps lead
  "equities", // Equities & Filings
  "macro", // Macro & Rates — market context
  "metals", // Metals & Commodities — the same macro context, in hard assets
  "crypto", // Crypto & On-chain
  "bitcoin", // Bitcoin Network
  "onchain", // On-chain & Cycle — reads the chain the two above price
  "derivatives", // Derivatives & Options
  "sentiment", // Sentiment & News
  "portfolio",
  "journal",
  "tools",
  "layout",
  "games",
] as const satisfies readonly FrameCategory[];

// A family added to FRAME_CATEGORIES but never ranked above still *renders* —
// it just silently sorts below Games, which is how `metals` (26 frames) and
// `onchain` (23) ended up beneath three idle games for a month. Make the
// omission a typecheck failure instead: if any FrameCategory is unranked, the
// annotation below resolves to `never` and `pnpm typecheck` fails naming it.
// `as const satisfies` above is load-bearing — a plain `FrameCategory[]`
// annotation widens the element type and collapses this Exclude to `never`.
type UnrankedCategory = Exclude<
  FrameCategory,
  (typeof CATALOGUE_CATEGORY_ORDER)[number]
>;
const _everyCategoryRanked: [UnrankedCategory] extends [never] ? true : never =
  true;
void _everyCategoryRanked;

// Rank by the list above. The -1 fallback is unreachable given the guard, but
// kept so an unranked family degrades to "last" rather than "first".
export const categoryRank = (key: FrameCategory) => {
  const i = (CATALOGUE_CATEGORY_ORDER as readonly FrameCategory[]).indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

export const ORDERED_CATEGORIES = [...FRAME_CATEGORIES].sort(
  (a, b) => categoryRank(a.key) - categoryRank(b.key),
);
