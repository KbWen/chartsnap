// Guards the hand-rolled Chart.js date adapter that replaced date-fns. Every case
// below was cross-checked against date-fns before that dependency was dropped; the
// one deliberate divergence (leap-day month diff) is noted at the bottom.
//
// All dates are built from local components, so these assertions hold in any timezone.
import { _adapters } from "chart.js";
import { describe, expect, it } from "vitest";
import "../src/date-adapter";

const a = new _adapters._date({});
const at = (...args: [number, number, number?, number?, number?, number?, number?]): number =>
  +new Date(args[0], args[1], args[2] ?? 1, args[3] ?? 0, args[4] ?? 0, args[5] ?? 0, args[6] ?? 0);

describe("date adapter: formatting", () => {
  const t = at(2025, 0, 15, 13, 45, 30, 120); // Wed 15 Jan 2025, 1:45:30.120 PM

  it("renders each display format", () => {
    const f = a.formats();
    expect(a.format(t, f.datetime)).toBe("Jan 15, 2025, 1:45:30 PM");
    expect(a.format(t, f.millisecond)).toBe("1:45:30.120 PM");
    expect(a.format(t, f.second)).toBe("1:45:30 PM");
    expect(a.format(t, f.minute)).toBe("1:45 PM");
    expect(a.format(t, f.hour)).toBe("1PM");
    expect(a.format(t, f.day)).toBe("Jan 15");
    expect(a.format(t, f.week)).toBe("Jan 15, 2025");
    expect(a.format(t, f.month)).toBe("Jan 2025");
    expect(a.format(t, f.quarter)).toBe("Q1 - 2025");
    expect(a.format(t, f.year)).toBe("2025");
  });

  it("uses 12-hour clock at the midnight/noon boundaries", () => {
    expect(a.format(at(2025, 0, 15, 0, 5), "h:mm a")).toBe("12:05 AM");
    expect(a.format(at(2025, 0, 15, 12, 0), "h:mm a")).toBe("12:00 PM");
    expect(a.format(at(2025, 0, 15, 23, 0), "ha")).toBe("11PM");
  });

  it("labels the right quarter", () => {
    expect(a.format(at(2025, 8, 30), "QQQ")).toBe("Q3");
    expect(a.format(at(2025, 11, 31), "QQQ")).toBe("Q4");
  });
});

describe("date adapter: parse", () => {
  it("passes timestamps through and reads Dates + ISO strings", () => {
    const t = at(2025, 0, 15);
    expect(a.parse(t)).toBe(t);
    expect(a.parse(new Date(t))).toBe(t);
    expect(a.parse("2025-01-15T00:00:00.000Z")).toBe(Date.UTC(2025, 0, 15));
  });

  it("returns null for nothing-like and unparseable input", () => {
    expect(a.parse(null)).toBeNull();
    expect(a.parse(undefined)).toBeNull();
    expect(a.parse(NaN)).toBeNull();
    expect(a.parse("not a date")).toBeNull();
  });
});

describe("date adapter: startOf / endOf", () => {
  const t = at(2025, 0, 15, 13, 45, 30, 120); // a Wednesday

  it("brackets each calendar period", () => {
    expect(a.startOf(t, "day")).toBe(at(2025, 0, 15));
    expect(a.startOf(t, "month")).toBe(at(2025, 0, 1));
    expect(a.startOf(t, "year")).toBe(at(2025, 0, 1));
    expect(a.startOf(at(2025, 8, 30), "quarter")).toBe(at(2025, 6, 1));
    expect(a.startOf(t, "hour")).toBe(at(2025, 0, 15, 13));
    expect(a.startOf(t, "minute")).toBe(at(2025, 0, 15, 13, 45));
    expect(a.startOf(t, "second")).toBe(at(2025, 0, 15, 13, 45, 30));
  });

  it("starts weeks on Sunday, and on the requested weekday for isoWeek", () => {
    expect(a.startOf(t, "week")).toBe(at(2025, 0, 12)); // Sunday
    expect(a.startOf(t, "isoWeek", 1)).toBe(at(2025, 0, 13)); // Monday
    expect(a.startOf(t, "isoWeek", 3)).toBe(at(2025, 0, 15)); // Wednesday: t's own day
  });

  it("ends a month on its real last day, leap year included", () => {
    expect(a.endOf(at(2024, 1, 10), "month")).toBe(at(2024, 1, 29, 23, 59, 59, 999));
    expect(a.endOf(at(2025, 1, 10), "month")).toBe(at(2025, 1, 28, 23, 59, 59, 999));
    expect(a.endOf(at(2025, 5, 5), "year")).toBe(at(2025, 11, 31, 23, 59, 59, 999));
  });

  it("leaves sub-period units untouched", () => {
    expect(a.startOf(t, "millisecond")).toBe(t);
    expect(a.endOf(t, "millisecond")).toBe(t);
  });
});

