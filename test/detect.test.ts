import { describe, expect, it } from "vitest";
import { decodeUtf8, MAX_POINTS, parseCsv } from "../src/csv";
import { detectChart, DetectError, feasibleTypes } from "../src/detect";

const chartFor = (csv: string) => detectChart(parseCsv(csv));

describe("chart-type inference from CSV shape", () => {
  it("ISO date column → line over time", () => {
    const d = chartFor("month,rev\n2025-01-01,10\n2025-02-01,20\n2025-03-01,15");
    expect(d.type).toBe("line");
    expect(d.timeAxis).toBe(true);
  });

  it("4-digit year column → line over time (regression: used to detect scatter)", () => {
    const d = chartFor("year,revenue\n2019,120\n2020,135\n2021,118\n2022,152");
    expect(d.type).toBe("line");
    expect(d.timeAxis).toBe(true);
    expect(d.xColumn.name).toBe("year");
  });

  it("category + number → bar", () => {
    const d = chartFor("fruit,votes\nApples,30\nPears,45\nCherries,18");
    expect(d.type).toBe("bar");
    expect(d.xColumn.name).toBe("fruit");
  });

  it("two numeric columns → scatter", () => {
    const d = chartFor("h,w\n158,52\n167,61\n175,70");
    expect(d.type).toBe("scatter");
  });

  it("single numeric column → bar by row", () => {
    const d = chartFor("score\n10\n25\n17");
    expect(d.type).toBe("bar");
  });

  it("no numeric column → throws DetectError", () => {
    expect(() => chartFor("name,city\nAlice,NYC\nBob,LA")).toThrow(DetectError);
  });
});

describe("chart-type override (escape hatch)", () => {
  it("forces bar on a date CSV (auto would be line)", () => {
    const p = parseCsv("month,rev\n2025-01-01,10\n2025-02-01,20");
    expect(detectChart(p).type).toBe("line");
    expect(detectChart(p, "bar").type).toBe("bar");
  });

  it("forces line on a category CSV (auto would be bar)", () => {
    const p = parseCsv("fruit,votes\nApples,30\nPears,45");
    expect(detectChart(p).type).toBe("bar");
    expect(detectChart(p, "line").type).toBe("line");
  });

  it("throws when forcing scatter without two numeric columns", () => {
    const p = parseCsv("fruit,votes\nApples,30\nPears,45");
    expect(() => detectChart(p, "scatter")).toThrow(DetectError);
  });

  it("feasibleTypes reflects the number of numeric columns", () => {
    expect(feasibleTypes(parseCsv("fruit,votes\nApples,30\nPears,45"))).toEqual(["line", "bar"]);
    expect(feasibleTypes(parseCsv("h,w\n158,52\n167,61"))).toContain("scatter");
    expect(feasibleTypes(parseCsv("name,city\nAlice,NYC"))).toEqual([]);
  });
});

describe("CSV parsing edge cases", () => {
  it("handles quoted commas in header and cells", () => {
    const p = parseCsv('product,"rev, net",units\n"Widget, deluxe",1234,10\n"Gadget, mini",980,5');
    expect(p.columns.map((c) => c.name)).toEqual(["product", "rev, net", "units"]);
    expect(p.columns[1].type).toBe("number");
    expect(p.columns[1].nums).toEqual([1234, 980]);
  });

  it("parses thousands separators and marks missing values as NaN", () => {
    const p = parseCsv('x,v\nA,"2,500"\nB,\nC,980');
    expect(p.columns[1].nums[0]).toBe(2500);
    expect(Number.isNaN(p.columns[1].nums[1])).toBe(true);
    expect(p.columns[1].nums[2]).toBe(980);
  });

  it("downsamples large files to MAX_POINTS with a note", () => {
    let csv = "x,v\n";
    for (let i = 0; i < 1500; i++) csv += `row${i},${i}\n`;
    const p = parseCsv(csv);
    expect(p.rowCount).toBe(MAX_POINTS);
    expect(p.originalRowCount).toBe(1500);
    expect(p.notes.join(" ")).toMatch(/sampled/i);
  });

  it("rejects a header-only file", () => {
    expect(() => parseCsv("a,b,c")).toThrow();
  });
});

describe("UTF-8 detection", () => {
  it("flags clearly non-UTF-8 bytes", () => {
    const bad = new Uint8Array([0xff, 0xfe, 0x80, 0x81, 0xa6, 0x57, 0x2c, 0xbc]);
    expect(decodeUtf8(bad.buffer).looksNonUtf8).toBe(true);
  });

  it("accepts valid multibyte UTF-8", () => {
    const buf = new TextEncoder().encode("名稱,數值\n蘋果,30\n梨子,45");
    const { text, looksNonUtf8 } = decodeUtf8(buf.buffer);
    expect(looksNonUtf8).toBe(false);
    expect(text).toContain("蘋果");
  });
});
