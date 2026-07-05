export type ColumnType = "date" | "number" | "category" | "empty";

export interface Column {
  name: string;
  type: ColumnType;
  /** Raw cell strings, one per row (empty string for missing). */
  raw: string[];
  /** Parsed numeric values (NaN where missing/non-numeric). Only meaningful for type "number". */
  nums: number[];
  /** Parsed timestamps in ms (NaN where unparseable). Only meaningful for type "date". */
  times: number[];
}

export interface ParsedCsv {
  columns: Column[];
  /** Number of rows actually kept (after any sampling). */
  rowCount: number;
  /** Original row count before sampling, if sampled; else undefined. */
  originalRowCount?: number;
  /** Human-facing warnings surfaced in the UI (non-fatal). */
  notes: string[];
}

export type ChartType = "line" | "bar" | "scatter";

export interface Detection {
  type: ChartType;
  /** Column used for the x axis / category labels. */
  xColumn: Column;
  /** Numeric columns plotted as series (y). For scatter, exactly [x, y]. */
  yColumns: Column[];
  /** True when the x axis is a real time scale (line only). */
  timeAxis: boolean;
  /** Short plain-language reason, shown to the user. */
  reason: string;
}

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}
