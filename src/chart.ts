import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  type ChartDataset,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  type Plugin,
  PointElement,
  ScatterController,
  TimeScale,
  Title,
  Tooltip,
} from "chart.js";
import "./date-adapter";
import type { Detection, ParsedCsv } from "./types";

// Register only what the three chart types need. `...registerables` would also pull in
// pie/doughnut/radar/polarArea/bubble, the radial + logarithmic scales, Filler and
// Decimation — none of which chartsnap can render (SPEC rules out a chart gallery).
Chart.register(
  BarController,
  LineController,
  ScatterController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Legend,
  Title,
  Tooltip
);

// canvas2svg's font parser rejects quoted/numeric family names, so use a
// quote-free, digit-free stack. It still renders nicely on canvas + PNG.
Chart.defaults.font.family =
  "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

// Two colours I actually like (deep pine + ochre) carry the common 1–2 series case;
// the rest are muted on purpose so they sit back instead of fighting for attention.
//
// The ochre was #cf8636 until 2026-07-16, which measured 2.903:1 against EXPORT_BG — under
// WCAG 1.4.11's 3:1 for graphical objects, i.e. the one colour in the output that provably
// excluded people. #ca8233 is 3.059:1 and ΔE00 1.37 away: hue moves 0.1°, chroma 0.5, and only
// lightness shifts, by 1.6 L*. Nobody can see it, and nobody has the original to compare to.
// Not #cb8335 or #cc8333, which are nominally legal and drop below 3:1 under a single 8-bit
// rounding step — margins thinner than the grid they ship on.
//
// NOTE for anyone forking: this line is 6 long and detect.ts's MAX_SERIES is 6 *by coincidence*,
// in another file, with nothing binding them — and the lookups below wrap with
// `i % PALETTE.length`. Today that coincidence is the only thing stopping two series being drawn
// in the same colour. Raise the cap without extending this array and you ship exactly the silent
// wrong chart this repo exists to prevent. See SPEC v1.6 for what else this palette owes.
export const PALETTE = ["#155e4c", "#ca8233", "#6b7f92", "#a86a5f", "#8a8199", "#6f8a76"];

/** Warm near-white background shared by the raster (PNG) and vector (SVG) exports. */
export const EXPORT_BG = "#fffdf8";

const THEME = {
  ink: "#1c1a15", // titles
  muted: "#6f6a5f", // ticks, axis labels, legend
  grid: "#ece6d9", // hairline gridlines
  bg: EXPORT_BG, // warm near-white export background
};

