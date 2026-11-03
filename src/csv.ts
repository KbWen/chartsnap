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
  // Counted in a loop rather than via text.match(/\ufffd/g), which would allocate one
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

/** Digits, separators and scientific notation. */
const VALID_NUM_RE = /^[+-]?\d[\d.,]*(?:e[+-]?\d+)?$/i;

/** Single comma decimal before scientific-notation exponent (e.g. "1,5e6"). */
const EU_SCI_RE = /^[+-]?\d+,\d+e[+-]?\d+$/i;

/** A 1–3 digit lead, one separator, exactly three digits: "3.850", "2,500". */
const GROUPED = /^[+-]?[1-9]\d{0,2}[.,]\d{3}$/;

/** Standard missing/empty cell placeholders that should not disqualify numbers. */
const NA_PLACEHOLDERS = new Set(["n/a", "na", "-", "—", "null", "none", "nan"]);
export function isMissingValue(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "" || NA_PLACEHOLDERS.has(t);
}

const ACCOUNTING_NEG = /^\((.+)\)$/;
const CURRENCY_PREFIX =
  /^(?:NT\$|NTD|NT|US\$|USD|HK\$|HKD|NZ\$|NZD|S\$|SGD|A\$|AUD|C\$|CAD|CHF|KRW|INR|\$|€|EUR|£|GBP|¥|JPY|RMB|₩|₹)\s*/i;
const UNIT_SUFFIX =
  /\s*(?:%|億元|億|萬元|萬|千元|千|元|NT\$|NTD|NT|US\$|USD|HK\$|HKD|NZ\$|NZD|S\$|SGD|A\$|AUD|C\$|CAD|CHF|KRW|INR|€|EUR|£|GBP|¥|JPY|RMB|₩|₹|\$)$/i;

const CJK_MAGNITUDE_RE = /(億元|億|萬元|萬|千元|千|元)$/;
const CJK_MAGNITUDES: Record<string, number> = {
  億元: 1e8,
  億: 1e8,
  萬元: 1e4,
  萬: 1e4,
  千元: 1e3,
  千: 1e3,
  元: 1,
};

function parseCjkMagnitudeUnit(unit: string): { prefix: string; factor: number } | null {
  const m = CJK_MAGNITUDE_RE.exec(unit);
  if (!m) return null;
  const mag = m[1];
  const prefix = unit.slice(0, unit.length - mag.length).trim().toUpperCase();
  return { prefix, factor: CJK_MAGNITUDES[mag] };
}

export interface CleanedNumber {
  cleaned: string;
  unit?: string;
}

/**
 * Extract units (currencies, %, 元) and normalize accounting negatives (500) -> -500.
 * Guarded against stock ticker symbols ($AAPL, $TSLA): if the remainder is not numeric,
 * the original string is preserved and no unit is assigned.
 */
export function cleanNumberString(s: string): CleanedNumber {
  let t = s.trim();
  if (!t || isMissingValue(t)) return { cleaned: "" };

  let isNegative = false;
  let hasOuterSign = false;

  // 1. Check outer parentheses: (500) or ($500)
  const parenOuter = ACCOUNTING_NEG.exec(t);
  if (parenOuter) {
    t = parenOuter[1].trim();
    isNegative = true;
    hasOuterSign = true;
  }

  // 2. Check leading sign before currency: -$500 or +$500
  if (!hasOuterSign && (t.startsWith("-") || t.startsWith("+"))) {
    if (t.startsWith("-")) isNegative = true;
    hasOuterSign = true;
    t = t.slice(1).trim();
  }

  let prefixUnit: string | undefined;

  // 3. Extract currency prefix: $500 or $(500) or NTD 1,200
  const prefixMatch = CURRENCY_PREFIX.exec(t);
  if (prefixMatch) {
    prefixUnit = prefixMatch[0].trim();
    t = t.slice(prefixMatch[0].length).trim();
  }

  // 4. Check inner parentheses if currency was outside: $(500) or $ (1,234.56)
  const parenInner = !hasOuterSign ? ACCOUNTING_NEG.exec(t) : null;
  if (parenInner) {
    t = parenInner[1].trim();
    isNegative = true;
    hasOuterSign = true;
  }

  // 5. Check trailing unit: % or 元 or NTD
  let suffixUnit: string | undefined;
  const suffixMatch = UNIT_SUFFIX.exec(t);
  if (suffixMatch) {
    suffixUnit = suffixMatch[0].trim();
    t = t.slice(0, t.length - suffixMatch[0].length).trim();
  }

  // 6. Check accounting parentheses if suffix was outside: (80) €
  if (!hasOuterSign) {
    const parenAfterSuffix = ACCOUNTING_NEG.exec(t);
    if (parenAfterSuffix) {
      t = parenAfterSuffix[1].trim();
      isNegative = true;
      hasOuterSign = true;
    }
  }

  // Reject double signs (e.g. "--500", "+-500", "-+500", "(-500)")
  if (hasOuterSign && (t.startsWith("-") || t.startsWith("+"))) {
    return { cleaned: s };
  }

  // TENTH-MAN GUARD:
  // Remainder MUST match VALID_NUM_RE!
  // If someone passed "$AAPL", "$(AAPL)" or "$TSLA", remainder is "AAPL" -> fails VALID_NUM_RE -> not a number.
  if (!VALID_NUM_RE.test(t)) {
    return { cleaned: s };
  }

  if (t.startsWith("+")) {
    t = t.slice(1);
  }
  if (isNegative && !t.startsWith("-")) {
    t = `-${t}`;
  }

  let unit: string | undefined;
  if (prefixUnit && suffixUnit) {
    // Preserve CJK magnitude suffix when paired with a currency prefix (e.g. "NT$ 50萬元").
    unit = CJK_MAGNITUDE_RE.test(suffixUnit) ? `${prefixUnit}${suffixUnit}` : prefixUnit;
  } else {
    unit = prefixUnit ?? suffixUnit;
  }

  return { cleaned: t, unit };
}

