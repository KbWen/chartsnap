import type { ChartType, Column, Detection, ParsedCsv } from "./types";

export class DetectError extends Error {}

/** More than a handful of series turns a shareable chart into spaghetti. */
const MAX_SERIES = 6;

const names = (cols: Column[]): string[] => cols.map((c) => c.name);

interface Cols {
  dates: Column[];
  numbers: Column[];
  categories: Column[];
}

function classify(parsed: ParsedCsv): Cols {
  const cols = parsed.columns.filter((c) => c.type !== "empty");
  return {
    dates: cols.filter((c) => c.type === "date"),
    numbers: cols.filter((c) => c.type === "number"),
    categories: cols.filter((c) => c.type === "category"),
  };
}

function indexColumn(len: number): Column {
  return {
    name: "Row",
    type: "category",
    raw: Array.from({ length: len }, (_, i) => String(i + 1)),
    nums: [],
    times: [],
  };
}

/** Which chart types this data can render — used to enable/disable the override toggle. */
export function feasibleTypes(parsed: ParsedCsv): ChartType[] {
  const { numbers } = classify(parsed);
  if (numbers.length === 0) return [];
  const types: ChartType[] = ["line", "bar"];
  if (numbers.length >= 2) types.push("scatter");
  return types;
}

function autoType(c: Cols): ChartType {
  if (c.dates.length > 0) return "line";
  if (c.categories.length > 0) return "bar";
  if (c.numbers.length >= 2) return "scatter";
  return "bar"; // a single numeric column → bar by row
}

// Guess a chart type from the CSV's shape. Pass `force` to override the guess; it
// throws when that type can't be built (e.g. scatter needs two numeric columns).
export function detectChart(parsed: ParsedCsv, force?: ChartType): Detection {
  const c = classify(parsed);
  if (c.numbers.length === 0) {
    throw new DetectError(
      "No numeric column found to chart. chartsnap needs at least one column of numbers."
    );
  }
  if (force === "scatter" && c.numbers.length < 2) {
    throw new DetectError("A scatter plot needs two numeric columns.");
  }

  const type = force ?? autoType(c);
  const forced = force != null;

  if (type === "scatter") {
    const [xc, yc] = c.numbers;
    return {
      type: "scatter",
      xColumn: xc,
      yColumns: [xc, yc],
      timeAxis: false,
      // A scatter uses exactly two columns; any others are plotted nowhere.
      droppedSeries: names(c.numbers.slice(2)),
      yearAxis: false,
      reason: forced
        ? `Scatter: "${yc.name}" vs "${xc.name}".`
        : `Two numeric columns ("${xc.name}" vs "${yc.name}") → scatter plot.`,
    };
  }

  // line & bar: pick an x column (line prefers a real time axis; bar prefers a category)
  const x =
    type === "line"
      ? (c.dates[0] ?? c.categories[0] ?? indexColumn(parsed.rowCount))
      : (c.categories[0] ?? c.dates[0] ?? indexColumn(parsed.rowCount));
  const timeAxis = type === "line" && x.type === "date";
  const yColumns = c.numbers.slice(0, MAX_SERIES);
  const droppedSeries = names(c.numbers.slice(MAX_SERIES));
  const yearAxis = timeAxis && x.bareYears === true;

  let reason: string;
  if (forced) {
    reason = `${type === "line" ? "Line" : "Bar"} chart over "${x.name}".`;
  } else if (type === "line") {
    reason = `Detected a date column ("${x.name}") → line chart over time.`;
  } else if (c.categories.length > 0) {
    reason = `Detected a text category column ("${x.name}") → bar chart.`;
  } else {
    reason = `One numeric column ("${c.numbers[0].name}") → bar chart by row.`;
  }

  return { type, xColumn: x, yColumns, timeAxis, droppedSeries, yearAxis, reason };
}
