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
const PALETTE = ["#155e4c", "#cf8636", "#6b7f92", "#a86a5f", "#8a8199", "#6f8a76"];

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
function tickUnit(times: number[]): "month" | "quarter" | "year" | undefined {
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
  return undefined;
}

export interface BuildOpts {
  title: string;
  /** Target pixel size; used to scale fonts so large exports stay legible. */
  width: number;
  height: number;
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
  // so those posted as ~5px. Width-based with a floor puts every social preset at ~2% ticks
  // and ~4% title; the ceiling still belongs to A4, where the constraint is a 300-DPI sheet.
  //
  // These were one scale until 2026-07-16, and sharing it is a trap: raising it for legibility
  // inflated the dots and rules too, and turned a restrained chart into a chunky one. The
  // numbers said 2% and looked fine — the rendered PNG did not.
  const fontScale = clamp(opts.width / 600, 1.6, 4);
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
            ticks: ticks({ maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }),
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