interface NumberStyle {
  format: NumberFormat;
  /** "ambiguous": the sample's magnitude rests on an inference. "mixed": the column self-contradicts. */
  warn?: { kind: "ambiguous" | "mixed"; sample: string };
  unit?: string;
  mixedUnits?: string[];
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

  const unitCounts = new Map<string, number>();

  for (const cell of raw) {
    const { cleaned, unit } = cleanNumberString(cell);
    if (!cleaned || !VALID_NUM_RE.test(cleaned)) continue;
    if (unit) unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1);
    if (EU_SCI_RE.test(cleaned)) {
      commaDecimal ??= cleaned;
      continue;
    }
    if (!NUMERIC_SHAPE.test(cleaned)) continue;

    const t = cleaned;
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

  let dominantUnit: string | undefined;
  let maxUnitCount = 0;
  for (const [u, count] of unitCounts) {
    if (count > maxUnitCount) {
      maxUnitCount = count;
      dominantUnit = u;
    }
  }

  const distinctUnits = [...unitCounts.keys()];
  const mixedUnits = distinctUnits.length > 1 ? distinctUnits : undefined;

  const eu = dotGrouping ?? commaDecimal;
  const us = dotDecimal ?? commaGrouping;
  if (eu && us) return { format: "us", warn: { kind: "mixed", sample: eu }, unit: dominantUnit, mixedUnits };

  const format: NumberFormat = eu ? "eu" : "us";

  // "3.850" is worth a note unless something proved the dot groups: otherwise its
  // magnitude hangs on an inference, and being wrong scales it by 1000.
  if (dotTriple && !dotGrouping) return { format, warn: { kind: "ambiguous", sample: dotTriple }, unit: dominantUnit, mixedUnits };
  // "2,500" only earns a note once a comma is proven to be a decimal point somewhere —
  // on its own it is ordinary US thousands, and a comma with three decimals is rare.
  if (commaTriple && commaDecimal) return { format, warn: { kind: "ambiguous", sample: commaTriple }, unit: dominantUnit, mixedUnits };

