import type {
  CotConcentration,
  CotDisaggregated,
  CotTraderClass,
  MetalPositioning,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";
import { num } from "./universe";

/**
 * The CFTC Commitments-of-Traders block: the legacy futures-only report's
 * constants/row type plus the whole disaggregated-report pipeline (column list,
 * mapping, fetch). index.ts's `getMetalPositioning` merges the two.
 */

export const COT_URL =
  "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
/** The disaggregated futures-only report — a separate dataset, same host and keying. */
export const COT_DISAGG_URL =
  "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";

/**
 * Weeks requested from each COT dataset. Shared by both calls so the two reports
 * cover the same window by construction — a wider disaggregated request would
 * only return weeks with no legacy week to merge onto.
 */
export const COT_WEEKS = 520;

// COT publishes Friday afternoon for the prior Tuesday — weekly data behind a
// 6h TTL, small enough (a few hundred rows of nine numbers) to persist.
export const cotCache = new TtlCache<MetalPositioning>({
  namespace: "zframes:metals:cot",
  ttlMs: 6 * 60 * 60_000,
  persist: true,
});

// The disaggregated report is the same weekly cadence as its legacy sibling, so
// the TTL sits just under the hook's 6h poll and background polls still refresh.
//
// NOT persisted, unlike that sibling, and the payload is why: the 55 published
// columns this maps come back as **~1 MB of JSON per metal** for a 520-week
// window (measured live on all five), against the legacy report's nine columns.
// Five metals persisted would land right on the ~5 MB origin localStorage quota,
// where `setItem` throws into the cache's swallowing write guard and persistence
// silently stops — for every other provider's small payloads too, with no
// symptom. In-memory sharing already gives a board with three gold cards one
// download; surviving a reload isn't worth spending the whole origin budget.
//
// Keys are metal symbols, so the fan-out is the five-metal universe and cannot
// drift; `maxEntries` is a backstop rather than a working limit.
export const cotDisaggCache = new TtlCache<DisaggWeek[]>({
  namespace: "zframes:metals:cot-disagg",
  ttlMs: 5 * 60 * 60_000,
  persist: false,
  maxEntries: 8,
});

export interface CotRow {
  report_date_as_yyyy_mm_dd?: string;
  open_interest_all?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
  /** CFTC's own field name — the typo ("postions") is in their schema, not ours. */
  noncomm_postions_spread_all?: string;
  comm_positions_long_all?: string;
  comm_positions_short_all?: string;
  nonrept_positions_long_all?: string;
  nonrept_positions_short_all?: string;
}

/**
 * Every disaggregated column this provider maps, in ONE list so the `$select`
 * and the row type below can't drift apart — a name that exists in only one of
 * the two is the failure mode this shape exists to prevent.
 *
 * **The swap-dealer short and spread columns carry a DOUBLE underscore**
 * (`swap__positions_short_all`, `swap__positions_spread_all`) while the long one
 * has a single (`swap_positions_long_all`). That is a defect in the CFTC's own
 * schema — the same class as the legacy report's `noncomm_postions_spread_all`
 * typo above — and Socrata answers a single-underscore guess by simply omitting
 * the column rather than erroring, so the card renders zeros and nothing says
 * why. Verified live: every name below comes back non-null for all five metals.
 *
 * The `_all` suffix is inconsistent by class too, so there is no pattern to
 * derive and each name is read exactly as published: swap / managed-money /
 * non-reportable carry it, producer-merchant and other-reportable don't, and
 * `traders_other_rept_short` drops it where `traders_other_rept_long_all` keeps
 * it. `m_money_positions_spread` and `change_in_m_money_spread` likewise lack
 * the `_all` their long/short siblings have.
 */
const DISAGG_FIELDS = [
  "report_date_as_yyyy_mm_dd",
  // Positions, by trader class.
  "prod_merc_positions_long",
  "prod_merc_positions_short",
  "swap_positions_long_all",
  "swap__positions_short_all",
  "swap__positions_spread_all",
  "m_money_positions_long_all",
  "m_money_positions_short_all",
  "m_money_positions_spread",
  "other_rept_positions_long",
  "other_rept_positions_short",
  "other_rept_positions_spread",
  "nonrept_positions_long_all",
  "nonrept_positions_short_all",
  // Week-over-week changes, as the agency computed them.
  "change_in_prod_merc_long",
  "change_in_prod_merc_short",
  "change_in_swap_long_all",
  "change_in_swap_short_all",
  "change_in_swap_spread_all",
  "change_in_m_money_long_all",
  "change_in_m_money_short_all",
  "change_in_m_money_spread",
  "change_in_other_rept_long",
  "change_in_other_rept_short",
  "change_in_other_rept_spread",
  "change_in_nonrept_long_all",
  "change_in_nonrept_short_all",
  // Share of total open interest, percent.
  "pct_of_oi_prod_merc_long",
  "pct_of_oi_prod_merc_short",
  "pct_of_oi_swap_long_all",
  "pct_of_oi_swap_short_all",
  "pct_of_oi_m_money_long_all",
  "pct_of_oi_m_money_short_all",
  "pct_of_oi_other_rept_long",
  "pct_of_oi_other_rept_short",
  "pct_of_oi_nonrept_long_all",
  "pct_of_oi_nonrept_short_all",
  // Trader counts. Non-reportables have none by definition — they are the
  // positions below the threshold at which a trader must report at all.
  "traders_tot_all",
  "traders_prod_merc_long_all",
  "traders_prod_merc_short_all",
  "traders_swap_long_all",
  "traders_swap_short_all",
  "traders_m_money_long_all",
  "traders_m_money_short_all",
  "traders_other_rept_long_all",
  "traders_other_rept_short",
  // Concentration in the largest 4 and 8 traders, percent.
  "conc_gross_le_4_tdr_long",
  "conc_gross_le_4_tdr_short",
  "conc_gross_le_8_tdr_long",
  "conc_gross_le_8_tdr_short",
  "conc_net_le_4_tdr_long_all",
  "conc_net_le_4_tdr_short_all",
  "conc_net_le_8_tdr_long_all",
  "conc_net_le_8_tdr_short_all",
  // The published contract unit, e.g. "(CONTRACTS OF 100 TROY OUNCES)".
  "contract_units",
] as const;

const DISAGG_SELECT = DISAGG_FIELDS.join(",");

/** A disaggregated row, typed off the selected columns — Socrata sends strings. */
type CotDisaggRow = Partial<Record<(typeof DISAGG_FIELDS)[number], string>>;

/** One mapped disaggregated week, keyed by the same epoch the legacy week carries. */
export interface DisaggWeek {
  time: number;
  data: CotDisaggregated;
}

/**
 * Assemble one trader class from its published columns.
 *
 * `long`/`short` are required by the interface, so they fall back to 0. Every
 * optional field is left **undefined** when its column is absent rather than
 * collapsed to 0, because the absences here are real and meaningful: the
 * producer/merchant and non-reportable classes never spread, and non-reportables
 * have no trader counts at all. A zero would read as "flat this week".
 */
function traderClass(parts: {
  long: unknown;
  short: unknown;
  spread?: unknown;
  changeLong?: unknown;
  changeShort?: unknown;
  changeSpread?: unknown;
  pctOfOiLong?: unknown;
  pctOfOiShort?: unknown;
  tradersLong?: unknown;
  tradersShort?: unknown;
}): CotTraderClass {
  return {
    long: num(parts.long) ?? 0,
    short: num(parts.short) ?? 0,
    spread: num(parts.spread) ?? undefined,
    changeLong: num(parts.changeLong) ?? undefined,
    changeShort: num(parts.changeShort) ?? undefined,
    changeSpread: num(parts.changeSpread) ?? undefined,
    pctOfOiLong: num(parts.pctOfOiLong) ?? undefined,
    pctOfOiShort: num(parts.pctOfOiShort) ?? undefined,
    tradersLong: num(parts.tradersLong) ?? undefined,
    tradersShort: num(parts.tradersShort) ?? undefined,
  };
}

/**
 * Concentration in the largest traders, or undefined when the gross columns the
 * interface requires aren't all published — the net pair stays optional on top.
 */
function concentrationFrom(row: CotDisaggRow): CotConcentration | undefined {
  const grossLong4 = num(row.conc_gross_le_4_tdr_long);
  const grossShort4 = num(row.conc_gross_le_4_tdr_short);
  const grossLong8 = num(row.conc_gross_le_8_tdr_long);
  const grossShort8 = num(row.conc_gross_le_8_tdr_short);
  if (
    grossLong4 === null ||
    grossShort4 === null ||
    grossLong8 === null ||
    grossShort8 === null
  )
    return undefined;
  return {
    grossLong4,
    grossShort4,
    grossLong8,
    grossShort8,
    netLong4: num(row.conc_net_le_4_tdr_long_all) ?? undefined,
    netShort4: num(row.conc_net_le_4_tdr_short_all) ?? undefined,
    netLong8: num(row.conc_net_le_8_tdr_long_all) ?? undefined,
    netShort8: num(row.conc_net_le_8_tdr_short_all) ?? undefined,
  };
}

/**
 * Map one disaggregated row, or null if it isn't one.
 *
 * The guard matters more than it looks: the two COT datasets live on the same
 * host and share several column names outright (`nonrept_positions_long_all` is
 * in both), so a legacy row reaching this function would otherwise map into a
 * week of zeros that looks published. Requiring the three classes the legacy
 * report cannot express — producer/merchant, swap dealers, managed money — is
 * what makes "this row is disaggregated" checkable rather than assumed.
 */
function disaggregatedFrom(row: CotDisaggRow): CotDisaggregated | null {
  if (
    num(row.prod_merc_positions_long) === null ||
    num(row.swap_positions_long_all) === null ||
    num(row.m_money_positions_long_all) === null
  )
    return null;
  return {
    producerMerchant: traderClass({
      long: row.prod_merc_positions_long,
      short: row.prod_merc_positions_short,
      changeLong: row.change_in_prod_merc_long,
      changeShort: row.change_in_prod_merc_short,
      pctOfOiLong: row.pct_of_oi_prod_merc_long,
      pctOfOiShort: row.pct_of_oi_prod_merc_short,
      tradersLong: row.traders_prod_merc_long_all,
      tradersShort: row.traders_prod_merc_short_all,
    }),
    swapDealer: traderClass({
      long: row.swap_positions_long_all,
      // Double underscore on short and spread, single on long — CFTC's schema,
      // not a typo here. See DISAGG_FIELDS.
      short: row.swap__positions_short_all,
      spread: row.swap__positions_spread_all,
      changeLong: row.change_in_swap_long_all,
      changeShort: row.change_in_swap_short_all,
      changeSpread: row.change_in_swap_spread_all,
      pctOfOiLong: row.pct_of_oi_swap_long_all,
      pctOfOiShort: row.pct_of_oi_swap_short_all,
      tradersLong: row.traders_swap_long_all,
      tradersShort: row.traders_swap_short_all,
    }),
    managedMoney: traderClass({
      long: row.m_money_positions_long_all,
      short: row.m_money_positions_short_all,
      spread: row.m_money_positions_spread,
      changeLong: row.change_in_m_money_long_all,
      changeShort: row.change_in_m_money_short_all,
      changeSpread: row.change_in_m_money_spread,
      pctOfOiLong: row.pct_of_oi_m_money_long_all,
      pctOfOiShort: row.pct_of_oi_m_money_short_all,
      tradersLong: row.traders_m_money_long_all,
      tradersShort: row.traders_m_money_short_all,
    }),
    otherReportable: traderClass({
      long: row.other_rept_positions_long,
      short: row.other_rept_positions_short,
      spread: row.other_rept_positions_spread,
      changeLong: row.change_in_other_rept_long,
      changeShort: row.change_in_other_rept_short,
      changeSpread: row.change_in_other_rept_spread,
      pctOfOiLong: row.pct_of_oi_other_rept_long,
      pctOfOiShort: row.pct_of_oi_other_rept_short,
      tradersLong: row.traders_other_rept_long_all,
      tradersShort: row.traders_other_rept_short,
    }),
    nonReportable: traderClass({
      long: row.nonrept_positions_long_all,
      short: row.nonrept_positions_short_all,
      changeLong: row.change_in_nonrept_long_all,
      changeShort: row.change_in_nonrept_short_all,
      pctOfOiLong: row.pct_of_oi_nonrept_long_all,
      pctOfOiShort: row.pct_of_oi_nonrept_short_all,
    }),
    totalTraders: num(row.traders_tot_all) ?? undefined,
    concentration: concentrationFrom(row),
    // Surfaced as published rather than folded into `contractSize`, which stays
    // the provider's own hardcoded number so the five shipped frames reading it
    // keep the value they have.
    contractUnits: row.contract_units,
  };
}

/**
 * Fetch and map one metal's disaggregated weeks, newest-first off the wire.
 *
 * Fetched **direct, not proxied**: publicreporting.cftc.gov answers
 * `Access-Control-Allow-Origin: *`, exactly like the legacy call beside it.
 */
export async function loadDisaggregated(
  key: string,
  code: string,
): Promise<DisaggWeek[]> {
  const url =
    `${COT_DISAGG_URL}?$select=${DISAGG_SELECT}` +
    `&cftc_contract_market_code=${code}` +
    `&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=${COT_WEEKS}`;
  const rows = await fetchJson<CotDisaggRow[]>(url, undefined, {
    // ~1 MB per metal at this width and window — the shared default is for the
    // small payloads, so this gets the LBMA history's allowance.
    timeoutMs: 30_000,
  });
  if (!Array.isArray(rows))
    throw new Error(`cftc disaggregated ${key}: unexpected shape`);
  const weeks: DisaggWeek[] = [];
  for (const row of rows) {
    // Both datasets publish the same Socrata timestamp field in the same format
    // ("2026-07-28T00:00:00.000") and both are parsed with this identical call,
    // so the epochs align by construction and the merge downstream is exact.
    const time = Date.parse(row?.report_date_as_yyyy_mm_dd ?? "");
    if (!Number.isFinite(time)) continue;
    const data = disaggregatedFrom(row);
    if (data) weeks.push({ time, data });
  }
  if (weeks.length === 0)
    throw new Error(`cftc disaggregated ${key}: no usable rows`);
  return weeks;
}
