import { _adapters, type TimeUnit } from "chart.js";

/**
 * A minimal Chart.js date adapter for the time axis.
 *
 * Replaces chartjs-adapter-date-fns + date-fns (~48 kB) which we only ever used to
 * label ticks. Month names are hardcoded English rather than locale-aware on purpose:
 * chartsnap promises the same CSV always renders the same chart, and an Intl-driven
 * axis would drift with the viewer's locale and ICU version.
 *
 * All arithmetic is local-time, matching what date-fns did.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Units that name a calendar period, i.e. the ones startOf/endOf can bracket. */
const PERIODS = new Set(["second", "minute", "hour", "day", "week", "month", "quarter", "year"]);

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");

const TOKEN = /yyyy|MMM|QQQ|SSS|mm|ss|h|d|a/g;

function formatDate(timestamp: number, fmt: string): string {
  const d = new Date(timestamp);
  return fmt.replace(TOKEN, (token) => {
    switch (token) {
      case "yyyy":
        return String(d.getFullYear());
      case "MMM":
        return MONTHS[d.getMonth()];
      case "QQQ":
        return `Q${Math.floor(d.getMonth() / 3) + 1}`;
      case "SSS":
        return pad(d.getMilliseconds(), 3);
      case "mm":
        return pad(d.getMinutes());
      case "ss":
        return pad(d.getSeconds());
      case "h":
        return String(d.getHours() % 12 || 12);
      case "d":
        return String(d.getDate());
      case "a":
        return d.getHours() < 12 ? "AM" : "PM";
      default:
        return token;
    }
  });
}

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

/** Month arithmetic that clamps instead of overflowing (Jan 31 + 1 month → Feb 28). */
function addMonths(d: Date, amount: number): number {
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return +d;
}

function addTo(timestamp: number, amount: number, unit: TimeUnit): number {
  const d = new Date(timestamp);
  switch (unit) {
    case "millisecond":
      return timestamp + amount;
    case "second":
      return timestamp + amount * 1_000;
    case "minute":
      return timestamp + amount * 60_000;
    case "hour":
      return timestamp + amount * 3_600_000;
    // Calendar days/weeks, not fixed 24h blocks, so a DST boundary doesn't shift the tick.
    case "day":
      d.setDate(d.getDate() + amount);
      return +d;
    case "week":
      d.setDate(d.getDate() + amount * 7);
      return +d;
    case "month":
      return addMonths(d, amount);
    case "quarter":
      return addMonths(d, amount * 3);
    case "year":
      return addMonths(d, amount * 12);
    default:
      return timestamp;
  }
}

function startOfUnit(timestamp: number, unit: TimeUnit | "isoWeek", weekday?: number | boolean): number {
  const d = new Date(timestamp);
  switch (unit) {
    case "second":
      d.setMilliseconds(0);
      break;
    case "minute":
      d.setSeconds(0, 0);
      break;
    case "hour":
      d.setMinutes(0, 0, 0);
      break;
    case "day":
      d.setHours(0, 0, 0, 0);
      break;
    case "week":
    case "isoWeek": {
      const startsOn = unit === "isoWeek" ? Number(weekday) || 0 : 0;
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() - startsOn + 7) % 7));
      break;
    }
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      break;
    case "quarter":
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
      d.setHours(0, 0, 0, 0);
      break;
    case "year":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      break;
    default:
      return timestamp;
  }
  return +d;
}

/** Whole calendar months from `min` to `max`, truncated toward zero. */
function monthDiff(max: number, min: number): number {
  const a = new Date(max);
  const b = new Date(min);
  const whole = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (whole > 0 && addMonths(new Date(min), whole) > max) return whole - 1;
  if (whole < 0 && addMonths(new Date(min), whole) < max) return whole + 1;
  return whole;
}

/** Truncate toward zero, normalising -0 to 0 so callers can't observe the sign. */
const trunc = (n: number): number => Math.trunc(n) || 0;

/**
 * Whole elapsed days, truncated toward zero. Counts calendar days rather than 24h
 * blocks: across a DST boundary a local day is 23 or 25 hours, so dividing the raw
 * millisecond gap by 86_400_000 loses (or gains) a day.
 */
function dayDiff(max: number, min: number): number {
  const sign = Math.sign(max - min);
  if (sign === 0) return 0;
  const midnights = startOfUnit(max, "day") - startOfUnit(min, "day");
  const whole = Math.abs(Math.round(midnights / 86_400_000));
  // Step `max` back that many calendar days; landing short of `min` means the last is partial.
  const partial = Math.sign(addTo(max, -sign * whole, "day") - min) === -sign ? 1 : 0;
  return sign * (whole - partial) || 0;
}

function diffIn(max: number, min: number, unit: TimeUnit): number {
  switch (unit) {
    case "millisecond":
      return max - min;
    case "second":
      return trunc((max - min) / 1_000);
    case "minute":
      return trunc((max - min) / 60_000);
    case "hour":
      return trunc((max - min) / 3_600_000);
    case "day":
      return dayDiff(max, min);
    case "week":
      return trunc(dayDiff(max, min) / 7);
    case "month":
      return monthDiff(max, min);
    case "quarter":
      return trunc(monthDiff(max, min) / 3);
    case "year":
      return trunc(monthDiff(max, min) / 12);
    default:
      return 0;
  }
}

_adapters._date.override({
  formats: () => ({
    datetime: "MMM d, yyyy, h:mm:ss a",
    millisecond: "h:mm:ss.SSS a",
    second: "h:mm:ss a",
    minute: "h:mm a",
    hour: "ha",
    day: "MMM d",
    week: "MMM d, yyyy",
    month: "MMM yyyy",
    quarter: "QQQ - yyyy",
    year: "yyyy",
  }),

  // The `format` arg of the DateAdapter contract is for a caller-supplied `time.parser`
  // pattern; chartsnap never sets one, and csv.ts hands the scale real timestamps.
  parse: (value: unknown): number | null => {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isNaN(ms) ? null : ms;
  },

  format: formatDate,
  add: addTo,
  diff: diffIn,
  startOf: startOfUnit,
  endOf: (timestamp: number, unit: TimeUnit): number =>
    PERIODS.has(unit) ? addTo(startOfUnit(timestamp, unit), 1, unit) - 1 : timestamp,
});
