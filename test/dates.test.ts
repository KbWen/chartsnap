// v1.4: which date shapes chartsnap accepts, and — the part that matters — which it must
// keep accepting. A 2026-07-16 pre-mortem killed the first draft of this work by pointing
// out that "no date reaches Date.parse" would turn every ISO-timestamped CSV on earth from
// a time-axis line into an evenly-spaced bar chart. Date.parse is only engine-defined for
// NON-ISO input; the shape check closes that path, not the function.
//
// The "keeps working" block is the guardrail: it must be green before AND after any change
// to cleanTime. A shape dropping from line/timeAxis to bar is a regression, not a trade.
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";

/**
 * Build a CSV of `cells` under `header`, plus a value column, and parse it. Cells carrying a
 * comma ("Jan 5, 2025") are quoted — unquoted they are two fields, and the cell silently
 * becomes "Jan 5", which Date.parse reads as 5 Jan *2001*. That is the bug under test, so a
 * fixture that trips over it proves nothing.
 */
const parse = (cells: string[], header = "when") => {
  const rows = cells.map((c, i) => `${c.includes(",") ? `"${c}"` : c},${i + 1}`);
  return parseCsv(`${header},v\n${rows.join("\n")}`);
};

const typeOf = (cells: string[], header = "when") => parse(cells, header).columns[0].type;

/** The chart a CSV of these cells actually produces — the thing a regression would break. */
const chartFor = (cells: string[], header = "when") => {
  const p = parse(cells, header);
  const d = detectChart(p);
  return { type: d.type, timeAxis: d.timeAxis };
};

/**
 * The must-keep-working list, and how it was built: run `Date.parse` — i.e. the behaviour
 * being narrowed — over the default output of real exporters, and keep everything it accepts.
 *
 * The first version of this list was written from the whitelist's own intent, so it could only
 * prove the whitelist matched itself, and it shipped seven silent regressions: psql's `+08`
 * offset, `2025/01/05 09:30`, `Jan 5 2025` without its comma, RFC 2822, BigQuery's ` UTC`.
 * Each fell to `category` and drew a bar chart of date strings, with `notes: []` — the exact
 * failure v1.2 exists to prevent, committed by the fix for it.
 */
const EXPORTER_SHAPES: [string, string[]][] = [
  ["ISO date", ["2025-01-05", "2025-02-10", "2025-03-15"]],
  ["ISO year-month", ["2025-01", "2025-02", "2025-03"]],
  ["ISO unpadded", ["2025-1-5", "2025-2-10", "2025-3-15"]],
  ["ISO instant (Z)", ["2025-01-01T09:30:00Z", "2025-01-02T09:30:00Z", "2025-01-03T09:30:00Z"]],
  ["ISO instant (ms)", ["2025-01-01T09:30:00.123Z", "2025-01-02T09:30:00.123Z", "2025-01-03T09:30:00.123Z"]],
  ["ISO offset", ["2025-01-05T09:30:00+08:00", "2025-01-06T09:30:00+08:00", "2025-01-07T09:30:00+08:00"]],
  ["ISO, no seconds", ["2025-01-05T09:30", "2025-01-06T09:30", "2025-01-07T09:30"]],
  ["ISO, no offset", ["2025-01-01T09:30:00", "2025-01-02T09:30:00", "2025-01-03T09:30:00"]],
  ["psql timestamp", ["2025-01-05 09:30:00", "2025-01-06 09:30:00", "2025-01-07 09:30:00"]],
  ["psql timestamptz (+08)", ["2025-01-05 09:30:00+08", "2025-01-06 09:30:00+08", "2025-01-07 09:30:00+08"]],
  ["psql, microseconds", ["2025-01-05 09:30:00.123456+08", "2025-01-06 09:30:00.123456+08", "2025-01-07 09:30:00.123456+08"]],
  ["BigQuery (named zone)", ["2025-01-05 09:30:00 UTC", "2025-01-06 09:30:00 UTC", "2025-01-07 09:30:00 UTC"]],
  ["Google Sheets (unpadded hour)", ["2025-01-05 9:30:00", "2025-01-06 9:30:00", "2025-01-07 9:30:00"]],
  ["pandas to_csv", ["2025-01-05 09:30:00.000", "2025-01-06 09:30:00.000", "2025-01-07 09:30:00.000"]],
  ["sqlite", ["2025-01-05 09:30", "2025-01-06 09:30", "2025-01-07 09:30"]],
  ["ISO unpadded + time", ["2025-1-5 09:30", "2025-1-6 09:30", "2025-1-7 09:30"]],
  ["slash, padded", ["2025/01/05", "2025/02/10", "2025/03/15"]],
  ["slash, unpadded", ["2025/1/5", "2025/2/10", "2025/3/15"]],
  ["slash + time", ["2025/01/05 09:30", "2025/01/06 09:30", "2025/01/07 09:30"]],
  ["month name + year", ["March 2025", "April 2025", "May 2025"]],
  ["abbrev month + year", ["Jan 2025", "Feb 2025", "Mar 2025"]],
  ["day month year", ["5 January 2025", "6 February 2025", "7 March 2025"]],
  ["month day, year", ["Jan 5, 2025", "Feb 10, 2025", "Mar 15, 2025"]],
  ["month day year (no comma)", ["Jan 5 2025", "Feb 10 2025", "Mar 15 2025"]],
  ["RFC 2822", ["Sun, 05 Jan 2025 09:30:00 GMT", "Mon, 06 Jan 2025 09:30:00 GMT", "Tue, 07 Jan 2025 09:30:00 GMT"]],
  ["JS Date.toString()", ["Sun Jan 05 2025 09:30:00 GMT+0800", "Mon Jan 06 2025 09:30:00 GMT+0800", "Tue Jan 07 2025 09:30:00 GMT+0800"]],
];

