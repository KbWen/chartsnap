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
  // Counted in a loop rather than via text.match(/�/g), which would allocate one
  // string per hit — a mis-encoded multi-MB file is almost all replacement chars.
  let repl = 0;
  let valid = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xfffd) repl++;
    else if (c > 0x7f) valid++; // else-if: U+FFFD is itself non-ASCII, and isn't evidence of success
  }
  // Weigh the bytes that failed to decode against the ones that succeeded — not against the
  // file's length. A Big5 export whose Chinese sits in the header has a fixed number of
  // replacements and an unbounded number of ASCII data rows, so a rate against length decays
  // to nothing (measured: caught at 200 rows, blind at 1,000). A rate against non-ASCII fails
  // the other way: Big5, Latin-1, UTF-16LE and a good UTF-8 file carrying one stray byte all
  // score 1.0, so no threshold separates them. Only the absolute count does.
  //
  // The floor of 2 is what keeps one stray byte (a CP1252 smart quote out of Word, the
  // commonest near-UTF-8 artifact there is) from getting a real file refused. It costs us
  // Latin-1 files with exactly one accent — provably undecidable, since they are identical
  // here to that stray byte — and we'd rather render those than refuse a good file.
  const looksNonUtf8 = repl >= 2 && repl > valid;
  return { text, looksNonUtf8 };
}

type NumberFormat = "us" | "eu";

/** Digits and separators only; anything else can't tell us which convention is in use. */
const NUMERIC_SHAPE = /^[+-]?\d[\d.,]*$/;

/** A 1–3 digit lead, one separator, exactly three digits: "3.850", "2,500". */
const GROUPED = /^[+-]?[1-9]\d{0,2}[.,]\d{3}$/;

interface NumberStyle {
  format: NumberFormat;
  /** "ambiguous": the sample's magnitude rests on an inference. "mixed": the column self-contradicts. */
  warn?: { kind: "ambiguous" | "mixed"; sample: string };
}

/**
 * Decide whether a column writes numbers the American way (1,234.56) or the European way
 * (1.234,56), reading the whole column rather than one cell. Judging cell-by-cell is how
 * "3.850" — three thousand eight hundred fifty — silently becomes 3.85.
 *
 * We work out what role each separator is *proven* to play somewhere in the column. A
 * separator cannot be both a decimal point and a thousands mark in the same column, so
 * one proven cell settles every other cell that uses it.
 */
function detectNumberStyle(raw: string[]): NumberStyle {
  let dotDecimal: string | undefined; // 1.25, 0.125, 1234.567, 1,234.56
  let dotGrouping: string | undefined; // 1.234.567, 1.234,56
  let commaDecimal: string | undefined; // 12,5, 1234,567, 1.234,56
  let commaGrouping: string | undefined; // 1,234,567, 1,234.56
  // Cells shaped like "3.850" / "2,500", where the separator could play either role.
  let dotTriple: string | undefined;
  let commaTriple: string | undefined;

  for (const cell of raw) {
    const t = cell.trim();
    if (!t || !NUMERIC_SHAPE.test(t)) continue;

    const dots = t.split(".").length - 1;
    const commas = t.split(",").length - 1;

    if (dots && commas) {
      // Both present: the last one is the decimal point, so the other one groups.
      if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
        commaDecimal ??= t;
        dotGrouping ??= t;
      } else {
        dotDecimal ??= t;
        commaGrouping ??= t;
      }
    } else if (dots > 1) {
      dotGrouping ??= t;
    } else if (commas > 1) {
      commaGrouping ??= t;
    } else if (dots === 1) {
      if (GROUPED.test(t)) dotTriple ??= t;
      else dotDecimal ??= t;
    } else if (commas === 1) {
      if (GROUPED.test(t)) commaTriple ??= t;
      else commaDecimal ??= t;
    }
  }

  const eu = dotGrouping ?? commaDecimal;
  const us = dotDecimal ?? commaGrouping;
  if (eu && us) return { format: "us", warn: { kind: "mixed", sample: eu } };

  const format: NumberFormat = eu ? "eu" : "us";

  // "3.850" is worth a note unless something proved the dot groups: otherwise its
  // magnitude hangs on an inference, and being wrong scales it by 1000.
  if (dotTriple && !dotGrouping) return { format, warn: { kind: "ambiguous", sample: dotTriple } };
  // "2,500" only earns a note once a comma is proven to be a decimal point somewhere —
  // on its own it is ordinary US thousands, and a comma with three decimals is rare.
  if (commaTriple && commaDecimal) return { format, warn: { kind: "ambiguous", sample: commaTriple } };

  return { format };
}

