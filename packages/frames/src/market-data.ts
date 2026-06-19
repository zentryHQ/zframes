/**
 * World stock-exchange sessions, computed client-side — no API, no key.
 *
 * An exchange's open/closed state is deterministic: its IANA timezone plus
 * regular trading hours and trading weekdays. `Intl.DateTimeFormat` projects
 * "now" into the exchange's zone (handling DST for us), so the only thing a
 * static table can't derive is public holidays — those vary per exchange per
 * year, so we bundle a 2026 list for the major Western exchanges.
 *
 * Not modelled (documented limitations): intraday lunch breaks (Tokyo, HK,
 * Shanghai), half-day early closes, and — for the Asian/EM exchanges — the
 * full lunar/religious holiday calendars (only high-confidence fixed dates are
 * listed). Refresh HOLIDAYS each year.
 */

export type Region =
  | "Americas"
  | "Europe"
  | "Asia-Pacific"
  | "Middle East / Africa";

export interface Exchange {
  code: string;
  name: string;
  city: string;
  country: string;
  website: string;
  mark: string;
  tz: string; // IANA timezone
  open: string; // "HH:MM" local
  close: string; // "HH:MM" local
  /** Trading weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  region: Region;
  /** Key into HOLIDAYS; defaults to `code` when absent. */
  holidayGroup?: string;
}

const MON_FRI = [1, 2, 3, 4, 5];
const SUN_THU = [0, 1, 2, 3, 4]; // Gulf trading week

/**
 * 2026 full-closure holidays per group, "YYYY-MM-DD" in the exchange's local
 * date. Western lists are curated and high-confidence; the Asian/EM lists
 * cover only well-known fixed dates and are intentionally partial.
 */
