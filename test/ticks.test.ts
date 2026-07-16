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
import { PRESETS } from "../src/export";

/**
 * Render for real and report what Chart.js decided — not what detect.ts intended.
 *
 * `onData` is the assertion that matters. The first version of this file checked the label's
 * *shape* (`/^[A-Z][a-z]{2} \d{4}$/`), which passes identically whether every tick sits on a
 * data point or none does — so it was green while month-end data read a month late. Assert the
 * property the axis must have, not a string describing it.
 */
function axisOf(csv: string, size = { w: 1200, h: 675 }) {
  const parsed = parseCsv(csv);
  const detection = detectChart(parsed);
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const config = buildConfig(parsed, detection, { title: "t", width: size.w, height: size.h, animate: false });
  config.options = { ...config.options, responsive: false, animation: false, devicePixelRatio: 1 };
  const chart = new Chart(canvas, config);
  const unit = (chart.scales.x as unknown as { _unit?: string })._unit;
  const ticks = chart.scales.x.getTicks().map((t) => ({ value: t.value, label: String(t.label) }));
  chart.destroy();
  canvas.width = 0;
  canvas.height = 0;

  const points = new Set(parsed.columns[0].times.filter((t) => !Number.isNaN(t)));
  const onData = ticks.filter((t) => points.has(t.value)).length;
  return { unit, labels: ticks.map((t) => t.label), ticks, onData, total: ticks.length };
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

const monthly = (n: number) => series("2025-01-01", n, (_d, i) => new Date(2025, i, 1));
/** Monthly, but dated mid-month — where period-start ticks and the data part company. */
const onDay = (n: number, day: number) => series("2025-01-01", n, (_d, i) => new Date(2025, i, day));
/** Month-end close: how essentially all finance and ops monthly data is dated. */
const monthEnd = (n: number) => series("2025-01-01", n, (_d, i) => new Date(2025, i + 1, 0));
const quarterEnd = (n: number) => series("2025-01-01", n, (_d, i) => new Date(2025, i * 3 + 3, 0));
const weekly = (n: number) => series("2025-01-07", n, (_d, i) => new Date(2025, 0, 7 + i * 7));
const daily = (n: number) => series("2025-01-01", n, (_d, i) => new Date(2025, 0, 1 + i));
const yearly = (n: number) => series("2019-01-01", n, (_d, i) => new Date(2019 + i, 0, 1));
const bareYears = (n: number) =>
  ["year,v", ...Array.from({ length: n }, (_, i) => `${2019 + i},${10 + i}`)].join("\n");
const hourly = (n: number) =>
  ["when,v", ...Array.from({ length: n }, (_, i) => `2025-01-01T${String(9 + i).padStart(2, "0")}:00:00,${i}`)].join("\n");

/** Every shape, and the unit it must be labelled by. `undefined` = Chart.js's call. */
const SHAPES: [string, string, string | undefined][] = [
  // Monthly dated the 1st is the ONLY day-of-month where period-start ticks coincide with the
  // data. The first version of this file tested nothing else, so it could not fail — the same
  // trap as docs/hero.png being the one chart anyone looked at.
  ["monthly, on the 1st", monthly(6), "month"],
  ["monthly, on the 15th", onDay(6, 15), "month"],
  ["monthly, month-end close", monthEnd(6), "month"],
  ["quarterly, quarter-end", quarterEnd(4), "quarter"],
  ["3 monthly points (a quarter)", monthly(3), "month"],
  ["12 monthly points (the sample)", monthly(12), "month"],
  ["24 monthly points", monthly(24), "month"],
  ["yearly, written as full dates", yearly(6), "year"],
  ["bare years under a year header", bareYears(6), "year"],
  ["weekly (docs/hero.png's shape)", weekly(16), "day"],
  ["daily", daily(20), "day"],
  ["sub-daily", hourly(10), undefined],
];

describe.each(PRESETS)("at the $id preset", (preset) => {
  const size = { w: preset.width, h: preset.height };

  // The property, asserted at every preset — not the label's shape at one. A daily CSV came
  // out "Jan 1, Jan 4" at 1200x675 and "12AM, 10AM, 8PM" at A4 on data with no clock in it,
  // and a suite that only rendered at 1200x675 could never see it.
  it.each(SHAPES)("%s — every tick is a date the file has", (_name, csv, _unit) => {
    const { onData, total, labels } = axisOf(csv, size);
    expect(total).toBeGreaterThan(0);
    expect({ onData, total, labels }).toEqual({ onData: total, total, labels });
  });

  it.each(SHAPES.filter(([, , u]) => u !== undefined))("%s — ticks by its own unit", (_name, csv, unit) => {
    expect(axisOf(csv, size).unit).toBe(unit);
  });
});
