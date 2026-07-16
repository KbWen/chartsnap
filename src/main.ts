import "./style.css";
import { Chart } from "chart.js";
import { buildConfig } from "./chart";
import { CsvError, decodeUtf8, parseCsv, scrub } from "./csv";
import { DetectError, detectChart, feasibleTypes } from "./detect";
import { downloadBlob, exportPng, exportSvg, PRESETS, renderSvgString, shareFile } from "./export";
import type { ChartType, Detection, ExportPreset, ParsedCsv } from "./types";
// Bundled sample CSVs, inlined at build time (?raw) so "try a sample" needs no network.
import sampleLine from "../samples/monthly-sales.csv?raw";
import sampleBar from "../samples/fruit-votes.csv?raw";
import sampleScatter from "../samples/height-weight.csv?raw";

// ---- element handles ----------------------------------------------------
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const dropEl = $<HTMLElement>("drop");
const fileInput = $<HTMLInputElement>("file");
const pasteArea = $<HTMLTextAreaElement>("paste-area");
const pasteRender = $<HTMLButtonElement>("paste-render");
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLElement>("result");
const infoEl = $<HTMLParagraphElement>("info");
const notesEl = $<HTMLParagraphElement>("notes");
const previewCanvas = $<HTMLCanvasElement>("preview");
const presetSelect = $<HTMLSelectElement>("preset");
const dlPng = $<HTMLButtonElement>("dl-png");
const dlSvg = $<HTMLButtonElement>("dl-svg");
const typeButtons = [...document.querySelectorAll<HTMLButtonElement>(".type-btn")];

// ---- app state ----------------------------------------------------------
interface State {
  parsed: ParsedCsv;
  detection: Detection;
  title: string;
}
let state: State | null = null;
let previewChart: Chart | null = null;

// ---- preset select ------------------------------------------------------
for (const p of PRESETS) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.label;
  presetSelect.appendChild(opt);
}
const currentPreset = (): ExportPreset =>
  PRESETS.find((p) => p.id === presetSelect.value) ?? PRESETS[0];

// ---- status helpers -----------------------------------------------------
function showStatus(message: string, kind: "error" | "info"): void {
  statusEl.textContent = message; // textContent = XSS-safe for user-derived text
  statusEl.className = `status ${kind}`;
  statusEl.hidden = false;
}
function clearStatus(): void {
  statusEl.hidden = true;
  statusEl.textContent = "";
}

function autoTitle(d: Detection): string {
  const ys = d.yColumns.map((c) => c.name);
  if (d.type === "scatter") return `${d.yColumns[1].name} vs ${d.yColumns[0].name}`;
  if (d.type === "line") return `${ys.join(", ")} over ${d.xColumn.name}`;
  return `${ys.join(", ")} by ${d.xColumn.name}`;
}

/**
 * Downscale a preset to a snappy preview size, keeping its aspect ratio. Font ratios are kept
 * by `buildConfig`'s `basis`, which sizes type from the preset and then applies this same
 * downscale — this function alone can't promise it, and the comment that used to say it could
 * was false for two presets.
 */
function previewSize(p: ExportPreset): { w: number; h: number } {
  const MAX = 1400;
  const k = Math.min(1, MAX / Math.max(p.width, p.height));
  return { w: Math.round(p.width * k), h: Math.round(p.height * k) };
}

function renderPreview(): void {
  if (!state) return;
  const preset = currentPreset();
  const { w, h } = previewSize(preset);
  previewCanvas.width = w;
  previewCanvas.height = h;

  previewChart?.destroy();
  const config = buildConfig(state.parsed, state.detection, {
    title: state.title,
    width: w,
    height: h,
    basis: preset.width, // size type from the preset, so the preview matches the download
  });
  config.options = {
    ...config.options,
    responsive: false,
    maintainAspectRatio: false,
    devicePixelRatio: 1,
    // Render instantly (no entry animation) — snappier, and keeps the page idle.
    animation: false,
  };
  previewChart = new Chart(previewCanvas, config);
}