describe("date adapter: add", () => {
  it("clamps month/quarter/year arithmetic instead of overflowing", () => {
    expect(a.add(at(2025, 0, 31), 1, "month")).toBe(at(2025, 1, 28)); // not Mar 3
    expect(a.add(at(2025, 10, 30), 1, "quarter")).toBe(at(2026, 1, 28)); // Feb has no 30th
    expect(a.add(at(2024, 1, 29), 1, "year")).toBe(at(2025, 1, 28)); // leap day → Feb 28
  });

  it("rolls days and weeks over month boundaries", () => {
    expect(a.add(at(2025, 0, 31), 1, "day")).toBe(at(2025, 1, 1));
    expect(a.add(at(2025, 0, 29), 1, "week")).toBe(at(2025, 1, 5));
    expect(a.add(at(2025, 0, 1), -1, "day")).toBe(at(2024, 11, 31));
  });

  it("adds sub-day units as exact durations", () => {
    const t = at(2025, 0, 15, 13, 0);
    expect(a.add(t, 90, "minute")).toBe(t + 90 * 60_000);
    expect(a.add(t, 2, "hour")).toBe(t + 2 * 3_600_000);
    expect(a.add(t, -500, "millisecond")).toBe(t - 500);
  });
});

describe("date adapter: diff", () => {
  it("counts only whole elapsed units", () => {
    expect(a.diff(at(2025, 2, 30), at(2025, 1, 28), "month")).toBe(1);
    expect(a.diff(at(2025, 2, 27), at(2025, 1, 28), "month")).toBe(0); // a day short
    expect(a.diff(at(2025, 0, 1), at(2024, 5, 1), "year")).toBe(0);
    expect(a.diff(at(2025, 0, 3), at(2025, 0, 1), "day")).toBe(2);
  });

  it("is signed, and never reports -0", () => {
    expect(a.diff(at(2025, 1, 1), at(2025, 2, 1), "month")).toBe(-1);
    expect(Object.is(a.diff(at(2025, 0, 10), at(2025, 1, 20), "quarter"), 0)).toBe(true);
    expect(Object.is(a.diff(at(2025, 0, 1), at(2025, 0, 2), "year"), 0)).toBe(true);
  });

  // Deliberate divergence from date-fns, which nudges late-February dates to the 30th
  // (differenceInMonths.js) before comparing. We report the plain calendar count. This
  // only shifts which unit labels the axis when a bound lands on Feb 28-29.
  it("counts leap-day months by the calendar, not date-fns's workaround", () => {
    expect(a.diff(at(2024, 1, 29), at(2025, 11, 31), "month")).toBe(-22);
  });
});

// A local day is 23 or 25 hours around a DST switch, so `diff` must count calendar days
// rather than divide by 86_400_000. CI runs in UTC, which never exercises this — so pin
// the zone here. Vitest isolates each test file in its own process (pool: "forks").
describe("date adapter: diff across DST boundaries", () => {
  const withTz = (tz: string, fn: () => void): void => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      // Fail loudly rather than pass vacuously if the runtime ignores TZ.
      expect(new Date(2025, 0, 1).getTimezoneOffset()).not.toBe(new Date(2025, 6, 1).getTimezoneOffset());
      fn();
    } finally {
      process.env.TZ = prev;
    }
  };

  it("spring-forward: a 23-hour day still counts as one day", () => {
    withTz("America/New_York", () => {
      // 2025-03-09 loses an hour, so Mar 8 12:00 → Mar 10 12:00 spans only 47 real hours.
      expect(a.diff(at(2025, 2, 10, 12), at(2025, 2, 8, 12), "day")).toBe(2);
      expect(a.diff(at(2025, 2, 9, 12), at(2025, 2, 8, 12), "day")).toBe(1);
      expect(a.diff(at(2025, 2, 15, 12), at(2025, 2, 8, 12), "week")).toBe(1);
    });
  });

  it("fall-back: a 25-hour day still counts as one day", () => {
    withTz("America/New_York", () => {
      expect(a.diff(at(2025, 10, 3, 12), at(2025, 10, 1, 12), "day")).toBe(2);
      expect(a.diff(at(2025, 10, 2, 12), at(2025, 10, 1, 12), "day")).toBe(1);
    });
  });

  it("holds in the southern hemisphere, where DST runs the other way", () => {
    withTz("Australia/Sydney", () => {
      expect(a.diff(at(2025, 9, 6, 12), at(2025, 9, 4, 12), "day")).toBe(2); // Oct 5 spring-forward
      expect(a.diff(at(2025, 3, 7, 12), at(2025, 3, 5, 12), "day")).toBe(2); // Apr 6 fall-back
    });
  });

  it("round-trips add/diff over a range spanning both switches", () => {
    withTz("Europe/Berlin", () => {
      const start = at(2025, 0, 15, 12);
      for (const n of [1, 7, 90, 210, 365]) {
        expect(a.diff(a.add(start, n, "day"), start, "day")).toBe(n);
      }
    });
  });
});
