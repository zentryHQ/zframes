/**
 * The metal universe this provider serves, shared by the sibling modules
 * (index.ts spot/vol/reserve paths, cot.ts positioning, lbma.ts fix history).
 */

export interface MetalDef {
  /** Display name, matching what gold-api returns. */
  name: string;
  /** LBMA fix file basename, or null where the LBMA publishes no fix (copper). */
  lbma: string | null;
  /** CFTC contract market code for the US futures contract, or null. */
  cotCode: string | null;
  /** Market name to label the COT series with. */
  cotMarket: string | null;
  /** Contract size in the metal's native unit (troy oz; copper pounds). */
  contractSize: number;
}

/** The metal universe, in board order. Keys are the symbols the API speaks. */
export const METALS: Record<string, MetalDef> = {
  XAU: {
    name: "Gold",
    lbma: "gold_pm",
    cotCode: "088691",
    cotMarket: "GOLD - COMMODITY EXCHANGE INC.",
    contractSize: 100,
  },
  XAG: {
    name: "Silver",
    lbma: "silver",
    cotCode: "084691",
    cotMarket: "SILVER - COMMODITY EXCHANGE INC.",
    contractSize: 5_000,
  },
  XPT: {
    name: "Platinum",
    lbma: "platinum_pm",
    cotCode: "076651",
    cotMarket: "PLATINUM - NEW YORK MERCANTILE EXCHANGE",
    contractSize: 50,
  },
  XPD: {
    name: "Palladium",
    lbma: "palladium_pm",
    cotCode: "075651",
    cotMarket: "PALLADIUM - NEW YORK MERCANTILE EXCHANGE",
    contractSize: 100,
  },
  HG: {
    name: "Copper",
    lbma: null,
    cotCode: "085692",
    cotMarket: "COPPER- #1 - COMMODITY EXCHANGE INC.",
    contractSize: 25_000,
  },
};

const DEFAULT_SYMBOLS = Object.keys(METALS);

/** Coerce a wire value (Socrata and fiscaldata send numbers as strings) to a finite number. */
export function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Normalise a caller's symbol list to known, de-duplicated metal symbols. */
export function wantedSymbols(symbols?: string[]): string[] {
  const list = symbols?.length ? symbols : DEFAULT_SYMBOLS;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const symbol = raw.trim().toUpperCase();
    if (METALS[symbol] && !seen.has(symbol)) {
      seen.add(symbol);
      out.push(symbol);
    }
  }
  return out;
}
