import {
  Chart,
  type ChartConfiguration,
  type ChartDataset,
  type Plugin,
  registerables,
} from "chart.js";
import "chartjs-adapter-date-fns";
import type { Detection, ParsedCsv } from "./types";

Chart.register(...registerables);

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
  const fontScale = clamp(Math.min(opts.width, opts.height) / 700, 1, 4);
  const px = (n: number) => Math.round(n * fontScale);
  const font = {
    title: px(25),
    axis: px(12),
    ticks: px(12),
    legend: px(12.5),
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