  return { format, unit: dominantUnit, mixedUnits };
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
  const { cleaned } = cleanNumberString(s);
  if (cleaned === "" || !VALID_NUM_RE.test(cleaned)) return NaN;
  const plain =
    format === "eu" ? cleaned.replace(EU_GROUPING, "").replace(",", ".") : cleaned.replace(US_GROUPING, "");
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

/** "2025.01.05" — 3-segment year-first dot date (2-segment "2025.01" is excluded so decimal prices stay numeric). */
const DOT_DATE = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/;

/** Explicit quarter labels: "2025-Q1", "2025 Q1", "2025/Q1", "Q1 2025". */
const QUARTER_YEAR_FIRST = /^(\d{4})\s*[-/. ]?\s*Q([1-4])$/i;
const QUARTER_Q_FIRST = /^Q([1-4])\s*[-/. ]?\s*(\d{4})$/i;

function parseQuarter(t: string): { year: number; quarter: number } | null {
  const m1 = QUARTER_YEAR_FIRST.exec(t);
  if (m1) {
    const year = Number(m1[1]);
    if (year >= 1900 && year <= 2099) return { year, quarter: Number(m1[2]) };
  }
  const m2 = QUARTER_Q_FIRST.exec(t);
  if (m2) {
    const year = Number(m2[2]);
    if (year >= 1900 && year <= 2099) return { year, quarter: Number(m2[1]) };
  }
  return null;
}

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
const DAY_NAME = "mon|tue|wed|thu|fri|sat|sun";
/** `Z`, `+08:00`, `+0800`, `+08`, or a spelled-out zone. ISO 8601 permits the bare `±hh`. */
const OFFSET = "(?:Z|[+-]\\d{2}(?::?\\d{2})?|\\s*(?:UTC|GMT(?:[+-]\\d{2}:?\\d{2})?))";
/** `9:30`, `09:30:00`, `09:30:00.123456` — unpadded hours and any fraction. */
const TIME = "\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?";

const PARSEABLE: RegExp[] = [
  // ISO / SQL date-time, `T` or space, padded or not, optional offset or named zone. Covers
  // psql timestamptz, BigQuery, pandas, sqlite, Sheets.
  new RegExp(`^\\d{4}-\\d{1,2}-\\d{1,2}[T ]${TIME}\\s*(?:${OFFSET})?$`, "i"),
  // Year-first slash dates, with or without a time: unambiguous, unlike 01/02/2025 (SPEC "Later").
  new RegExp(`^\\d{4}/\\d{1,2}/\\d{1,2}(?:[T ]${TIME}\\s*(?:${OFFSET})?)?$`, "i"),
  new RegExp(`^(?:${MONTH_NAME})\\.? \\d{4}$`, "i"), // March 2025
  new RegExp(`^\\d{1,2} (?:${MONTH_NAME})\\.? \\d{4}$`, "i"), // 5 January 2025
  new RegExp(`^(?:${MONTH_NAME})\\.? \\d{1,2},? \\d{4}$`, "i"), // Jan 5, 2025 — and without the comma
  // RFC 2822, and JS's own Date.toString(). Both turn up in exports written by hand.
  new RegExp(
    `^(?:${DAY_NAME}),? (?:\\d{1,2} (?:${MONTH_NAME})|(?:${MONTH_NAME}) \\d{1,2}) \\d{4}(?: ${TIME})?(?:\\s*${OFFSET})?$`,
    "i"
  ),
];

/**
 * A bare 4-digit number only means a year when the header says it does. Otherwise a
 * `count` column of 2000, 2010, 2020 turns into a time axis, and 1898 charts differently
 * from 2018 purely because it falls outside the plausible-year window.
 */
const YEAR_EN =
  /^(?!.*(?:^|[^a-z])(?:over|vs|versus|per|to)(?:[^a-z]|$))(?!(?:last|this|next|prior|prev|previous|past)(?:[^a-z]|$))(?:.*[_\s-])?(?:year|yr|years)(?:\s*\([^)]*\)|\s*[_-]?\d+)?$/i;
const YEAR_ZH =
  /^(?!.*(?:去年|今年|明年|前年|歷年|全年|半年))[\u4e00-\u9fffA-Za-z0-9_\s-]*?年(?:份|度(?:別)?)?(?:\s*[\(（][^\)）]*[\)）]|\s*[_-]?\d+)?$/;
export function isYearHeader(name: string): boolean {
  const t = name.trim();
  return YEAR_EN.test(t) || YEAR_ZH.test(t);
}

