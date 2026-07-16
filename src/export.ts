import C2S from "canvas2svg";
import { BasicPlatform, Chart, type ChartConfiguration } from "chart.js";
import { buildConfig, EXPORT_BG } from "./chart";
import type { Detection, ExportPreset, ParsedCsv } from "./types";

export const PRESETS: ExportPreset[] = [
  { id: "twitter", label: "Twitter card · 1200×675", width: 1200, height: 675 },
  { id: "instagram", label: "IG post · 1080×1080", width: 1080, height: 1080 },
  // Stories is the thing people actually post from a phone, and a 1:1 export letterboxes
  // into it with grey bands. The layout code already handles portrait.
  { id: "story", label: "IG story · 1080×1920", width: 1080, height: 1920 },
  // A4 landscape at 300 DPI — crisp enough to drop into a printed report.
  { id: "a4print", label: "A4 print · 3508×2480", width: 3508, height: 2480 },
];

function exportConfig(
  parsed: ParsedCsv,
  detection: Detection,
  title: string,
  preset: ExportPreset
): ChartConfiguration {
  const config = buildConfig(parsed, detection, {
    title,
    width: preset.width,
    height: preset.height,
    animate: false,
  });
  config.options = {
    ...config.options,
    responsive: false,
    maintainAspectRatio: false,
    devicePixelRatio: 1,
    animation: false,
    events: [],
  };
  return config;
}

/** Render into a detached canvas at exact preset pixels. Caller must destroy the chart. */
function renderToCanvas(
  parsed: ParsedCsv,
  detection: Detection,
  title: string,
  preset: ExportPreset
): { canvas: HTMLCanvasElement; chart: Chart } {
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const chart = new Chart(canvas, exportConfig(parsed, detection, title, preset));
  return { canvas, chart };
}