describe("date shapes that must keep working", () => {
  // If any of these stops being a time-axis line chart, the change that did it is wrong:
  // irregular samples drawn at equal bar width state something false about the data.
  for (const [label, cells] of EXPORTER_SHAPES) {
    it(`${label} → a time-axis line chart`, () => {
      expect(typeOf(cells)).toBe("date");
      expect(chartFor(cells)).toEqual({ type: "line", timeAxis: true });
    });
  }

  it("the list is not narrower than Date.parse, which is what it replaced", () => {
    // The guard against writing this list from the new rule's intent again: anything the
    // delegated parser accepted is a shape someone's export produces, so it must still chart.
    const missed = EXPORTER_SHAPES.filter(
      ([, cells]) => !Number.isNaN(Date.parse(cells[0])) && typeOf(cells) !== "date"
    ).map(([label, cells]) => `${label}: ${cells[0]}`);
    expect(missed).toEqual([]);
  });

  it("bare years under a year header still tick by year", () => {
    expect(typeOf(["2019", "2020", "2021"], "year")).toBe("date");
    expect(chartFor(["2019", "2020", "2021"], "year")).toEqual({ type: "line", timeAxis: true });
  });

  it("an instant keeps its exact moment, not just its type", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const t = parse(["2025-01-01T09:30:00Z", "2025-01-02T09:30:00Z", "2025-01-03T09:30:00Z"])
        .columns[0].times[0];
      expect(t).toBe(Date.UTC(2025, 0, 1, 9, 30));
    } finally {
      process.env.TZ = prev;
    }
  });
});

describe("shapes that must never be read as dates", () => {
  // All four render a confident, wrong chart today. A percent column is the worst: it
  // becomes the time axis and the real category column silently disappears.
  it("a percent column is not a date (Date.parse says 2001-12-03)", () => {
    expect(typeOf(["12.3%", "45.6%", "78.9%"])).not.toBe("date");
  });

  it("a whole-percent column is not a date (Date.parse says 2045-01-01)", () => {
    expect(typeOf(["45%", "38%", "52%"])).not.toBe("date");
  });

  it("Excel's Mmm-YY is not 25 Jan 2001", () => {
    // Date.parse("Jan-25") = 25 January 2001 — month read as day, year invented.
    expect(typeOf(["Jan-25", "Feb-25", "Mar-25"])).not.toBe("date");
  });

  it("a ROC/民國 date is not year 114 AD", () => {
    expect(typeOf(["114/01/05", "114/02/05", "114/03/05"])).not.toBe("date");
  });

  it("a percent column no longer hijacks the x axis", () => {
    // The whole point: `store` is the real category column and today it vanishes.
    const p = parseCsv("store,rate,sales\nA,45%,100\nB,38%,200\nC,52%,150");
    const d = detectChart(p);
    expect(d.timeAxis).toBe(false);
    expect(d.xColumn.name).toBe("store");
  });
});
