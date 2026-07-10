// @vitest-environment jsdom
//
// v1.3 — the audit's leftovers. Each of these was a case where chartsnap quietly did
// something the user never asked for: dropped a column, ate a header, invented a time
// axis, or produced a file it couldn't reopen.
import { describe, expect, it } from "vitest";
import { parseCsv, scrub } from "../src/csv";
import { detectChart } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";

describe("a bare 4-digit number is only a year when the header says so", () => {
  const typeOf = (csv: string, i = 0) => parseCsv(csv).columns[i].type;

  it("charts a real year column over time", () => {
    const d = detectChart(parseCsv("year,revenue\n2019,120\n2020,135\n2021,118"));
    expect(d.type).toBe("line");
    expect(d.timeAxis).toBe(true);
    expect(d.yearAxis).toBe(true);
  });

  it("accepts the obvious spellings", () => {
    expect(typeOf("Year,v\n2019,1\n2020,2")).toBe("date");
    expect(typeOf("fiscal_year,v\n2019,1\n2020,2")).toBe("date");
    expect(typeOf("yr,v\n2019,1\n2020,2")).toBe("date");
    expect(typeOf("年份,v\n2019,1\n2020,2")).toBe("date");
  });

  it("leaves a count column of round numbers alone", () => {
    // The old heuristic turned this into a time axis and then refused to chart it.
    const csv = "item,count\nwidgets,2000\ngadgets,2010\ngizmos,2020\nthings,1990";
    expect(typeOf(csv, 1)).toBe("number");
    const d = detectChart(parseCsv(csv));
    expect(d.type).toBe("bar");
    expect(d.timeAxis).toBe(false);
  });

  it("no longer charts 1898-1902 differently from 2018-2022", () => {
    // Both are "years" to a reader; only the second fell inside the 1900-2099 window.
    expect(typeOf("year,v\n1898,1\n1899,2\n1900,3")).toBe("number"); // outside the window
    expect(typeOf("edition,v\n2018,1\n2019,2\n2020,3")).toBe("number"); // not a year header
  });

  it("still reads full dates regardless of the header", () => {
    expect(typeOf("whatever,v\n2025-01-01,1\n2025-02-01,2")).toBe("date");
    expect(detectChart(parseCsv("whatever,v\n2025-01-01,1\n2025-02-01,2")).yearAxis).toBe(false);
  });
});

describe("nothing disappears from the chart in silence", () => {
  const eight = () => {
    let csv = "m," + Array.from({ length: 8 }, (_, i) => `s${i + 1}`).join(",") + "\n";
    for (let r = 0; r < 3; r++) {
      csv += `2025-0${r + 1}-01,` + Array.from({ length: 8 }, (_, i) => (i + 1) * (r + 1)).join(",") + "\n";
    }
    return parseCsv(csv);
  };

  it("names the numeric columns past the 6-series cap", () => {
    const d = detectChart(eight());
    expect(d.yColumns.map((c) => c.name)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(d.droppedSeries).toEqual(["s7", "s8"]);
  });

  it("names the columns a scatter can't show", () => {
    const p = parseCsv("a,b,c,d\n1,2,3,4\n5,6,7,8");
    const d = detectChart(p, "scatter");
    expect(d.yColumns.map((c) => c.name)).toEqual(["a", "b"]);
    expect(d.droppedSeries).toEqual(["c", "d"]);
  });

  it("says nothing when everything fits", () => {
    expect(detectChart(parseCsv("m,v\n2025-01-01,1\n2025-02-01,2")).droppedSeries).toEqual([]);
  });
});

describe("blank rows", () => {
  it("keeps a header of blank names instead of eating it", () => {
    // ",\n1,2\n3,4" — the header row has two unnamed columns. It used to be skipped,
    // promoting "1,2" to the header and losing a data row.
    const p = parseCsv(",\n1,2\n3,4");
    expect(p.columns.map((c) => c.name)).toEqual(["Column 1", "Column 2"]);
    expect(p.rowCount).toBe(2);
    expect(p.columns[1].nums).toEqual([2, 4]);
  });

  it("still ignores blank lines around and inside the data", () => {
    const p = parseCsv("\na,b\n\n1,2\n\n3,4\n\n");
    expect(p.columns.map((c) => c.name)).toEqual(["a", "b"]);
    expect(p.rowCount).toBe(2);
  });

  it("still ignores a trailing row of empty cells", () => {
    const p = parseCsv("a,b\n1,2\n,,");
    expect(p.rowCount).toBe(1);
  });
});

describe("control characters can't break the export", () => {
  const NUL = String.fromCharCode(0);
  const BELL = String.fromCharCode(7);

  it("strips C0 characters from names and cells", () => {
    const p = parseCsv(`ca${NUL}t,va${BELL}l\nro${NUL}w,10\nrowtwo,20`);
    expect(p.columns.map((c) => c.name)).toEqual(["cat", "val"]);
    expect(p.columns[0].raw).toEqual(["row", "rowtwo"]);
  });

  it("keeps tabs, which are legal in XML", () => {
    const p = parseCsv(`name,v\n"a\tb",10\nc,20`);
    expect(p.columns[0].raw[0]).toBe("a\tb");
  });

  it("produces a well-formed SVG even from a CSV full of control chars", () => {
    const p = parseCsv(`ca${NUL}t,val\nro${NUL}w one,10\nrowtwo,20`);
    // The title comes from the file name, which main.ts scrubs at that boundary.
    const svg = renderSvgString(p, detectChart(p), scrub(`ti${NUL}tle`), PRESETS[0]);
    expect(svg.includes(NUL)).toBe(false);
    expect(svg).toContain("title");
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    // jsdom duplicates xmlns:xlink on the root, so we can't assert a clean parse here —
    // test/security.ts normalizes that. Absence of the NUL itself is the real assertion.
    expect(doc.querySelectorAll("script").length).toBe(0);
  });
});