function cleanTime(s: string, bareYearOk: boolean): number {
  const t = s.trim();
  if (t === "" || isMissingValue(t)) return NaN;

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

  const dot = DOT_DATE.exec(t);
  if (dot) {
    const year = Number(dot[1]);
    if (year < 1900 || year > 2099) return NaN;
    const month = Number(dot[2]) - 1;
    const day = Number(dot[3]);
    const d = new Date(year, month, day);
    const valid = d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    return valid ? +d : NaN;
  }

  const q = parseQuarter(t);
  if (q) {
    return +new Date(q.year, (q.quarter - 1) * 3, 1);
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
  quarterAxis: boolean;
  unit?: string;
  normalizedUnit?: string;
} {
  const style = detectNumberStyle(raw);
  const bareYearOk = isYearHeader(name);
  const cellClean = raw.map((v) => cleanNumberString(v));
  let nums = raw.map((v) => toNumber(v, style.format));
  const times = raw.map((v) => cleanTime(v, bareYearOk));
  const nonEmpty = raw.filter((v) => !isMissingValue(v)).length;
  // Only a column made *entirely* of bare years earns a year-ticked axis.
  const bareYears =
    bareYearOk && nonEmpty > 0 && raw.every((v) => isMissingValue(v) || /^\d{4}$/.test(v.trim()));
  const quarterAxis =
    nonEmpty > 0 && raw.every((v) => isMissingValue(v) || parseQuarter(v.trim()) !== null);

  let unit = style.unit;
  let normalizedUnit: string | undefined;
  if (style.mixedUnits && style.mixedUnits.length > 1 && style.unit) {
    const parsedMags = style.mixedUnits.map((u) => ({ u, info: parseCjkMagnitudeUnit(u) }));
    const targetInfo = parseCjkMagnitudeUnit(style.unit);
    const samePrefix =
      targetInfo !== null &&
      parsedMags.every((p) => p.info !== null && p.info.prefix === targetInfo.prefix);
    const hasAmbiguousUnitlessNonZero = nums.some(
      (n, idx) => !Number.isNaN(n) && n !== 0 && !cellClean[idx].unit
    );
    if (samePrefix && targetInfo && !hasAmbiguousUnitlessNonZero) {
      nums = nums.map((n, idx) => {
        if (Number.isNaN(n) || n === 0) return n;
        const cellUnit = cellClean[idx].unit;
        const cellInfo = cellUnit ? parseCjkMagnitudeUnit(cellUnit) : null;
        if (!cellInfo) return n;
        const scaled = (n * cellInfo.factor) / targetInfo.factor;
        return Number(scaled.toPrecision(12));
      });
      normalizedUnit = style.unit;
    } else {
      // Incommensurable mixed units (e.g. "$100" and "€80"): keep face value and clear unit
      // so the exported axis never falsely attributes every bar/point to one currency.
      unit = undefined;
    }
  }

  const base = { nums, times, style, bareYears, quarterAxis, unit, normalizedUnit };
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

const LOOKS_DATE_LIKE = new RegExp(
  `(?:\\d+\\s*[/.\\-]\\s*\\d+\\s*[/.\\-]\\s*\\d+)|(?:\\b(?:${MONTH_NAME})\\b.*\\d)|(?:\\d.*\\b(?:${MONTH_NAME})\\b)`,
  "i"
);

/**
 * A column of things that look like dates but that chartsnap won't guess at.
 *
 * Refusing to guess is right — `01/02/2025` is 1 Feb to most of the world and 2 Jan to the US,
 * and the old code picked one silently. But *falling to text without a word* is the same sin
 * wearing different clothes: the column becomes a category, `detect` draws a bar chart of date
 * strings, and `droppedSeries` can't say so because it only ever holds numeric columns. So the
 * one thing this must not be is quiet.
 */
function unreadDateNote(column: string, raw: string[]): string | null {
  const cells = raw.map((c) => c.trim()).filter((c) => !isMissingValue(c));
  if (cells.length === 0) return null;
  // Cells a lenient parser would have taken and we deliberately would not.
  // Pre-check LOOKS_DATE_LIKE so V8's Date.parse("Store 1") = 2001-01-01 never false-flags
  // ordinary category labels ("Store 1", "Item 2", "Week 4").
  const refused = cells.filter(
    (c) => LOOKS_DATE_LIKE.test(c) && !Number.isNaN(Date.parse(c)) && Number.isNaN(cleanTime(c, false))
  );
  if (refused.length / cells.length < TYPE_THRESHOLD) return null;
  return `“${column}” looks like dates in a format that could be read more than one way (e.g. “${refused[0]}”), so it's charted as plain text rather than guessed at. Re-save it as YYYY-MM-DD for a time axis.`;
}

/** Exact summary/footer row labels at the bottom of spreadsheet exports. */
const SUMMARY_LABEL_RE =
  /^(?:total|totals|grand\s+total|sub[-\s]?total|sum|average|avg|mean|合計|總計|小計|總額|總數|平均)$/i;

/** A line that carried no fields at all — a truly blank line, not a row of blank cells. */
const isBlankLine = (row: string[]): boolean => row.length <= 1 && !(row[0] ?? "").trim();
const isAllEmpty = (row: string[]): boolean => row.every((c) => !(c ?? "").trim());

export function parseCsv(text: string): ParsedCsv {
  const notes: string[] = [];

  // Strip trailing newlines so PapaParse's delimiter detection isn't tricked by a
  // trailing empty row into seeing an average field count < 1.99 (which fails TSV guessing
  // for 2-column Excel clipboard copies). Blank lines are filtered downstream.
  const input = text.replace(/[\r\n]+$/, "");

  const result = Papa.parse<string[]>(input, {
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
    .map((r) => r.map((cell) => scrub(cell ?? "").normalize("NFKC")));

  if (rows.length < 2) {
    throw new CsvError("Need a header row plus at least one data row.");
  }

  let extractedTitle: string | undefined;
  // If row 0 has only 1 non-empty cell (at column 0) while row 1 has 2 or more non-empty
  // header cells, and total rows >= 3, treat row 0 as a report/document title.
  // Guard against partially-blank header rows:
  // - ",votes\nApples,30\nPears,45" (pandas/R unnamed index column: col 0 is empty)
  // - "item,\nApples,30\nPears,45" (unnamed value column: row 1 already contains numeric data)
  const row0Cells = rows[0].filter((c) => c.trim() !== "");
  const row0FirstCell = (rows[0][0] ?? "").trim();
  const row1NonEmpty = rows[1].filter((c) => c.trim() !== "");

  const isNumericCell = (c: string) =>
    !Number.isNaN(toNumber(c, "us")) || !Number.isNaN(toNumber(c, "eu"));

  let row1LooksLikeHeader = false;
  if (rows[0].length === 1) {
    row1LooksLikeHeader = true;
  } else if (rows[1].every((c) => !isMissingValue(c))) {
    const allNonNumeric = row1NonEmpty.every((c) => !isNumericCell(c));
    const isPivotYearHeader =
      rows[1].length >= 3 &&
      !isNumericCell(rows[1][0]) &&
      rows[1].slice(1).every((c) => /^(?:19|20)\d{2}$/.test(c.trim()));
    row1LooksLikeHeader = allNonNumeric || isPivotYearHeader;
  }
  if (
    rows.length >= 3 &&
    row0Cells.length === 1 &&
    row0FirstCell !== "" &&
    row1NonEmpty.length >= 2 &&
    row1LooksLikeHeader
  ) {
    extractedTitle = row0FirstCell;
    rows.shift();
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

  // Peel trailing summary/footer rows (e.g. "Total", "Average", "合計") when at least 2 data
  // rows remain above them, so a summary footer neither dwarfs the y-axis nor breaks date
  // classification (e.g. 3 dates + "Total" = 75% < 80% threshold).
  const excludedSummaries: string[] = [];
  while (body.length >= 3 && width >= 2) {
    const last = body[body.length - 1];
    const label = (last[0] ?? "").trim();
    const rest = last.slice(1);
    const hasNumeric = rest.some((c) => isNumericCell(c));
    const allRestNumericOrMissing = rest.every((c) => isMissingValue(c) || isNumericCell(c));
    if (SUMMARY_LABEL_RE.test(label) && hasNumeric && allRestNumericOrMissing) {
      excludedSummaries.unshift(label);
      body.pop();
    } else {
      break;
    }
  }
  if (excludedSummaries.length === 1) {
    notes.push(`Excluded summary row “${excludedSummaries[0]}” so it doesn't distort the scale.`);
  } else if (excludedSummaries.length > 1) {
    notes.push(
      `Excluded summary rows (${excludedSummaries.map((s) => `“${s}”`).join(", ")}) so they don't distort the scale.`
    );
  }

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
    const { type, nums, times, style, bareYears, quarterAxis, unit, normalizedUnit } = classify(
      raw,
      name
    );
    // A self-contradicting column often falls short of the numeric threshold and drops to
    // "category" — say why, rather than letting it vanish from the chart unexplained.
    const worthSaying = type === "number" || (type === "category" && style.warn?.kind === "mixed");
    if (worthSaying) {
      const warning = numberWarning(name, style);
      if (warning) notes.push(warning);
    }
    if (type === "number" && style.mixedUnits && style.mixedUnits.length > 1) {
      if (normalizedUnit) {
        notes.push(
          `Column “${name}” mixes units (${style.mixedUnits.join(", ")}) — normalized to ${normalizedUnit}.`
        );
      } else {
        notes.push(
          `Column “${name}” mixes units (${style.mixedUnits.join(", ")}) — read at face value.`
        );
      }
    }
    // A date column that fell to text has no other way to announce itself.
    if (type === "category") {
      const unread = unreadDateNote(name, raw);
      if (unread) notes.push(unread);
    }
    return { name, type, raw, nums, times, bareYears, quarterAxis, unit };
  });

  return {
    columns,
    rowCount: body.length,
    originalRowCount: sampled ? originalRowCount : undefined,
    notes,
    extractedTitle,
  };
}
