import "./style.css";
import { Chart } from "chart.js";
import { buildConfig } from "./chart";
import { CsvError, decodeUtf8, parseCsv } from "./csv";
import { DetectError, detectChart, feasibleTypes } from "./detect";
import { downloadBlob, exportPng, exportSvg, PRESETS, renderSvgString } from "./export";
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
const repoLink = $<HTMLAnchorElement>("repo-link");
const typeButtons = [...document.querySelectorAll<HTMLButtonElement>(".type-btn")];

repoLink.href = "https://github.com/KbWen/chartsnap";

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

/** Downscale a preset to a snappy preview size while keeping aspect + font ratios. */
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

function render(parsed: ParsedCsv, sourceTitle?: string): void {
  // A new dataset always starts from a fresh auto-detection (the toggle re-syncs below).
  const detection = detectChart(parsed); // may throw DetectError
  const title = sourceTitle?.trim() || autoTitle(detection);
  state = { parsed, detection, title };

  infoEl.textContent = detection.reason;
  notesEl.textContent = parsed.notes.join("\n");
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
function handleText(text: string, sourceTitle?: string): void {
  try {
    const parsed = parseCsv(text);
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
    if (looksNonUtf8) {
      showStatus(
        "This file doesn't look like UTF-8 text. Re-save it as UTF-8 CSV (most spreadsheets: “Save As → CSV UTF-8”) and try again.",
        "error"
      );
      resultEl.hidden = true;
      return;
    }
    const base = file.name.replace(/\.[^.]+$/, "");
    handleText(text, base);
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
    downloadBlob(blob, `chartsnap-${preset.id}.png`);
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
