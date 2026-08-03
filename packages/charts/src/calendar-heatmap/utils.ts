import { quantileSorted } from "d3";

export interface CalendarDatum {
  /**
   * Epoch milliseconds, or a bare `YYYY-MM-DD` date. Strings are read as
   * **local** midnight (see {@link parseDay}).
   */
  date: number | string;
  value: number;
}

/** One square in the grid — a calendar day, with `value: null` for a gap. */
export interface CalendarDay {
  /** Local midnight of the day, epoch ms. */
  time: number;
  /** Column index, 0 = leftmost week. */
  week: number;
  /** Row index, 0 = the grid's week-start weekday. */
  weekday: number;
  /** The day's datum, or null when the series has no reading for it. */
  value: number | null;
  /**
   * Whether the day falls inside the requested window, as opposed to the week
   * padding the grid needs to stay rectangular.
   *
   * The two kinds of blank square mean different things and must not be
   * conflated: `inWindow` with a null value is a real hole in the series (a
   * weekend, a market holiday, a dropped print), while `!inWindow` is simply
   * outside the frame. Month labels and legends key off this — a series that
   * only prints weekly still spans every month between its ends.
   */
  inWindow: boolean;
}

export type WeekStart = "sunday" | "monday";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Local midnight of the day `date` falls on.
 *
 * A bare `YYYY-MM-DD` is deliberately read as **local** midnight, not UTC:
 * `new Date("2026-08-03")` is UTC midnight, which west of Greenwich is still
 * August 2nd locally — so a UTC read would slide every square one column left
 * for half the world. Same reasoning as the event-marker layer.
 */