/**
 * Strip only a separator standing in a grouping position: three digits, then another
 * separator or the end of the number. Stripping every comma would turn the European
 * "1.234,56" into "1.23456" — a plausible-looking number that is silently wrong. Leaving
 * it un-strippable makes it NaN, i.e. an honest gap in the chart. Requiring `[.,]|$`
 * rather than any non-digit also keeps "1.234e5" (a decimal, then an exponent) intact.
 */
const US_GROUPING = /,(?=\d{3}([.,]|$))/g;
const EU_GROUPING = /\.(?=\d{3}([.,]|$))/g;

function toNumber(s: string, format: NumberFormat): number {
  const t = s.trim();
  if (t === "") return NaN;
  const plain =
    format === "eu" ? t.replace(EU_GROUPING, "").replace(",", ".") : t.replace(US_GROUPING, "");
  const n = Number(plain);
  return Number.isFinite(n) ? n : NaN;
}

function numberWarning(column: string, style: NumberStyle): string | null {
  const warn = style.warn;
  if (!warn) return null;
  if (warn.kind === "mixed") {
    return `Mixed number formats in “${column}” (e.g. “${warn.sample}”) — read as 1,234.56 style. Check the values.`;
  }
  const used = toNumber(warn.sample, style.format);
  const other = toNumber(warn.sample, style.format === "us" ? "eu" : "us");
  if (!Number.isFinite(used) || !Number.isFinite(other) || used === other) return null;
  return `“${column}” is ambiguous: “${warn.sample}” was read as ${used}, not ${other}. Re-save it as plain numbers if that's wrong.`;
}

/** "2019", "2025-01", "2025-01-05" — a calendar date carrying no time and no offset. */
const CALENDAR_DATE = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;

const MONTH_NAME =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/**
 * The only shapes allowed to reach `Date.parse`.
 *
 * `Date.parse` is spec-defined for ISO 8601 and engine-defined for everything else, and the
 * engine-defined half guesses silently: "Jan-25" (Excel's default) becomes 25 Jan 2001,
 * "45%" becomes 2045-01-01 and takes over the x axis, "114/01/05" (民國) becomes year 114 AD.
 * Dropping `Date.parse` would take ISO instants with it — and with them every timestamped
 * export on earth, which would fall to a category and be drawn as equal-width bars. So gate
 * its *input* instead. Anything not listed here is a category: honest, and deterministic.
 */
const PARSEABLE: RegExp[] = [
  // 2025-01-01T09:30:00Z / +08:00 / no offset (local, per ECMA-262 — what a spreadsheet
  // means), and the space-separated form Excel and SQL exports write.
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i,
  // Year-first slash dates: unambiguous, unlike 01/02/2025 (see SPEC "Later").
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  new RegExp(`^(?:${MONTH_NAME})\\.? \\d{4}$`, "i"), // March 2025
  new RegExp(`^\\d{1,2} (?:${MONTH_NAME})\\.? \\d{4}$`, "i"), // 5 January 2025
  new RegExp(`^(?:${MONTH_NAME})\\.? \\d{1,2}, ?\\d{4}$`, "i"), // Jan 5, 2025
];

/**
 * A bare 4-digit number only means a year when the header says it does. Otherwise a
 * `count` column of 2000, 2010, 2020 turns into a time axis, and 1898 charts differently
 * from 2018 purely because it falls outside the plausible-year window.
 */
const YEAR_HEADER = /(^|[^a-z])(year|yr|years)([^a-z]|$)|年/i;

