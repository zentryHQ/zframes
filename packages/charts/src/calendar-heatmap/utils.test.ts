import { describe, expect, it } from "vitest";
import {
  buildCalendarGrid,
  levelScale,
  monthLabels,
  parseDay,
  startOfWeek,
  weekdayIndex,
  weekdayLabels,
} from "./utils";

const local = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe("parseDay", () => {
  it("reads a bare ISO date as LOCAL midnight, not UTC", () => {
    // `new Date("2026-08-03")` is UTC midnight — west of Greenwich that is
    // still Aug 2 locally, which would shift every square a column left.
    expect(parseDay("2026-08-03")).toBe(local(2026, 7, 3));
    expect(new Date(parseDay("2026-08-03")).getDate()).toBe(3);
  });

  it("floors an epoch instant to that day's local midnight", () => {
    const noon = new Date(2026, 7, 3, 12, 34, 56, 789).getTime();
    expect(parseDay(noon)).toBe(local(2026, 7, 3));
  });

  it("accepts a full timestamp string", () => {
    expect(parseDay("2026-08-03T18:00:00Z")).toBe(local(2026, 7, 3));
  });

  it("returns NaN for junk so the grid can drop it", () => {
    expect(Number.isNaN(parseDay("not a date"))).toBe(true);
  });
});

describe("startOfWeek / weekdayIndex", () => {
  // 2026-08-03 is a Monday.
  const monday = local(2026, 7, 3);

  it("anchors on Sunday by default", () => {
    expect(startOfWeek(monday, "sunday")).toBe(local(2026, 7, 2));
    expect(weekdayIndex(monday, "sunday")).toBe(1);
  });

  it("anchors on Monday when asked", () => {
    expect(startOfWeek(monday, "monday")).toBe(monday);
    expect(weekdayIndex(monday, "monday")).toBe(0);
    expect(weekdayIndex(local(2026, 7, 2), "monday")).toBe(6); // Sunday last
  });

  it("is idempotent on a week-start day", () => {
    const sunday = startOfWeek(monday, "sunday");
    expect(startOfWeek(sunday, "sunday")).toBe(sunday);
  });
});

describe("buildCalendarGrid", () => {
  it("returns an empty grid for no data", () => {
    expect(buildCalendarGrid([])).toEqual({ days: [], weeks: 0 });
  });

  it("pads out to whole weeks and indexes week/weekday consistently", () => {
    const { days, weeks } = buildCalendarGrid([
      { date: "2026-08-03", value: 1 }, // Monday
      { date: "2026-08-14", value: 2 }, // Friday, 11 days later
    ]);
    expect(days.length % 7).toBe(0);
    expect(weeks).toBe(days.length / 7);
    for (const day of days) {
      expect(weekdayIndex(day.time, "sunday")).toBe(day.weekday);
      // Every square is a local midnight — the guard against stepping days by
      // adding 86_400_000 ms, which drifts an hour across a DST boundary.
      expect(new Date(day.time).getHours()).toBe(0);
    }
  });

  it("keeps one square per calendar day across DST boundaries", () => {
    // Spans both a spring-forward and a fall-back in DST timezones.
    const { days } = buildCalendarGrid([
      { date: "2026-02-01", value: 1 },
      { date: "2026-12-01", value: 1 },
    ]);
    const seen = new Set(days.map((d) => new Date(d.time).toDateString()));
    expect(seen.size).toBe(days.length);
    for (const day of days) expect(new Date(day.time).getHours()).toBe(0);
  });

  it("marks days the series never reported as gaps, not zeroes", () => {
    const { days } = buildCalendarGrid([
      { date: "2026-08-03", value: 5 },
      { date: "2026-08-05", value: 7 },
    ]);
    const byDate = new Map(days.map((d) => [d.time, d.value]));
    expect(byDate.get(local(2026, 7, 3))).toBe(5);
    expect(byDate.get(local(2026, 7, 4))).toBeNull();
    expect(byDate.get(local(2026, 7, 5))).toBe(7);
  });

  it("distinguishes week padding from a genuine gap in the series", () => {
    // Aug 3 is a Monday, so a Sunday-anchored grid pads Aug 2 in front. Both
    // squares are blank, but only one is a hole in the data.
    const { days } = buildCalendarGrid([
      { date: "2026-08-03", value: 5 },
      { date: "2026-08-05", value: 7 },
    ]);
    expect(days[0].time).toBe(local(2026, 7, 2));
    expect(days[0].value).toBeNull();
    expect(days[0].inWindow).toBe(false);

    const missing = days.find((d) => d.time === local(2026, 7, 4));
    expect(missing?.value).toBeNull();
    expect(missing?.inWindow).toBe(true);
  });

  it("honours an explicit window wider than the data", () => {
    const { days } = buildCalendarGrid([{ date: "2026-08-03", value: 5 }], {
      from: "2026-07-01",
      to: "2026-08-31",
    });
    expect(days[0].time).toBe(startOfWeek(local(2026, 6, 1), "sunday"));
    expect(days[days.length - 1].time).toBeGreaterThanOrEqual(
      local(2026, 7, 31),
    );
    expect(days.filter((d) => d.value !== null)).toHaveLength(1);
  });

  it("drops non-finite values and resolves duplicate dates last-wins", () => {
    const { days } = buildCalendarGrid([
      { date: "2026-08-03", value: 1 },
      { date: "2026-08-03", value: 9 },
      { date: "2026-08-04", value: Number.NaN },
    ]);
    const byDate = new Map(days.map((d) => [d.time, d.value]));
    expect(byDate.get(local(2026, 7, 3))).toBe(9);
    expect(byDate.get(local(2026, 7, 4))).toBeNull();
  });

  it("returns an empty grid when `to` precedes `from`", () => {
    expect(
      buildCalendarGrid([{ date: "2026-08-03", value: 1 }], {
        from: "2026-08-31",
        to: "2026-08-01",
      }).days,
    ).toEqual([]);
  });
});