export function parseDay(date: number | string): number {
  if (typeof date === "number") {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const iso = ISO_DATE.exec(date);
  if (iso)
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
    ).getTime();
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return Number.NaN;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of the `weekStart` day on or before `time`. */
export function startOfWeek(time: number, weekStart: WeekStart): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // Sun=0 … Sat=6
  const back = weekStart === "monday" ? (dow + 6) % 7 : dow;
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** Row index of `time` for a grid starting the week on `weekStart`. */
export function weekdayIndex(time: number, weekStart: WeekStart): number {
  const dow = new Date(time).getDay();
  return weekStart === "monday" ? (dow + 6) % 7 : dow;
}

/**
 * Expand a sparse daily series into the full week-aligned grid it occupies —
 * every calendar day between the bounds, whether the series has a reading for
 * it or not.
 *
 * The gaps are the point: a weekend, a market holiday or a dropped print reads
 * as an empty square rather than silently closing up, which is what makes the
 * rhythm of a series legible. Callers that only plotted their data points would
 * get a grid that lies about which days those points fall on.
 *
 * Days are stepped with `setDate`, not by adding 86 400 000 ms, so a DST
 * boundary doesn't shift the whole grid by an hour and round a day away.
 * Duplicate dates resolve last-wins.
 */
export function buildCalendarGrid(
  data: readonly CalendarDatum[],
  options: {
    weekStart?: WeekStart;
    /** Window override; defaults to the series' own first/last day. */
    from?: number | string;
    to?: number | string;
  } = {},
): { days: CalendarDay[]; weeks: number } {
  const { weekStart = "sunday" } = options;

  const byDay = new Map<number, number>();
  for (const d of data) {
    const day = parseDay(d.date);
    if (!Number.isFinite(day) || !Number.isFinite(d.value)) continue;
    byDay.set(day, d.value);
  }

  const from = options.from !== undefined ? parseDay(options.from) : undefined;
  const to = options.to !== undefined ? parseDay(options.to) : undefined;
  const keys = [...byDay.keys()];
  const first = from ?? (keys.length ? Math.min(...keys) : undefined);
  const last = to ?? (keys.length ? Math.max(...keys) : undefined);
  if (first === undefined || last === undefined || last < first)
    return { days: [], weeks: 0 };

  const days: CalendarDay[] = [];
  const cursor = new Date(startOfWeek(first, weekStart));
  const endOfGrid = new Date(startOfWeek(last, weekStart));
  endOfGrid.setDate(endOfGrid.getDate() + 6);

  let index = 0;
  while (cursor.getTime() <= endOfGrid.getTime()) {
    const time = cursor.getTime();
    const inWindow = time >= first && time <= last;
    const value = byDay.get(time);
    days.push({
      time,
      week: Math.floor(index / 7),
      weekday: index % 7,
      // Out-of-window days padding the first/last week are gaps, not zeroes.
      value: inWindow && value !== undefined ? value : null,
      inWindow,
    });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return { days, weeks: Math.ceil(days.length / 7) };
}

/**
 * A quantile ramp over `magnitudes`, mapping one to a discrete level in
 * `1…levels`.
 *
 * Quantiles rather than a linear min→max split because financial series are
 * fat-tailed: one 2020-March day sets a maximum that leaves every ordinary day
 * in the palest band, i.e. a heatmap of a single square. Ranking instead of
 * scaling keeps the busy days distinguishable from the quiet ones, which is
 * what the grid is read for.
 *
 * Ties fall in the lower band (`>` not `>=`), so a series that sits at zero
 * most days doesn't promote the whole flat run into a mid tone.
 */
export function levelScale(
  magnitudes: readonly number[],
  levels: number,
): (magnitude: number) => number {
  const sorted = magnitudes
    .filter((m) => Number.isFinite(m))
    .sort((a, b) => a - b);
  if (sorted.length === 0 || levels <= 1)
    return () => (levels > 0 ? levels : 1);
  // A perfectly flat sample has no ranking to express; showing it all at full
  // strength beats picking an arbitrary band.
  if (sorted[0] === sorted[sorted.length - 1]) return () => levels;

  const thresholds: number[] = [];
  for (let i = 1; i < levels; i += 1)
    thresholds.push(quantileSorted(sorted, i / levels) ?? sorted[0]);

  return (magnitude) => {
    if (!Number.isFinite(magnitude)) return 1;
    let level = 1;
    for (const t of thresholds) if (magnitude > t) level += 1;
    return Math.min(level, levels);
  };
}

/** `YYYY-M` key identifying the calendar month `time` falls in. */
const monthKey = (time: number): string => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

/**
 * Which week columns get a month label, and what it reads.
 *
 * A label is placed on the first column whose week *starts* a new month, so it
 * sits over the first full week of that month rather than over the stub week
 * that mostly belongs to the previous one. Two rules keep it honest:
 *
 * - **Only months the window actually spans are labelled.** The leading column
 *   is padded back to its week start, so a window opening on Thursday 1 January
 *   begins with four December squares — labelling that column "Dec" reads as if
 *   the series started in December. Spanned, not *populated*: a series that only
 *   prints weekly still passes through every month between its ends, and
 *   dropping the labels of its quiet months would blank the axis mid-grid.
 * - **Labels closer together than `minGapWeeks` are dropped.** At small cell
 *   sizes "Jan Feb Mar" overlaps into mush, and a missing label beats an
 *   unreadable one.
 */
export function monthLabels(
  days: readonly CalendarDay[],
  minGapWeeks = 3,
): { week: number; label: string }[] {
  const firstOfColumn = new Map<number, number>();
  const spanned = new Set<string>();
  for (const day of days) {
    if (!firstOfColumn.has(day.week)) firstOfColumn.set(day.week, day.time);
    if (day.inWindow) spanned.add(monthKey(day.time));
  }

  const out: { week: number; label: string }[] = [];
  let previousMonth = "";
  let lastLabelledWeek = Number.NEGATIVE_INFINITY;
  for (const [week, time] of [...firstOfColumn].sort((a, b) => a[0] - b[0])) {
    const month = monthKey(time);
    if (month === previousMonth) continue;
    previousMonth = month;
    if (!spanned.has(month)) continue;
    if (week - lastLabelledWeek < minGapWeeks) continue;
    lastLabelledWeek = week;
    out.push({
      week,
      label: new Date(time).toLocaleDateString("en-US", { month: "short" }),
    });
  }
  return out;
}

/** Weekday row labels for `weekStart`, in row order. */
export function weekdayLabels(weekStart: WeekStart): string[] {
  const sunFirst = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return weekStart === "monday"
    ? [...sunFirst.slice(1), sunFirst[0]]
    : sunFirst;
}