/** Paints an opaque, warm background so exported PNG/SVG aren't transparent. */
const background: Plugin = {
  id: "solidBackground",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const DAY_MS = 86_400_000;

/**
 * Pick the tick unit from how far apart the data actually is.
 *
 * Chart.js picks it from the axis *span* instead, and for a monthly series it lands on "day":
 * twelve points on the 1st of each month get labelled "Jan 1, Feb 12, Mar 26, May 7…" — only
 * the first of which is a date in the file. v1.3 fixed exactly this for bare years and left
 * every other spacing alone.
 *
 * Deliberately narrow: only months and coarser. Days and weeks sit on the same fixed grid that
 * day-ticks step along, so they already land on real points — docs/hero.png is weekly and is
 * correct today. Forcing "week" would snap ticks to week starts and could label a day the data
 * has nothing on, which is a regression wearing a fix's clothes.
 */
function tickUnit(times: number[]): "day" | "month" | "quarter" | "year" | undefined {
  const sorted = times.filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
  if (sorted.length < 2) return undefined;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  gaps.sort((a, b) => a - b);
  // Median, so one missing month or one duplicated timestamp can't decide the axis.
  const median = gaps[gaps.length >> 1];
  if (median >= 300 * DAY_MS) return "year";
  if (median >= 80 * DAY_MS) return "quarter";
  if (median >= 26 * DAY_MS) return "month"; // 26: a 28-day February still counts as monthly
  // A day apart or more is a date, so label it as one. Chart.js decides this from how many
  // labels fit, which depends on font size and canvas width — so the *same* daily CSV came out
  // "Jan 1, Jan 4" at preview size and "12AM, 10AM, 8PM" at A4, on data that has no clock in
  // it at all. Sub-daily data falls through to Chart.js, which is right: there the clock is
  // the point.
  if (median >= 20 * 3_600_000) return "day"; // 20h, not 24: a DST day is 23 hours long
  return undefined;
}

export interface BuildOpts {
  title: string;
  /** Target pixel size; used to scale fonts so large exports stay legible. */
  width: number;
  height: number;
  /**
   * The export preset's width, when `width` is a downscaled preview of it. Type is sized from
   * the preset and then scaled by the preview's own factor, so the preview's font-to-image
   * ratio matches the file that gets downloaded. Without it the preview overstated A4's type
   * by 45% — the clamp bit on the export path and not on the preview path.
   */
  basis?: number;
  animate?: boolean;
}

function num(n: number): number | null {
  return Number.isNaN(n) ? null : n;
}

/**
 * The single source of truth for every render target (preview, PNG, SVG).
 * Builds a Chart.js config from the parsed CSV + detected chart type.
 */
export function buildConfig(
  parsed: ParsedCsv,
  detection: Detection,
  opts: BuildOpts
): ChartConfiguration {
  // Geometry — padding, point radius, rule widths, bar caps — keeps the short-edge scale it
  // was tuned against, and looks right.
  const scale = clamp(Math.min(opts.width, opts.height) / 700, 1, 4);
  const px = (n: number) => Math.round(n * scale);

  // Type gets its own, because only type has to survive being *posted*. Keying it off the
  // short edge made landscape the worst case: a 1200×675 Twitter card scored 1 — 12px ticks,
  // a 25px title, 1% and 2% of its width — and a Twitter card renders ~500px wide in a feed,
  // so those posted as ~5px. Width-based puts every social preset at ~2% ticks and ~4% title;
  // the ceiling belongs to A4, where the constraint is a 300-DPI sheet rather than a phone.
  //
  // Sized from `basis` — the preset — and then scaled by the preview's own factor, so both
  // paths agree. Computing it from the *render* width instead let the ceiling bite on the
  // export and not on the preview, and the preview overstated A4's type by 45%: a preview
  // that lies is worse than no preview, and this file's own history says so.
  //
  // Type and geometry were one scale until 2026-07-16, and sharing it is a trap: raising it
  // for legibility inflated the dots and rules too and turned a restrained chart chunky. The
  // numbers said 2% and looked fine; the rendered PNG did not.
  const basis = opts.basis ?? opts.width;
  const fontScale = clamp(basis / 600, 1, 4) * (opts.width / basis);
  const fpx = (n: number) => Math.round(n * fontScale);
  const font = {
    title: fpx(25),
    axis: fpx(12),
    ticks: fpx(12),
    legend: fpx(12.5),
  };
  const multiSeries = detection.yColumns.length > 1 && detection.type !== "scatter";

  const plugins = {
    title: {
      display: Boolean(opts.title.trim()),
      text: opts.title,
      align: "start" as const,
      color: THEME.ink,
      font: { size: font.title, weight: 700 as const },
      padding: { top: px(4), bottom: multiSeries ? px(6) : px(16) },
    },
    legend: {
      display: multiSeries,
      position: "top" as const,
      align: "start" as const,
      labels: {
        usePointStyle: true,
        pointStyle: "circle" as const,
        color: THEME.muted,
        boxWidth: px(7),
        boxHeight: px(7),
        padding: px(14),
        font: { size: font.legend },
      },
    },
    tooltip: {
      enabled: opts.animate !== false,
      backgroundColor: THEME.ink,
      padding: 10,
      cornerRadius: 6,
      boxPadding: 4,
      usePointStyle: true,
    },
  };

  // Generous breathing room around the plot; the warm bg shows through.
  const layout = { padding: { top: px(18), right: px(24), bottom: px(12), left: px(10) } };

  const ticks = (extra: object = {}) => ({
    color: THEME.muted,
    font: { size: font.ticks },
    padding: px(6),
    ...extra,
  });
  const axisTitle = (text: string, display = true) => ({
    display,
    text,
    color: THEME.muted,
    font: { size: font.axis, weight: 500 as const },
    padding: { top: px(4), bottom: px(2) },
  });
  const yGrid = { color: THEME.grid, drawTicks: false, lineWidth: 1 };
  const noBorder = { display: false };

  // ---- scatter -----------------------------------------------------------
  if (detection.type === "scatter") {
    const [xc, yc] = detection.yColumns;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < parsed.rowCount; i++) {
      const x = xc.nums[i];
      const y = yc.nums[i];
      if (!Number.isNaN(x) && !Number.isNaN(y)) points.push({ x, y });
    }
    return {
      type: "scatter",
      data: {
        datasets: [
          {
            label: `${yc.name} vs ${xc.name}`,
            data: points,
            backgroundColor: PALETTE[0],
            pointRadius: px(4),
            pointHoverRadius: px(6),
            borderColor: THEME.bg,
            borderWidth: px(1),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: opts.animate === false ? false : undefined,
        layout,
        plugins,
        scales: {
          x: {
            type: "linear",
            title: axisTitle(xc.name),
            grid: { ...yGrid },
            border: noBorder,
            ticks: ticks(),
          },
          y: {
            title: axisTitle(yc.name),
            grid: yGrid,
            border: noBorder,
            ticks: ticks({ maxTicksLimit: 6 }),
          },
        },
      },
      plugins: [background],
    };
  }

  // ---- line (time axis) --------------------------------------------------
  if (detection.type === "line" && detection.timeAxis) {
    const x = detection.xColumn;
    const showPoints = parsed.rowCount <= 12;
    const datasets: ChartDataset<"line">[] = detection.yColumns.map((yc, i) => {
      const data: { x: number; y: number | null }[] = [];
      for (let r = 0; r < parsed.rowCount; r++) {
        const t = x.times[r];
        if (Number.isNaN(t)) continue;
        data.push({ x: t, y: num(yc.nums[r]) });
      }
      data.sort((a, b) => a.x - b.x);
      const color = PALETTE[i % PALETTE.length];
      return {
        label: yc.name,
        data: data as never,
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        borderWidth: Math.max(2, px(2.25)),
        pointRadius: showPoints ? px(3) : 0,
        pointHoverRadius: px(5),
        // Straight segments, not a spline: smoothing invents values between
        // real data points (indefensible on e.g. sparse monthly finance data).
        tension: 0,
        borderCapStyle: "round",
        borderJoinStyle: "round",
        spanGaps: false,
      };
    });
    return {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: opts.animate === false ? false : undefined,
        layout,
        plugins,
        scales: {
          x: {
            type: "time",
            // Left to itself Chart.js labels a monthly series by day — "Feb 12", "Mar 26" —
            // on dates the file has no data for. yearAxis stays explicit: a column of bare
            // years knows what it is regardless of how the rows happen to be spaced.
            ...(() => {
              const unit = detection.yearAxis ? ("year" as const) : tickUnit(x.times);
              return unit ? { time: { unit } } : {};
            })(),
            grid: { display: false },
            border: noBorder,
            // `source: "data"` is what makes a tick a date the file actually has. Forcing the
            // unit alone only fixes the label: Chart.js still steps ticks from the period
            // *start*, so monthly data dated the 15th, or a month-end close, got ticks on the
            // 1st and every point read a period late — an axis that looks authoritative and is
            // wrong, which is worse than the ugly-but-honest one it replaced.
            ticks: ticks({ maxRotation: 0, autoSkip: true, maxTicksLimit: 8, source: "data" }),
          },
          y: {
            title: axisTitle(detection.yColumns[0]?.name ?? "", !multiSeries),
            grid: yGrid,
            border: noBorder,
            ticks: ticks({ maxTicksLimit: 6 }),
          },
        },
      },
      plugins: [background],
    };
  }

  // ---- categorical line (line forced onto a category/index x, or no parseable dates) --
  if (detection.type === "line") {
    const labels = detection.xColumn.raw;
    const lineDatasets: ChartDataset<"line">[] = detection.yColumns.map((yc, i) => {
      const color = PALETTE[i % PALETTE.length];
      return {
        label: yc.name,
        data: labels.map((_, r) => num(yc.nums[r])) as never,
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        borderWidth: Math.max(2, px(2.25)),
        pointRadius: labels.length <= 12 ? px(3) : 0,
        pointHoverRadius: px(5),
        tension: 0,
        borderCapStyle: "round",
        borderJoinStyle: "round",
        spanGaps: false,
      };
    });
    return {
      type: "line",
      data: { labels, datasets: lineDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: opts.animate === false ? false : undefined,
        layout,
        plugins,
        scales: {
          x: {
            grid: { display: false },
            border: noBorder,
            ticks: ticks({ autoSkip: true, maxRotation: labels.length > 12 ? 55 : 0 }),
          },
          y: {
            title: axisTitle(detection.yColumns[0]?.name ?? "", !multiSeries),
            grid: yGrid,
            border: noBorder,
            ticks: ticks({ maxTicksLimit: 6 }),
          },
        },
      },
      plugins: [background],
    };
  }

  // ---- bar / categorical -------------------------------------------------
  const labels = detection.xColumn.raw;
  const datasets: ChartDataset<"bar">[] = detection.yColumns.map((yc, i) => {
    const color = PALETTE[i % PALETTE.length];
    return {
      label: yc.name,
      data: labels.map((_, r) => num(yc.nums[r])) as never,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: px(2),
      borderSkipped: false,
      maxBarThickness: px(96),
      categoryPercentage: 0.72,
      barPercentage: 0.86,
    };
  });

  return {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: opts.animate === false ? false : undefined,
      layout,
      plugins,
      scales: {
        x: {
          grid: { display: false },
          border: noBorder,
          ticks: ticks({ autoSkip: true, maxRotation: labels.length > 12 ? 55 : 0 }),
        },
        y: {
          beginAtZero: true,
          title: axisTitle(detection.yColumns[0]?.name ?? "", !multiSeries),
          grid: yGrid,
          border: noBorder,
          ticks: ticks({ maxTicksLimit: 6 }),
        },
      },
    },
    plugins: [background],
  };
}
