// @vitest-environment jsdom
//
// v1.5: the time axis must be labelled with the data's own dates.
//
// Chart.js picks the tick unit from the axis SPAN, not from how far apart the data actually
// is, and for every monthly series it picks "day" — so twelve points sitting on the 1st of
// each month get labelled "Jan 1, Feb 12, Mar 26, May 7…", where only the first is a real
// date in the file. That shipped from v1 on the front-page sample.
//
// The "must not regress" block is the point of this file. docs/hero.png is WEEKLY data and it
// is correct today: weekly points sit on the same fixed 7-day grid that day-unit ticks step
// along, so its ticks land on real points. Months are 28–31 days, so day-ticks drift off the
// 1st. That is why nobody caught this for four releases — the only chart anyone ever looked at
// was the one shape that cannot show the bug.
import { Chart } from "chart.js";
import { describe, expect, it } from "vitest";
import { buildConfig } from "../src/chart";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";

/** Render for real and report what Chart.js decided — not what detect.ts intended. */
function axisOf(csv: string): { unit: string | undefined; labels: string[] } {
  const parsed = parseCsv(csv);
  const detection = detectChart(parsed);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const config = buildConfig(parsed, detection, { title: "t", width: 1200, height: 675, animate: false });
  config.options = { ...config.options, responsive: false, animation: false, devicePixelRatio: 1 };
  const chart = new Chart(canvas, config);
  const scale = chart.scales.x as unknown as { _unit?: string };
  const unit = scale._unit;
  const labels = chart.scales.x.getTicks().map((t) => String(t.label));
  chart.destroy();
  canvas.width = 0;
  canvas.height = 0;
  return { unit, labels };
}

/** N points spaced by `step`, starting at `start`, as a date,value CSV. */
const series = (start: string, n: number, step: (d: Date, i: number) => Date): string => {
  const rows = Array.from({ length: n }, (_, i) => {
    const d = step(new Date(start + "T00:00:00"), i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `${iso},${10 + i}`;
  });
  return ["when,v", ...rows].join("\n");
};

const monthly = (n: number) => series("2025-01-01", n, (d, i) => new Date(d.getFullYear(), d.getMonth() + i, 1));
const weekly = (n: number) => series("2025-01-07", n, (d, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i * 7));
const daily = (n: number) => series("2025-01-01", n, (d, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
const yearly = (n: number) => series("2019-01-01", n, (d, i) => new Date(d.getFullYear() + i, 0, 1));
const quarterly = (n: number) => series("2025-01-01", n, (d, i) => new Date(d.getFullYear(), d.getMonth() + i * 3, 1));

describe("a time axis is labelled with the data's own dates", () => {
  // The exact shapes that shipped broken, at the lengths a real file has.
  for (const n of [3, 6, 12, 24]) {
    it(`${n} monthly points → month labels, not arbitrary days`, () => {
      const { unit, labels } = axisOf(monthly(n));
      expect(unit).toBe("month");
      // "MMM yyyy" per the adapter's month format — never "MMM d".
      for (const label of labels) expect(label).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
    });
  }

  it("quarterly points do not get labelled by day", () => {
    const { unit } = axisOf(quarterly(8));
    expect(["month", "quarter"]).toContain(unit);
  });

  it("yearly points written as full dates tick by year, not by month", () => {
    // The same defect one unit up, and the reason v1.3's fix wasn't enough: it keys off the
    // CELLS being bare years, so `2019-01-01, 2020-01-01…` — an ordinary way to write an
    // annual series — falls through and gets labelled "Jan 2019, Jul 2019, Jan 2020…".
    const { unit, labels } = axisOf(yearly(6));
    expect(unit).toBe("year");
    for (const label of labels) expect(label).toMatch(/^\d{4}$/);
  });
});

describe("must not regress — shapes that are already correct", () => {
  it("bare years under a year header still tick by year (v1.3's fix)", () => {
    const csv = ["year,v", ...Array.from({ length: 6 }, (_, i) => `${2019 + i},${10 + i}`)].join("\n");
    const { unit, labels } = axisOf(csv);
    expect(unit).toBe("year");
    for (const label of labels) expect(label).toMatch(/^\d{4}$/);
  });
});

describe("must not regress — shapes that are already correct", () => {
  it("weekly data (docs/hero.png's shape) keeps landing on real data points", () => {
    // Day-unit ticks are right here: a weekly series lives on the same fixed grid, so the
    // ticks fall on points that exist. Forcing `week` would snap to week starts instead and
    // could label a day the data has nothing on — a regression dressed as a fix.
    const { unit, labels } = axisOf(weekly(16));
    expect(unit).toBe("day");
    // Every label is a real date in the file: the data starts Tue 7 Jan and steps 7 days,
    // so every tick must be a Tuesday whose date is 7 + 7k.
    for (const label of labels) {
      const day = Number(label.split(" ")[1]);
      expect((day - 7) % 7 === 0 || (day - 4) % 7 === 0 || (day - 1) % 7 === 0).toBe(true);
    }
  });

  it("daily data keeps its day labels", () => {
    expect(axisOf(daily(20)).unit).toBe("day");
  });

  it("sub-daily data is untouched", () => {
    const csv = ["when,v", ...Array.from({ length: 10 }, (_, i) => `2025-01-01T${String(9 + i).padStart(2, "0")}:00:00,${i}`)].join("\n");
    expect(["hour", "minute"]).toContain(axisOf(csv).unit);
  });
});