/** Render the chart to an exact-size PNG Blob (raster, via Chart.js canvas). */
export async function exportPng(
  parsed: ParsedCsv,
  detection: Detection,
  title: string,
  preset: ExportPreset
): Promise<Blob> {
  const { canvas, chart } = renderToCanvas(parsed, detection, title, preset);
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) throw new Error("PNG encoding failed.");
    return blob;
  } finally {
    chart.destroy();
    // destroy() tears down Chart.js state but leaves the backing store — 34.8 MB at the A4
    // preset — alive until GC gets round to it. Mobile Safari budgets total canvas memory
    // and kills the tab when it's exceeded, so release it now rather than stacking one per
    // export. Zeroing the dimensions is the documented way to free it immediately.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * canvas2svg@1.0.16 predates a few 2D-context methods Chart.js v4 calls.
 * Shim the missing ones so the vector renderer doesn't throw.
 */
function patchSvgCtx(ctx: Record<string, unknown>): void {
  if (typeof ctx.resetTransform !== "function") {
    ctx.resetTransform = function (this: { setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void }) {
      this.setTransform(1, 0, 0, 1, 0, 0);
    };
  }
  if (typeof ctx.getLineDash !== "function") {
    ctx.getLineDash = function (this: { __dash?: number[] }) {
      return this.__dash ?? [];
    };
  }
  if (typeof ctx.setLineDash !== "function") {
    ctx.setLineDash = function (this: { __dash?: number[] }, dash: number[]) {
      this.__dash = dash ?? [];
    };
  }
  if (typeof ctx.roundRect !== "function") {
    // Our bars use square corners; a plain rect is a faithful fallback.
    ctx.roundRect = function (this: { rect(x: number, y: number, w: number, h: number): void }, x: number, y: number, w: number, h: number) {
      this.rect(x, y, w, h);
    };
  }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * canvas2svg names each clipPath with a fresh random string, so the same CSV exported twice
 * produced different bytes. Rename them in document order. Only ids introduced on a
 * <clipPath> are touched, so a user's own label can never be rewritten by accident.
 */
function stableClipIds(svg: string): string {
  const ids = [...new Set([...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]))];
  return ids.reduce((out, id, i) => {
    const esc = escapeRe(id);
    return out
      .replace(new RegExp(`<clipPath id="${esc}"`, "g"), `<clipPath id="cs${i}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#cs${i})`);
  }, svg);
}

/** Build the raw SVG markup for the chart at preset size (true vector, no raster). */
export function renderSvgString(
  parsed: ParsedCsv,
  detection: Detection,
  title: string,
  preset: ExportPreset
): string {
  const ctx = new C2S(preset.width, preset.height);
  patchSvgCtx(ctx as unknown as Record<string, unknown>);
  // Chart.js reads item.getContext('2d') and ctx.canvas; wire up a fake canvas.
  const fakeCanvas = {
    width: preset.width,
    height: preset.height,
    style: {},
    getContext: () => ctx,
  };
  (ctx as { canvas?: unknown }).canvas = fakeCanvas;

  const config = exportConfig(parsed, detection, title, preset);
  // canvas2svg can't honour destination-over compositing, so drop the raster
  // background plugin and paint the background straight into the SVG below.
  config.plugins = [];
  // Force the no-DOM platform: our fake canvas has no event/resize surface.
  (config as { platform?: unknown }).platform = BasicPlatform;

  // Chart.js draws lines via a cached Path2D + ctx.stroke(path2d), which
  // canvas2svg can't read. Setting a (truthy) `segment` option forces its
  // direct moveTo/lineTo path instead, which canvas2svg records faithfully.
  for (const ds of config.data.datasets) {
    (ds as { segment?: unknown }).segment = {};
  }

  const chart = new Chart(fakeCanvas as never, config);
  try {
    const raw = (ctx as unknown as { getSerializedSvg(fix?: boolean): string }).getSerializedSvg(
      true
    );
    // Inject an opaque background as the first child (document order = behind),
    // matching the raster export's warm background.
    const withBg = raw.replace(
      /(<svg[^>]*>)/,
      `$1<rect x="0" y="0" width="${preset.width}" height="${preset.height}" fill="${EXPORT_BG}"/>`
    );
    return stableClipIds(withBg);
  } finally {
    chart.destroy();
  }
}

/** Render the chart to a true vector SVG Blob (editable in Figma/Illustrator). */
export function exportSvg(
  parsed: ParsedCsv,
  detection: Detection,
  title: string,
  preset: ExportPreset
): Blob {
  const svg = renderSvgString(parsed, detection, title, preset);
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/** `declined` is the user closing the share sheet — it is a decision, not a failure. */
export type ShareResult = "shared" | "declined" | "unavailable";

/**
 * Hand the file to the OS share sheet when there is one, so the PNG can reach Photos (and
 * from there Instagram) in one tap. `downloadBlob` alone dead-ends on a phone: iOS Safari
 * does honour `<a download>` on a blob:, but the file lands in Files, and Instagram's
 * composer reads only the Photo Library — so the chart the tool exists to make cannot be
 * posted from the device people post from.
 *
 * Three states, not a boolean. A boolean merged "no sheet here" with "the user said no", and
 * the caller fell back to a download for both — so dismissing the sheet dropped an unwanted
 * file on the device anyway. The comment right here used to say that was the thing to avoid
 * while the code did it.
 */
export async function shareFile(blob: Blob, filename: string): Promise<ShareResult> {
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };
  if (typeof File !== "function" || !nav.canShare || !nav.share) return "unavailable";
  const file = new File([blob], filename, { type: blob.type });
  // Desktop Chrome/Firefox report no file sharing, which is the right answer — a download is
  // better there anyway.
  if (!nav.canShare({ files: [file] })) return "unavailable";
  try {
    await nav.share({ files: [file] });
    return "shared";
  } catch (err) {
    // AbortError is the user dismissing the sheet. Anything else (NotAllowedError, a
    // WebView with a broken implementation) means sharing didn't work, so a download is the
    // honest fallback.
    return (err as { name?: string } | null)?.name === "AbortError" ? "declined" : "unavailable";
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep the object URL alive well past the click: a large A4 PNG (up to
  // ~3508×2480) can still be streaming to the download manager, and revoking
  // too early aborts it. The blob is freed on the timeout or page unload.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
