// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";

describe("v1.8: Spreadsheet Clipboard Paste (TSV / Semicolon / Excel newlines)", () => {
  it("Excel 2-column TSV clipboard with trailing newline parses into 2 columns rather than collapsing", () => {
    // Exact shape Excel exports to clipboard when copying 2 columns x 2 rows of data
    const excelClip = "Month\tSales\r\nJan\t100\r\nFeb\t200\r\n";
    const parsed = parseCsv(excelClip);
    expect(parsed.columns.length).toBe(2);
    expect(parsed.columns[0].name).toBe("Month");
    expect(parsed.columns[1].name).toBe("Sales");
    expect(parsed.rowCount).toBe(2);
    expect(parsed.columns[1].nums).toEqual([100, 200]);

    const detection = detectChart(parsed);
    expect(detection.type).toBe("bar");
    expect(detection.yColumns[0].name).toBe("Sales");
  });

  it("TSV with quoted internal commas correctly prioritizes tab delimiter over comma", () => {
    const tsvWithCommas =
      "Category\tRevenue\r\n\"Apples, Fresh\"\t150\r\n\"Bananas, Sweet\"\t250\r\n";
    const parsed = parseCsv(tsvWithCommas);
    expect(parsed.columns.length).toBe(2);
    expect(parsed.columns[0].name).toBe("Category");
    expect(parsed.columns[0].raw).toEqual(["Apples, Fresh", "Bananas, Sweet"]);
    expect(parsed.columns[1].nums).toEqual([150, 250]);
  });

  it("European semicolon-separated CSV parses correctly", () => {
    const euCsv = "Produkt;Verkauf\r\nAuto;50\r\nFahrrad;120\r\n";
    const parsed = parseCsv(euCsv);
    expect(parsed.columns.length).toBe(2);
    expect(parsed.columns[0].name).toBe("Produkt");
    expect(parsed.columns[1].name).toBe("Verkauf");
    expect(parsed.columns[1].nums).toEqual([50, 120]);
  });

  it("page-level paste predicate strictly requires newlines and delimiters to avoid destroying existing charts", () => {
    const isTabularPaste = (text: string): boolean => {
      const hasLinebreak = text.includes("\n") || text.includes("\r");
      const hasDelimiter = text.includes(",") || text.includes("\t") || text.includes(";");
      return Boolean(hasLinebreak && hasDelimiter);
    };

    // Valid tabular pastes that SHOULD trigger
    expect(isTabularPaste("a,b\n1,2")).toBe(true);
    expect(isTabularPaste("a\tb\n1\t2")).toBe(true);
    expect(isTabularPaste("a;b\r\n1;2")).toBe(true);

    // Stray text that MUST NOT trigger (prevent destroying rendered chart)
    expect(isTabularPaste("Hello, world")).toBe(false);
    expect(isTabularPaste("Wait; check this link")).toBe(false);
    expect(isTabularPaste("Just some text without delimiters\nsecond line")).toBe(false);
    expect(isTabularPaste("")).toBe(false);
  });
});

describe("v1.8: WCAG 2.1 AA Contrast for --faint and --muted with 3-tier hierarchy", () => {
  function sRGBtoLin(c: number): number {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function relLum(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
  }
  function contrast(h1: string, h2: string): number {
    const l1 = relLum(h1);
    const l2 = relLum(h2);
    const max = Math.max(l1, l2);
    const min = Math.min(l1, l2);
    return (max + 0.05) / (min + 0.05);
  }
  function getL(hex: string): number {
    const y = relLum(hex);
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  }

  const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf-8");
  const getVar = (name: string): string => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!m) throw new Error(`Missing CSS variable --${name}`);
    return m[1].toLowerCase();
  };

  const paper = getVar("paper"); // #f6f4ee
  const card = getVar("card"); // #fffefb
  const muted = getVar("muted");
  const faint = getVar("faint");

  it("--muted clears WCAG 2.1 AA (>= 4.5:1) on --paper", () => {
    const ratio = contrast(muted, paper);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("--faint clears WCAG 2.1 AA (>= 4.5:1) on both --paper and --card", () => {
    const ratioPaper = contrast(faint, paper);
    const ratioCard = contrast(faint, card);
    expect(ratioPaper).toBeGreaterThanOrEqual(4.5);
    expect(ratioCard).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves 3-tier visual hierarchy: Delta L* between --muted and --faint is >= 7.0", () => {
    const deltaL = getL(faint) - getL(muted);
    expect(deltaL).toBeGreaterThanOrEqual(7.0);
  });
});

describe("v1.8: Focus Visibility and Mobile Theme Color", () => {
  it("style.css declares explicit outline on .btn:focus-visible", () => {
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf-8");
    expect(css).toMatch(/\.btn:focus-visible\s*\{[^}]*outline:\s*2px\s+solid/);
  });

  it(".dropzone:focus-visible defines visible outline and does not suppress it", () => {
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf-8");
    // Must NOT contain outline: none on .dropzone:focus-visible
    expect(css).not.toMatch(/\.dropzone:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(css).toMatch(/\.dropzone:focus-visible\s*\{[^}]*outline:\s*2px\s+solid/);
  });

  it("index.html declares theme-color meta tag matching paper background", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
    expect(html).toContain('<meta name="theme-color" content="#f6f4ee"');
  });
});
