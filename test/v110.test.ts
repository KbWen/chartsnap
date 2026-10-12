// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { buildConfig } from "../src/chart";

describe("v1.10: Currency, Percentage & Accounting Negatives", () => {
  it("parses currency values with leading symbols and extracts unit", () => {
    const csv = "Item,Price\nApples,$1.50\nBananas,$2.00\nCherries,$5.25";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    expect(detection.type).toBe("bar");
    expect(detection.yColumns[0].name).toBe("Price");
    expect(detection.yColumns[0].nums).toEqual([1.5, 2.0, 5.25]);
    expect(detection.yColumns[0].unit).toBe("$");
  });

  it("parses percentage values preserving face value and extracting % unit", () => {
    const csv = "Campaign,Conversion\nSearch,12.5%\nSocial,8.3%\nEmail,15.0%";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    expect(detection.type).toBe("bar");
    expect(detection.yColumns[0].nums).toEqual([12.5, 8.3, 15.0]);
    expect(detection.yColumns[0].unit).toBe("%");
  });

  it("supports diverse currency symbols and trailing units (NT$, €, £, ¥, 元, NTD, USD)", () => {
    const csv = 'Category,NTD,Euro,Yen,Yuan\nItem A,NT$ 500,€ 120,"¥1,000",250元\nItem B,NT$ 800,€ 200,"¥1,500",400元';
    const parsed = parseCsv(csv);
    expect(parsed.columns[1].nums).toEqual([500, 800]);
    expect(parsed.columns[1].unit).toBe("NT$");
    expect(parsed.columns[2].nums).toEqual([120, 200]);
    expect(parsed.columns[2].unit).toBe("€");
    expect(parsed.columns[3].nums).toEqual([1000, 1500]);
    expect(parsed.columns[3].unit).toBe("¥");
    expect(parsed.columns[4].nums).toEqual([250, 400]);
    expect(parsed.columns[4].unit).toBe("元");
  });

  it("parses accounting negative parentheses: (500) and (1,234.56)", () => {
    const csv = 'Year,Profit,Cashflow\n2023,(500),"(1,234.56)"\n2024,1200,3450.00\n2025,(150),(200.50)';
    const parsed = parseCsv(csv);
    expect(parsed.columns[1].nums).toEqual([-500, 1200, -150]);
    expect(parsed.columns[2].nums).toEqual([-1234.56, 3450, -200.5]);
  });

  it("Tenth-Man Guard: does not treat stock ticker symbols ($AAPL, $TSLA) as numbers", () => {
    const csv = "Ticker,Price\n$AAPL,$150.25\n$MSFT,$310.50\n$TSLA,$220.00";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    // Ticker must remain category!
    expect(parsed.columns[0].type).toBe("category");
    expect(parsed.columns[1].type).toBe("number");
    expect(detection.type).toBe("bar");
    expect(detection.xColumn.name).toBe("Ticker");
    expect(detection.yColumns[0].name).toBe("Price");
    expect(detection.yColumns[0].nums).toEqual([150.25, 310.5, 220]);
  });

  it("deduplicates units when column header already mentions it", () => {
    const csv = "Year,Revenue ($)\n2024,$100\n2025,$200";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);
    const config = buildConfig(parsed, detection, { width: 1200, height: 675 });

    // Y axis title should remain "Revenue ($)", not "Revenue ($) ($)"
    const yTitle = (config.options?.scales?.y as any)?.title?.text;
    expect(yTitle).toBe("Revenue ($)");
  });

  it("warns about conflicting units across multi-series columns", () => {
    const csv = "Date,Revenue,Margin\n2025-01,$1000,25%\n2025-02,$1200,28%";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);
    buildConfig(parsed, detection, { width: 1200, height: 675 });

    expect(parsed.notes.some((n) => /mixed units|different units/i.test(n))).toBe(true);
  });
});

describe("v1.10: Missing Value Indicators Tolerance", () => {
  it("recognizes N/A, -, null, None as missing values without dropping column to category", () => {
    const csv = "Month,Sales,Expenses\n2025-01,100,50\n2025-02,N/A,-\n2025-03,150,75";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    expect(parsed.columns[1].type).toBe("number");
    expect(parsed.columns[2].type).toBe("number");
    expect(parsed.columns[1].nums).toEqual([100, NaN, 150]);
    expect(parsed.columns[2].nums).toEqual([50, NaN, 75]);
    expect(detection.type).toBe("line");
  });

  it("a column of exclusively missing value indicators classifies as empty", () => {
    const csv = "Category,Blank\nItem A,N/A\nItem B,-\nItem C,null";
    const parsed = parseCsv(csv);
    expect(parsed.columns[1].type).toBe("empty");
  });
});

describe("v1.10: Single Title Row Above Header Detection", () => {
  it("detects single-cell report title in row 0 and adopts row 1 as real header", () => {
    const csv = "Annual Sales Report 2025\nYear,Revenue\n2023,100\n2024,150\n2025,200";
    const parsed = parseCsv(csv);

    expect(parsed.extractedTitle).toBe("Annual Sales Report 2025");
    expect(parsed.columns.map((c) => c.name)).toEqual(["Year", "Revenue"]);
    expect(parsed.columns[1].nums).toEqual([100, 150, 200]);
  });
});

describe("v1.10: Dropzone Button Semantics & DOM Fix", () => {
  it("hidden file input is outside button element in index.html", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
    document.documentElement.innerHTML = html;

    const drop = document.getElementById("drop") as HTMLButtonElement;
    const file = document.getElementById("file") as HTMLInputElement;

    expect(drop).not.toBeNull();
    expect(file).not.toBeNull();
    // file must NOT be inside drop button!
    expect(drop.contains(file)).toBe(false);
  });
});
