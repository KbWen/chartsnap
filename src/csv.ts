import Papa from "papaparse";
import type { Column, ColumnType, ParsedCsv } from "./types";

/** Above this many data rows we evenly downsample so charts stay legible & fast. */
export const MAX_POINTS = 1000;

/** A cell counts as this type if at least this fraction of non-empty cells match. */
const TYPE_THRESHOLD = 0.8;

export class CsvError extends Error {}

/**
 * Decode raw file bytes as UTF-8. Returns the text plus a flag when the bytes
 * don't look like valid UTF-8 (U+FFFD replacement chars appeared), so the UI can
 * show a graceful "re-save as UTF-8" message instead of rendering mojibake.
 */
export function decodeUtf8(buffer: ArrayBuffer): { text: string; looksNonUtf8: boolean } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacements = (text.match(/�/g) ?? []).length;
  // A few replacement chars can be incidental; a high rate means wrong encoding.
  const looksNonUtf8 = replacements > 0 && replacements / Math.max(text.length, 1) > 0.002;
  return { text, looksNonUtf8 };
}

function cleanNumber(s: string): number {
  // TODO: US-format only. EU "1.234,56" falls through and reads as a category.
  const t = s.trim().replace(/,(?=\d{3}(\D|$))/g, ""); // strip thousands separators
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function cleanTime(s: string): number {
  const t = s.trim();
  if (t === "") return NaN;
  // Treat a bare 4-digit calendar year (1900–2099) as a date, so the very common
  // `year,value` CSV becomes a time-series line instead of a scatter/number column.
  if (/^(19|20)\d{2}$/.test(t)) return Date.parse(`${t}-01-01`);
  // Otherwise don't let bare numbers (counts, ids) masquerade as dates.
  if (/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? NaN : ms;
}

function classify(raw: string[]): { type: ColumnType; nums: number[]; times: number[] } {
  const nums = raw.map(cleanNumber);
  const times = raw.map(cleanTime);
  const nonEmpty = raw.filter((v) => v.trim() !== "").length;

  if (nonEmpty === 0) return { type: "empty", nums, times };

  const numHits = nums.filter((n) => !Number.isNaN(n)).length;
  const timeHits = times.filter((t) => !Number.isNaN(t)).length;

  // Prefer date over number so an ISO date column isn't read as a category.
  if (timeHits / nonEmpty >= TYPE_THRESHOLD) return { type: "date", nums, times };
  if (numHits / nonEmpty >= TYPE_THRESHOLD) return { type: "number", nums, times };
  return { type: "category", nums, times };
}

/** Evenly pick `target` indices spanning [0, n). Keeps first & last. */
function sampleIndices(n: number, target: number): number[] {
  if (n <= target) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  const step = (n - 1) / (target - 1);
  for (let i = 0; i < target; i++) out.push(Math.round(i * step));
  return Array.from(new Set(out));
}

export function parseCsv(text: string): ParsedCsv {
  const notes: string[] = [];

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    // Keep everything as strings; we do our own typed coercion.
    dynamicTyping: false,
  });

  if (result.errors.length) {
    // PapaParse recovers from most issues; only surface as a note, don't fail.
    // Skip the delimiter-guess warning: it fires for legit single-column files.
    const first = result.errors.find((e) => !/auto-detect delimiting/i.test(e.message));
    if (first) {
      notes.push(
        `CSV note: ${first.message}${first.row != null ? ` (row ${first.row + 1})` : ""}.`
      );
    }
  }

  const rows = result.data.filter((r) => r.length > 0);
  if (rows.length < 2) {
    throw new CsvError("Need a header row plus at least one data row.");
  }

  const header = rows[0].map((h, i) => (h?.trim() ? h.trim() : `Column ${i + 1}`));
  let body = rows.slice(1);

  // Normalise ragged rows to the header width.
  const width = header.length;
  body = body.map((r) => {
    const row = r.slice(0, width);
    while (row.length < width) row.push("");
    return row;
  });

  const originalRowCount = body.length;
  let sampled = false;
  if (body.length > MAX_POINTS) {
    const idx = sampleIndices(body.length, MAX_POINTS);
    body = idx.map((i) => body[i]);
    sampled = true;
    notes.push(`Large file: showing ${body.length} of ${originalRowCount} rows (evenly sampled).`);
  }

  const columns: Column[] = header.map((name, c) => {
    const raw = body.map((row) => row[c] ?? "");
    const { type, nums, times } = classify(raw);
    return { name, type, raw, nums, times };
  });

  return {
    columns,
    rowCount: body.length,
    originalRowCount: sampled ? originalRowCount : undefined,
    notes,
  };
}