/** Reflect which types are available and which is active on the toggle. */
function syncToggle(parsed: ParsedCsv, activeType: ChartType): void {
  const feasible = feasibleTypes(parsed);
  for (const btn of typeButtons) {
    const type = btn.dataset.type as ChartType;
    btn.disabled = !feasible.includes(type);
    btn.classList.toggle("active", type === activeType);
    btn.setAttribute("aria-pressed", String(type === activeType));
  }
}

/** Parse warnings, plus any numeric column this chart type can't show. */
function showNotes(parsed: ParsedCsv, detection: Detection): void {
  const lines = [...parsed.notes];
  const dropped = detection.droppedSeries;
  if (dropped.length > 0) {
    const shown = detection.yColumns.length;
    lines.push(
      `Charting ${shown} of ${shown + dropped.length} numeric columns — left out: ${dropped.join(", ")}.`
    );
  }
  notesEl.textContent = lines.join("\n");
}

function render(parsed: ParsedCsv, sourceTitle?: string): void {
  // A new dataset always starts from a fresh auto-detection (the toggle re-syncs below).
  const detection = detectChart(parsed); // may throw DetectError
  const title = sourceTitle?.trim() || autoTitle(detection);
  state = { parsed, detection, title };

  infoEl.textContent = detection.reason;
  showNotes(parsed, detection);
  resultEl.hidden = false;
  clearStatus();
  renderPreview();
  syncToggle(parsed, detection.type);
}

/** Escape hatch: re-render the current data as an explicitly chosen chart type. */
function setChartType(type: ChartType): void {
  if (!state) return;
  try {
    const detection = detectChart(state.parsed, type);
    state = { ...state, detection, title: autoTitle(detection) };
    infoEl.textContent = detection.reason;
    // Switching to scatter drops every series past the second — re-state what's left out.
    showNotes(state.parsed, detection);
    clearStatus();
    renderPreview();
    syncToggle(state.parsed, type);
  } catch (err) {
    showStatus((err as Error).message, "error");
  }
}

for (const btn of typeButtons) {
  btn.addEventListener("click", () => {
    if (!btn.disabled) setChartType(btn.dataset.type as ChartType);
  });
}

// ---- input handling -----------------------------------------------------
/**
 * Shown when some bytes didn't decode as UTF-8. Deliberately describes the *characters*, not
 * the file: a mostly-ASCII CSV carrying two stray CP1252 bytes trips the same detector as a
 * wholly Big5 export, and telling the first user "this file isn't UTF-8" would be a falsehood
 * about their own data. This sentence is true for both, and points the second at the fix.
 */
const UNDECODABLE_NOTE =
  "Some characters didn't decode as UTF-8 — any label showing “�” is one of them. If the whole chart looks garbled, re-save the file as UTF-8 CSV (most spreadsheets: “Save As → CSV UTF-8”).";

function handleText(text: string, sourceTitle?: string, extraNotes: string[] = []): void {
  try {
    const parsed = parseCsv(text);
    // Ahead of the parser's own notes: if the labels are mojibake, that's the first thing to say.
    parsed.notes.unshift(...extraNotes);
    render(parsed, sourceTitle);
  } catch (err) {
    if (err instanceof CsvError || err instanceof DetectError) {
      showStatus(err.message, "error");
    } else {
      showStatus(`Couldn't read that CSV: ${(err as Error).message}`, "error");
    }
    resultEl.hidden = true;
  }
}

function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const buf = reader.result as ArrayBuffer;
    const { text, looksNonUtf8 } = decodeUtf8(buf);
    // Chart it either way, and say what happened. Refusing was the most destructive thing this
    // tool did, and it did it to files that ARE UTF-8: the detector cannot tell two stray
    // CP1252 bytes in a 5,000-row export from a Big5 header, so a smart-quote pair — and quotes
    // come in pairs — cost the user their chart and told them their file was something it
    // wasn't, with no override. As a note the asymmetry inverts: a false positive costs one
    // ignorable line, and a true positive still gets the message. Mojibake is self-announcing
    // anyway — “���,�禬” on an axis is not a chart anyone posts by mistake.
    const base = scrub(file.name.replace(/\.[^.]+$/, ""));
    handleText(text, base, looksNonUtf8 ? [UNDECODABLE_NOTE] : []);
  };
  reader.onerror = () => showStatus("Could not read that file.", "error");
  reader.readAsArrayBuffer(file);
}