function cleanTime(s: string, bareYearOk: boolean): number {
  const t = s.trim();
  if (t === "") return NaN;

  // An ISO date-only string means UTC midnight, but the axis draws in local time — so
  // west of UTC "2025-01-01" would land on the tick "Dec 31". Build bare calendar dates
  // as local midnight. Cells carrying a time or an offset keep their exact instant.
  const cal = CALENDAR_DATE.exec(t);
  if (cal) {
    const year = Number(cal[1]);
    const bare = cal[2] === undefined;
    if (bare && (!bareYearOk || year < 1900 || year > 2099)) return NaN;
    const month = Number(cal[2] ?? 1) - 1;
    const day = Number(cal[3] ?? 1);
    const d = new Date(year, month, day);
    // Date rolls 2025-02-31 forward into March; reject rather than invent a day.
    const valid = d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    return valid ? +d : NaN;
  }

  // Don't let bare numbers (counts, ids) masquerade as dates.
  if (/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  // Everything else must look like something we recognise before Date.parse may guess at it.
  if (!PARSEABLE.some((re) => re.test(t))) return NaN;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? NaN : ms;
}

function classify(
  raw: string[],
  name: string
): {
  type: ColumnType;
  nums: number[];
  times: number[];
  style: NumberStyle;
  bareYears: boolean;
} {
  const style = detectNumberStyle(raw);
  const bareYearOk = YEAR_HEADER.test(name);
  const nums = raw.map((v) => toNumber(v, style.format));
  const times = raw.map((v) => cleanTime(v, bareYearOk));
  const nonEmpty = raw.filter((v) => v.trim() !== "").length;
  // Only a column made *entirely* of bare years earns a year-ticked axis.
  const bareYears =
    bareYearOk && nonEmpty > 0 && raw.every((v) => v.trim() === "" || /^\d{4}$/.test(v.trim()));

  const base = { nums, times, style, bareYears };
  if (nonEmpty === 0) return { type: "empty", ...base };

  const numHits = nums.filter((n) => !Number.isNaN(n)).length;
  const timeHits = times.filter((t) => !Number.isNaN(t)).length;

  // Prefer date over number so an ISO date column isn't read as a category.
  if (timeHits / nonEmpty >= TYPE_THRESHOLD) return { type: "date", ...base };
  if (numHits / nonEmpty >= TYPE_THRESHOLD) return { type: "number", ...base };
  return { type: "category", ...base };
}

/** Evenly pick `target` indices spanning [0, n). Keeps first & last. */
function sampleIndices(n: number, target: number): number[] {
  if (n <= target) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  const step = (n - 1) / (target - 1);
  for (let i = 0; i < target; i++) out.push(Math.round(i * step));
  return Array.from(new Set(out));
}

/**
 * C0 control characters are illegal in XML, and every label ends up inside the exported
 * SVG's <text> nodes — one NUL in a cell makes the whole file refuse to open. Tab, newline
 * and carriage return are legal and stay.
 */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
export const scrub = (s: string): string => s.replace(XML_ILLEGAL, "");

/** A line that carried no fields at all — a truly blank line, not a row of blank cells. */
const isBlankLine = (row: string[]): boolean => row.length <= 1 && !(row[0] ?? "").trim();
const isAllEmpty = (row: string[]): boolean => row.every((c) => !(c ?? "").trim());

export function parseCsv(text: string): ParsedCsv {
  const notes: string[] = [];

  const result = Papa.parse<string[]>(text, {
    header: false,
    // NOT "greedy": that eats a header row of blank names (",,"), quietly promoting the
    // first data row to the header. We drop blank lines ourselves, just below.
    skipEmptyLines: false,
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

  // Blank *lines* (before, between, after the data) carry no fields and are noise. A row of
  // blank *cells* has structure: as the first row it is a header with unnamed columns, and
  // anywhere else it is an empty data row we can drop.
  const rows = result.data
    .filter((r) => r.length > 0 && !isBlankLine(r))
    .filter((r, i) => i === 0 || !isAllEmpty(r))
    .map((r) => r.map((cell) => scrub(cell ?? "")));

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
    const { type, nums, times, style, bareYears } = classify(raw, name);
    // A self-contradicting column often falls short of the numeric threshold and drops to
    // "category" — say why, rather than letting it vanish from the chart unexplained.
    const worthSaying = type === "number" || (type === "category" && style.warn?.kind === "mixed");
    if (worthSaying) {
      const warning = numberWarning(name, style);
      if (warning) notes.push(warning);
    }
    return { name, type, raw, nums, times, bareYears };
  });

  return {
    columns,
    rowCount: body.length,
    originalRowCount: sampled ? originalRowCount : undefined,
    notes,
  };
}
