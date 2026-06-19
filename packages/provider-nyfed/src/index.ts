import type {
  Capability,
  MarketDataProvider,
  ReferenceRate,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const NY_FED_RATES_URL =
  "https://markets.newyorkfed.org/api/rates/all/latest.json";

const REFERENCE_RATE_LABELS: Record<string, string> = {
  SOFR: "SOFR",
  SOFRAI: "SOFR averages",
  EFFR: "Effective fed funds",
  OBFR: "Overnight bank funding",
  TGCR: "Tri-party repo",
  BGCR: "Broad general collateral",
};

const REFERENCE_RATE_ORDER = ["EFFR", "SOFR", "TGCR", "BGCR", "OBFR", "SOFRAI"];

interface NyFedRatesResponse {
  refRates: Array<{
    effectiveDate?: string;
    type?: string;
    percentRate?: number;
    volumeInBillions?: number;
    targetRateFrom?: number;
    targetRateTo?: number;
    average30day?: number;
    average90day?: number;
    average180day?: number;
  }>;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function referenceRateSort(a: ReferenceRate, b: ReferenceRate): number {
  const ai = REFERENCE_RATE_ORDER.indexOf(a.code);
  const bi = REFERENCE_RATE_ORDER.indexOf(b.code);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
}

/**
 * Free, no-API-key provider for the New York Fed Markets API — overnight
 * reference rates (SOFR, EFFR, OBFR, tri-party and general-collateral repo).
 * Keyless and CORS-safe. Provides the `reference-rates` capability.
 */
export class NyFedProvider implements MarketDataProvider {
  readonly name = "nyfed";
  readonly capabilities: readonly Capability[] = ["reference-rates"];

  async getReferenceRates(): Promise<ReferenceRate[]> {
    const body = await fetchJson<NyFedRatesResponse>(NY_FED_RATES_URL);
    if (!Array.isArray(body?.refRates))
      throw new Error("ny fed rates: unexpected response shape");

    return body.refRates
      .map((entry): ReferenceRate | null => {
        const code = String(entry.type ?? "");
        const rate = finiteNumber(entry.percentRate ?? entry.average30day);
        if (!code || !entry.effectiveDate || rate === null) return null;
        const referenceRate: ReferenceRate = {
          code,
          label: REFERENCE_RATE_LABELS[code] ?? code,
          date: entry.effectiveDate,
          rate,
          source: "New York Fed",
        };
        const volumeInBillions = finiteNumber(entry.volumeInBillions);
        const targetRateFrom = finiteNumber(entry.targetRateFrom);
        const targetRateTo = finiteNumber(entry.targetRateTo);
        const average30Day = finiteNumber(entry.average30day);
        const average90Day = finiteNumber(entry.average90day);
        const average180Day = finiteNumber(entry.average180day);
        if (volumeInBillions !== null)
          referenceRate.volumeInBillions = volumeInBillions;
        if (targetRateFrom !== null)
          referenceRate.targetRateFrom = targetRateFrom;
        if (targetRateTo !== null) referenceRate.targetRateTo = targetRateTo;
        if (average30Day !== null) referenceRate.average30Day = average30Day;
        if (average90Day !== null) referenceRate.average90Day = average90Day;
        if (average180Day !== null) referenceRate.average180Day = average180Day;
        return referenceRate;
      })
      .filter((rate): rate is ReferenceRate => rate !== null)
      .sort(referenceRateSort);
  }
}