// dropzone: click to browse
dropEl.addEventListener("click", () => fileInput.click());
dropEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) handleFile(f);
  fileInput.value = ""; // allow re-selecting the same file
});

// dropzone: drag & drop
["dragenter", "dragover"].forEach((ev) =>
  dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.add("dragging");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.remove("dragging");
  })
);
dropEl.addEventListener("drop", (e) => {
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) handleFile(f);
});

// paste: explicit textarea render
pasteRender.addEventListener("click", () => {
  const text = pasteArea.value;
  if (text.trim()) handleText(text);
});

// paste: anywhere on the page (unless typing into the textarea)
document.addEventListener("paste", (e) => {
  if (document.activeElement === pasteArea) return;
  const text = e.clipboardData?.getData("text");
  if (text && text.includes(",")) {
    e.preventDefault();
    handleText(text);
  }
});

// sample data: one click to see a real chart without hunting for a CSV
const SAMPLES: Record<string, { csv: string; title: string }> = {
  line: { csv: sampleLine, title: "Monthly sales" },
  bar: { csv: sampleBar, title: "Fruit votes" },
  scatter: { csv: sampleScatter, title: "Height vs weight" },
};
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-sample]")) {
  btn.addEventListener("click", () => {
    const sample = SAMPLES[btn.dataset.sample ?? ""];
    if (sample) {
      handleText(sample.csv, sample.title);
      resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

// ---- export -------------------------------------------------------------
presetSelect.addEventListener("change", renderPreview);

function withBusy(btn: HTMLButtonElement, label: string, fn: () => Promise<void> | void) {
  return async () => {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      await fn();
    } catch (err) {
      showStatus(`Export failed: ${(err as Error).message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  };
}

dlPng.addEventListener(
  "click",
  withBusy(dlPng, "Rendering…", async () => {
    if (!state) return;
    const preset = currentPreset();
    const blob = await exportPng(state.parsed, state.detection, state.title, preset);
    const name = `chartsnap-${preset.id}.png`;
    // On a phone the share sheet is the only route to the camera roll, and the camera roll is
    // the only route into Instagram. Only "unavailable" falls back to a download — dismissing
    // the sheet is an answer, and downloading anyway would be the file-in-Files dead end this
    // exists to remove, delivered against the user's stated wish.
    if ((await shareFile(blob, name)) === "unavailable") downloadBlob(blob, name);
  })
);

dlSvg.addEventListener(
  "click",
  withBusy(dlSvg, "Rendering…", () => {
    if (!state) return;
    const preset = currentPreset();
    const blob = exportSvg(state.parsed, state.detection, state.title, preset);
    downloadBlob(blob, `chartsnap-${preset.id}.svg`);
  })
);

// ---- offline ------------------------------------------------------------
// Precaches the built assets so the page works with the network down. It backs a claim the
// README makes, so it registers on every production load — but a failure here must never
// cost the user their chart, hence the silent catch.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}

// ---- dev-only test bridge (stripped from production build) ---------------
if (import.meta.env.DEV) {
  (window as Window & { __cs?: unknown }).__cs = {
    load: (text: string, title?: string) => handleText(text, title),
    decode: (buf: ArrayBuffer) => decodeUtf8(buf),
    state: () => state,
    svgFor: (id: string) => {
      if (!state) return null;
      const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
      return renderSvgString(state.parsed, state.detection, state.title, p);
    },
    pngLenFor: async (id: string) => {
      if (!state) return null;
      const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
      const blob = await exportPng(state.parsed, state.detection, state.title, p);
      return blob.size;
    },
  };
}