const HOLIDAYS: Record<string, string[]> = {
  // United States — NYSE & NASDAQ
  US: [
    "2026-01-01", // New Year's Day
    "2026-01-19", // Martin Luther King Jr. Day
    "2026-02-16", // Washington's Birthday
    "2026-04-03", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-03", // Independence Day (observed, Jul 4 = Sat)
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ],
  // Canada — Toronto Stock Exchange
  TSX: [
    "2026-01-01",
    "2026-02-16", // Family Day
    "2026-04-03", // Good Friday
    "2026-05-18", // Victoria Day
    "2026-07-01", // Canada Day
    "2026-08-03", // Civic Holiday
    "2026-09-07", // Labour Day
    "2026-10-12", // Thanksgiving
    "2026-12-25",
    "2026-12-28", // Boxing Day (observed, Dec 26 = Sat)
  ],
  // Brazil — B3 (weekday national holidays)
  B3: [
    "2026-01-01",
    "2026-02-16", // Carnival Monday
    "2026-02-17", // Carnival Tuesday
    "2026-04-03", // Good Friday
    "2026-04-21", // Tiradentes
    "2026-05-01", // Labour Day
    "2026-06-04", // Corpus Christi
    "2026-09-07", // Independence Day
    "2026-10-12", // Our Lady of Aparecida
    "2026-11-02", // All Souls' Day
    "2026-11-20", // Black Awareness Day
    "2026-12-25",
  ],
  // United Kingdom — London Stock Exchange
  LSE: [
    "2026-01-01",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-04", // Early May bank holiday
    "2026-05-25", // Spring bank holiday
    "2026-08-31", // Summer bank holiday
    "2026-12-25", // Christmas
    "2026-12-28", // Boxing Day (observed, Dec 26 = Sat)
  ],
  // Germany — Deutsche Börse Xetra
  XETRA: [
    "2026-01-01",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-01", // Labour Day
    "2026-12-24", // Christmas Eve (Xetra closed)
    "2026-12-25", // Christmas
    "2026-12-31", // New Year's Eve (Xetra closed)
  ],
  // Euronext (Paris, Amsterdam, …)
  EURONEXT: [
    "2026-01-01",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-01", // Labour Day
    "2026-12-25", // Christmas
  ],
  // Switzerland — SIX Swiss Exchange
  SIX: [
    "2026-01-01",
    "2026-01-02", // Berchtold's Day
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-01", // Labour Day
    "2026-05-14", // Ascension
    "2026-05-25", // Whit Monday
    "2026-12-24", // Christmas Eve (SIX closed)
    "2026-12-25", // Christmas
    "2026-12-31", // New Year's Eve (SIX closed)
  ],
  // Japan — Tokyo Stock Exchange (national holidays + year-end closure)
  TSE: [
    "2026-01-01",
    "2026-01-02", // Exchange year-end/new-year closure
    "2026-01-12", // Coming of Age Day
    "2026-02-11", // National Foundation Day
    "2026-02-23", // Emperor's Birthday
    "2026-03-20", // Vernal Equinox Day
    "2026-04-29", // Shōwa Day
    "2026-05-04", // Greenery Day
    "2026-05-05", // Children's Day
    "2026-05-06", // Substitute holiday
    "2026-07-20", // Marine Day
    "2026-08-11", // Mountain Day
    "2026-09-21", // Respect for the Aged Day
    "2026-09-22", // Citizens' holiday
    "2026-09-23", // Autumnal Equinox Day
    "2026-10-12", // Sports Day
    "2026-11-03", // Culture Day
    "2026-11-23", // Labour Thanksgiving Day
    "2026-12-31", // Exchange year-end closure
  ],
  // Hong Kong — HKEX (weekday public holidays; partial)
  HKEX: [
    "2026-01-01",
    "2026-02-17", // Lunar New Year
    "2026-02-18",
    "2026-02-19",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-01", // Labour Day
    "2026-05-25", // Buddha's Birthday (observed)
    "2026-06-19", // Tuen Ng Festival
    "2026-07-01", // HKSAR Establishment Day
    "2026-10-01", // National Day
    "2026-10-19", // Chung Yeung Festival (observed)
    "2026-12-25", // Christmas
  ],
  // Mainland China — Shanghai/Shenzhen (approximate week-long closures; partial)
  CN: [
    "2026-01-01",
    "2026-02-16", // Spring Festival week
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-02-23",
    "2026-02-24",
    "2026-04-06", // Qingming
    "2026-05-01", // Labour Day
    "2026-05-04",
    "2026-05-05",
    "2026-06-19", // Dragon Boat Festival
    "2026-10-01", // National Day / Mid-Autumn week
    "2026-10-02",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
  ],
  // India — NSE/BSE (high-confidence fixed dates only; partial)
  NSE: [
    "2026-01-26", // Republic Day
    "2026-04-03", // Good Friday
    "2026-05-01", // Maharashtra Day
    "2026-08-15", // Independence Day (Sat — no effect)
    "2026-10-02", // Gandhi Jayanti
    "2026-12-25", // Christmas
  ],
  // South Korea — Korea Exchange (fixed dates only; partial)
  KRX: [
    "2026-01-01",
    "2026-03-01", // Independence Movement Day (Sun)
    "2026-05-05", // Children's Day
    "2026-06-06", // Memorial Day (Sat)
    "2026-08-15", // Liberation Day (Sat)
    "2026-10-03", // National Foundation Day (Sat)
    "2026-10-09", // Hangeul Day
    "2026-12-25", // Christmas
  ],
  // Singapore Exchange (fixed dates only; partial)
  SGX: [
    "2026-01-01",
    "2026-05-01", // Labour Day
    "2026-08-10", // National Day (observed, Aug 9 = Sun)
    "2026-12-25", // Christmas
  ],
  // Thailand — Stock Exchange of Thailand
  SET: [
    "2026-01-01", // New Year's Day
    "2026-01-02", // Additional special holiday
    "2026-03-03", // Makha Bucha Day
    "2026-04-06", // Chakri Memorial Day
    "2026-04-13", // Songkran Festival
    "2026-04-14",
    "2026-04-15",
    "2026-05-01", // National Labour Day
    "2026-05-04", // Coronation Day
    "2026-06-01", // Visakha Bucha Day (observed)
    "2026-06-03", // H.M. Queen Suthida's Birthday
    "2026-07-28", // H.M. King's Birthday
    "2026-07-29", // Asarnha Bucha Day
    "2026-08-12", // H.M. Queen Mother's Birthday
    "2026-10-13", // King Bhumibol Adulyadej The Great Memorial Day
    "2026-10-23", // Chulalongkorn Day
    "2026-12-07", // Substitution for H.M. King's Birthday
    "2026-12-10", // Constitution Day
    "2026-12-31", // New Year's Eve
  ],
  // Australia — ASX
  ASX: [
    "2026-01-01",
    "2026-01-26", // Australia Day
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-04-07", // Easter Tuesday (ASX closed)
    "2026-04-25", // Anzac Day (Sat — no effect)
    "2026-06-08", // King's Birthday
    "2026-12-25", // Christmas
    "2026-12-28", // Boxing Day (observed, Dec 26 = Sat)
  ],
  // South Africa — JSE
  JSE: [
    "2026-01-01",
    "2026-03-21", // Human Rights Day (Sat — no effect)
    "2026-04-03", // Good Friday
    "2026-04-06", // Family Day
    "2026-04-27", // Freedom Day
    "2026-05-01", // Workers' Day
    "2026-06-16", // Youth Day
    "2026-08-10", // National Women's Day (observed)
    "2026-09-24", // Heritage Day
    "2026-12-16", // Day of Reconciliation
    "2026-12-25", // Christmas
  ],
  // Saudi Arabia — Tadawul (fixed national days only; Eid dates omitted)
  TADAWUL: [
    "2026-09-23", // National Day
  ],
};