describe("levelScale", () => {
  it("puts a flat sample at full strength rather than an arbitrary band", () => {
    const scale = levelScale([3, 3, 3, 3], 4);
    expect(scale(3)).toBe(4);
  });

  it("ranks by quantile, so one outlier can't wash out the rest", () => {
    // 1000 is 100x the next value: a linear min→max ramp would leave every
    // other day in band 1.
    const sample = [1, 2, 3, 4, 5, 6, 7, 1000];
    const scale = levelScale(sample, 4);
    expect(scale(1)).toBe(1);
    expect(scale(1000)).toBe(4);
    // The ordinary days still spread across the bands.
    expect(new Set(sample.slice(0, 7).map(scale)).size).toBeGreaterThan(1);
  });

  it("is monotonic and stays inside 1…levels", () => {
    const sample = Array.from({ length: 50 }, (_, i) => i);
    const scale = levelScale(sample, 5);
    let previous = 0;
    for (const v of sample) {
      const level = scale(v);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(5);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
    expect(scale(9999)).toBe(5);
  });

  it("keeps ties in the lower band so a flat run stays quiet", () => {
    // Mostly zeroes with a few busy days — the zeroes must not be promoted.
    const scale = levelScale([0, 0, 0, 0, 0, 0, 1, 2, 3, 4], 4);
    expect(scale(0)).toBe(1);
    expect(scale(4)).toBe(4);
  });

  it("survives an empty sample", () => {
    expect(levelScale([], 4)(1)).toBe(4);
  });
});

describe("monthLabels", () => {
  it("labels each month once, at the first week that starts it", () => {
    const { days } = buildCalendarGrid([
      { date: "2026-01-01", value: 1 },
      { date: "2026-04-15", value: 1 },
    ]);
    const labels = monthLabels(days, 1);
    expect(labels.map((l) => l.label)).toEqual(["Jan", "Feb", "Mar", "Apr"]);
    expect(labels.map((l) => l.week)).toEqual(
      [...labels.map((l) => l.week)].sort((a, b) => a - b),
    );
  });

  it("does not label the padded month the window never reaches", () => {
    // 2026-01-01 is a Thursday, so a Sunday-anchored grid opens with four
    // December squares — all padding. A "Dec" label there would read as if the
    // series started in December.
    const { days } = buildCalendarGrid([
      { date: "2026-01-01", value: 1 },
      { date: "2026-02-10", value: 1 },
    ]);
    expect(days[0].inWindow).toBe(false);
    expect(new Date(days[0].time).getMonth()).toBe(11);
    expect(monthLabels(days, 1).map((l) => l.label)).toEqual(["Jan", "Feb"]);
  });

  it("labels months the window spans even when they hold no data point", () => {
    // A weekly print must not blank the axis through its quiet months: the
    // window spans them, so they are labelled.
    const { days } = buildCalendarGrid([
      { date: "2026-01-05", value: 1 },
      { date: "2026-04-06", value: 1 },
    ]);
    expect(monthLabels(days, 1).map((l) => l.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
    ]);
  });

  it("drops labels that would collide at small cell sizes", () => {
    const { days } = buildCalendarGrid([
      { date: "2026-01-01", value: 1 },
      { date: "2026-06-30", value: 1 },
    ]);
    const tight = monthLabels(days, 1);
    const loose = monthLabels(days, 8);
    expect(loose.length).toBeLessThan(tight.length);
    for (let i = 1; i < loose.length; i += 1)
      expect(loose[i].week - loose[i - 1].week).toBeGreaterThanOrEqual(8);
  });
});

describe("weekdayLabels", () => {
  it("orders rows to match the grid's week start", () => {
    expect(weekdayLabels("sunday")[0]).toBe("Sun");
    expect(weekdayLabels("monday")[0]).toBe("Mon");
    expect(weekdayLabels("monday")[6]).toBe("Sun");
    expect(weekdayLabels("sunday")).toHaveLength(7);
  });
});