export const EXCHANGES: Record<string, Exchange> = {
  NYSE: {
    code: "NYSE",
    name: "New York Stock Exchange",
    city: "New York",
    country: "US",
    website: "https://www.nyse.com",
    mark: "NY",
    tz: "America/New_York",
    open: "09:30",
    close: "16:00",
    days: MON_FRI,
    region: "Americas",
    holidayGroup: "US",
  },
  NASDAQ: {
    code: "NASDAQ",
    name: "Nasdaq",
    city: "New York",
    country: "US",
    website: "https://www.nasdaq.com",
    mark: "NQ",
    tz: "America/New_York",
    open: "09:30",
    close: "16:00",
    days: MON_FRI,
    region: "Americas",
    holidayGroup: "US",
  },
  TSX: {
    code: "TSX",
    name: "Toronto Stock Exchange",
    city: "Toronto",
    country: "CA",
    website: "https://www.tsx.com",
    mark: "TX",
    tz: "America/Toronto",
    open: "09:30",
    close: "16:00",
    days: MON_FRI,
    region: "Americas",
  },
  B3: {
    code: "B3",
    name: "B3",
    city: "São Paulo",
    country: "BR",
    website: "https://www.b3.com.br/en_us/",
    mark: "B3",
    tz: "America/Sao_Paulo",
    open: "10:00",
    close: "17:00",
    days: MON_FRI,
    region: "Americas",
  },
  LSE: {
    code: "LSE",
    name: "London Stock Exchange",
    city: "London",
    country: "GB",
    website: "https://www.londonstockexchange.com",
    mark: "LS",
    tz: "Europe/London",
    open: "08:00",
    close: "16:30",
    days: MON_FRI,
    region: "Europe",
  },
  XETRA: {
    code: "XETRA",
    name: "Deutsche Börse Xetra",
    city: "Frankfurt",
    country: "DE",
    website: "https://www.boerse-frankfurt.de/en",
    mark: "DX",
    tz: "Europe/Berlin",
    open: "09:00",
    close: "17:30",
    days: MON_FRI,
    region: "Europe",
  },
  EURONEXT: {
    code: "EURONEXT",
    name: "Euronext Paris",
    city: "Paris",
    country: "FR",
    website: "https://www.euronext.com",
    mark: "EN",
    tz: "Europe/Paris",
    open: "09:00",
    close: "17:30",
    days: MON_FRI,
    region: "Europe",
  },
  SIX: {
    code: "SIX",
    name: "SIX Swiss Exchange",
    city: "Zurich",
    country: "CH",
    website:
      "https://www.six-group.com/en/products-services/the-swiss-stock-exchange.html",
    mark: "SX",
    tz: "Europe/Zurich",
    open: "09:00",
    close: "17:30",
    days: MON_FRI,
    region: "Europe",
  },
  TSE: {
    code: "TSE",
    name: "Tokyo Stock Exchange",
    city: "Tokyo",
    country: "JP",
    website: "https://www.jpx.co.jp/english/",
    mark: "JP",
    tz: "Asia/Tokyo",
    open: "09:00",
    close: "15:30",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  HKEX: {
    code: "HKEX",
    name: "Hong Kong Exchange",
    city: "Hong Kong",
    country: "HK",
    website: "https://www.hkex.com.hk",
    mark: "HK",
    tz: "Asia/Hong_Kong",
    open: "09:30",
    close: "16:00",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  SSE: {
    code: "SSE",
    name: "Shanghai Stock Exchange",
    city: "Shanghai",
    country: "CN",
    website: "https://english.sse.com.cn",
    mark: "SH",
    tz: "Asia/Shanghai",
    open: "09:30",
    close: "15:00",
    days: MON_FRI,
    region: "Asia-Pacific",
    holidayGroup: "CN",
  },
  NSE: {
    code: "NSE",
    name: "National Stock Exchange",
    city: "Mumbai",
    country: "IN",
    website: "https://www.nseindia.com",
    mark: "NS",
    tz: "Asia/Kolkata",
    open: "09:15",
    close: "15:30",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  KRX: {
    code: "KRX",
    name: "Korea Exchange",
    city: "Seoul",
    country: "KR",
    website: "https://global.krx.co.kr",
    mark: "KR",
    tz: "Asia/Seoul",
    open: "09:00",
    close: "15:30",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  SGX: {
    code: "SGX",
    name: "Singapore Exchange",
    city: "Singapore",
    country: "SG",
    website: "https://www.sgx.com",
    mark: "SG",
    tz: "Asia/Singapore",
    open: "09:00",
    close: "17:00",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  SET: {
    code: "SET",
    name: "Stock Exchange of Thailand",
    city: "Bangkok",
    country: "TH",
    website: "https://www.set.or.th/en/home",
    mark: "SET",
    tz: "Asia/Bangkok",
    open: "10:00",
    close: "16:30",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  ASX: {
    code: "ASX",
    name: "Australian Securities Exchange",
    city: "Sydney",
    country: "AU",
    website: "https://www.asx.com.au",
    mark: "AS",
    tz: "Australia/Sydney",
    open: "10:00",
    close: "16:00",
    days: MON_FRI,
    region: "Asia-Pacific",
  },
  JSE: {
    code: "JSE",
    name: "Johannesburg Stock Exchange",
    city: "Johannesburg",
    country: "ZA",
    website: "https://www.jse.co.za",
    mark: "JS",
    tz: "Africa/Johannesburg",
    open: "09:00",
    close: "17:00",
    days: MON_FRI,
    region: "Middle East / Africa",
  },
  TADAWUL: {
    code: "TADAWUL",
    name: "Saudi Exchange",
    city: "Riyadh",
    country: "SA",
    website: "https://www.saudiexchange.sa",
    mark: "SA",
    tz: "Asia/Riyadh",
    open: "10:00",
    close: "15:00",
    days: SUN_THU,
    region: "Middle East / Africa",
  },
};

/** A sensible global spread when the frame is left unconfigured. */
export const DEFAULT_CODES = [
  "NYSE",
  "NASDAQ",
  "LSE",
  "XETRA",
  "EURONEXT",
  "TSE",
  "HKEX",
  "SSE",
  "NSE",
  "SET",
  "ASX",
];

export type Status = "open" | "closed" | "holiday";

export interface MarketState {
  code: string;
  name: string;
  city: string;
  country: string;
  website: string;
  mark: string;
  tz: string;
  open: string;
  close: string;
  region: Region;
  status: Status;
  /** Minutes until the next transition: to close if open, to open if closed. */
  nextChangeMin: number;
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface TzParts {
  ymd: string;
  dow: number;
  /** Minutes into the day, including the seconds fraction (for live ticking). */
  minutes: number;
}

/** Wall-clock parts of `date` as seen in `tz`. */
function partsInTz(date: Date, tz: string): TzParts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date))
    if (p.type !== "literal") o[p.type] = p.value;
  return {
    ymd: `${o.year}-${o.month}-${o.day}`,
    dow: WEEKDAY[o.weekday] ?? 0,
    minutes: Number(o.hour) * 60 + Number(o.minute) + Number(o.second) / 60,
  };
}

function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

const DAY_MS = 86_400_000;
const DAY_MIN = 1440;

export function evaluate(ex: Exchange, now: Date): MarketState {
  const holidays = HOLIDAYS[ex.holidayGroup ?? ex.code] ?? [];
  const openMin = hhmmToMin(ex.open);
  const closeMin = hhmmToMin(ex.close);
  const today = partsInTz(now, ex.tz);

  const tradingDay = (dow: number, ymd: string) =>
    ex.days.includes(dow) && !holidays.includes(ymd);

  const meta = {
    code: ex.code,
    name: ex.name,
    city: ex.city,
    country: ex.country,
    website: ex.website,
    mark: ex.mark,
    tz: ex.tz,
    open: ex.open,
    close: ex.close,
    region: ex.region,
  };

  const openNow =
    tradingDay(today.dow, today.ymd) &&
    today.minutes >= openMin &&
    today.minutes < closeMin;

  if (openNow) {
    return { ...meta, status: "open", nextChangeMin: closeMin - today.minutes };
  }

  // Closed — find minutes until the next open. Whole days are approximated as
  // 1440 minutes (≤1h drift across a DST boundary, acceptable for a countdown).
  let nextOpen: number;
  if (tradingDay(today.dow, today.ymd) && today.minutes < openMin) {
    nextOpen = openMin - today.minutes; // opens later today
  } else {
    nextOpen = DAY_MIN - today.minutes + openMin; // start from tomorrow's open
    let found = false;
    for (let d = 1; d <= 10; d++) {
      const fp = partsInTz(new Date(now.getTime() + d * DAY_MS), ex.tz);
      if (tradingDay(fp.dow, fp.ymd)) {
        nextOpen = DAY_MIN - today.minutes + (d - 1) * DAY_MIN + openMin;
        found = true;
        break;
      }
    }
    if (!found) nextOpen = -1; // no trading day within 10 days (shouldn't happen)
  }

  const holidayToday =
    ex.days.includes(today.dow) && holidays.includes(today.ymd);

  return {
    ...meta,
    status: holidayToday ? "holiday" : "closed",
    nextChangeMin: nextOpen,
  };
}

const REGION_ORDER: Region[] = [
  "Americas",
  "Europe",
  "Asia-Pacific",
  "Middle East / Africa",
];
const STATUS_ORDER: Record<Status, number> = { open: 0, holiday: 1, closed: 2 };

export function sortStates(
  states: MarketState[],
  by: "region" | "status" | "name",
): MarketState[] {
  const rows = [...states];
  if (by === "name") {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  } else if (by === "status") {
    rows.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.nextChangeMin - b.nextChangeMin,
    );
  } else {
    rows.sort(
      (a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region),
    );
  }
  return rows;
}

/** "3h 12m" / "47m" / "<1m" / "2d 4h" from a minute count. */
export function formatCountdown(min: number): string {
  if (min < 0) return "—";
  if (min < 1) return "<1m";
  const total = Math.floor(min);
  const days = Math.floor(total / DAY_MIN);
  const hours = Math.floor((total % DAY_MIN) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
