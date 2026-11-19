// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { populateSrTable } from "../src/a11y";
import { buildConfig } from "../src/chart";
import { MAX_POINTS, parseCsv } from "../src/csv";
import { detectChart, MAX_SERIES } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";

/** Naive uniform stride matching pre-v1.14 `sampleIndices(n, target)`. */
function naiveStrideIndices(n: number, target: number): number[] {
  if (n <= target) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  const step = (n - 1) / (target - 1);
  for (let i = 0; i < target; i++) out.push(Math.round(i * step));
  return Array.from(new Set(out));
}

function parseSvgDoc(svg: string): Document {
  const normalized = svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );
  const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
}

function buildLatencyCsv(rows = 5000, spikeIdx = 1234, dropIdx = 3457): string {
  const startMs = Date.UTC(2025, 0, 1, 0, 0, 0);
  const lines = ["timestamp,latency_ms"];
  for (let i = 0; i < rows; i++) {
    const iso = new Date(startMs + i * 3_600_000).toISOString().slice(0, 16) + "Z";
    let val = 40 + (i % 10);
    if (i === spikeIdx) val = 950;
    if (i === dropIdx) val = 0;
    lines.push(`${iso},${val}`);
  }
  return lines.join("\n");
}

function filterCsvByIndices(csv: string, indices: number[]): string {
  const lines = csv.split("\n");
  const header = lines[0];
  const body = lines.slice(1);
  return [header, ...indices.map((i) => body[i])].join("\n");
}

describe("v1.14 — Extrema-preserving downsampling & full-dataset classification", () => {
  describe("1. Negative control & latency outage preservation", () => {
    const csv = buildLatencyCsv(5000, 1234, 3457);

    it("negative control: naive uniform stride misses both 950 ms spike (row 1234) and 0 ms drop (row 3457) across data, SVG ticks, and #sr-table", () => {
      const strideIdx = naiveStrideIndices(5000, MAX_POINTS);
      expect(strideIdx).not.toContain(1234);
      expect(strideIdx).not.toContain(3457);

      const strideParsed = parseCsv(filterCsvByIndices(csv, strideIdx));
      const vals = strideParsed.columns[1].nums;
      expect(Math.max(...vals)).toBe(49);
      expect(Math.min(...vals)).toBe(40);

      const strideDet = detectChart(strideParsed);
      const strideSvg = renderSvgString(strideParsed, strideDet, "Latency", PRESETS[0]);
      const doc = parseSvgDoc(strideSvg);
      const numericTicks = [...doc.querySelectorAll("text")]
        .map((t) => Number((t.textContent ?? "").trim().replace(/,/g, "")))
        .filter((n) => Number.isFinite(n));
      expect(Math.max(...numericTicks)).toBeLessThan(100);

      const cfg = buildConfig(strideParsed, strideDet, { title: "Latency", width: 1200, height: 675 });
      const table = document.createElement("table");
      const summary = document.createElement("p");
      populateSrTable(table, summary, cfg, strideDet, strideParsed, "Latency");
      const cellTexts = [...table.querySelectorAll("tbody td")].map((td) => td.textContent?.trim());
      expect(cellTexts).not.toContain("950");
      expect(cellTexts).not.toContain("0");
    });

    it("parseCsv preserves both 950 ms outage spike and 0 ms drop with min-max note", () => {
      const parsed = parseCsv(csv);
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(parsed.originalRowCount).toBe(5000);

      const vals = parsed.columns[1].nums;
      expect(Math.max(...vals)).toBe(950);
      expect(Math.min(...vals)).toBe(0);
      expect(vals[0]).toBe(40);
      expect(vals[vals.length - 1]).toBe(40 + (4999 % 10));

      const noteText = parsed.notes.join(" ");
      expect(noteText).toMatch(/sampled/i);
      expect(noteText).toMatch(/min-max downsampled/i);
      expect(noteText).toContain("1000 of 5000");
    });
  });

  describe("2. Multi-series (6 series) & 7-column continuous-X preservation", () => {
    it("preserves exact min/max and endpoints across all 6 plotted series on >1,000 rows", () => {
      const N = 2500;
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      const spikeIndices = [111, 412, 833, 1277, 1711, 2199].map((idx) =>
        strideSet.has(idx) ? idx + 1 : idx
      );
      const troughIndices = [222, 556, 944, 1403, 1888, 2341].map((idx) =>
        strideSet.has(idx) ? idx + 1 : idx
      );
      for (const idx of [...spikeIndices, ...troughIndices]) {
        expect(strideSet.has(idx)).toBe(false);
      }

      const startMs = Date.UTC(2025, 0, 1);
      const lines = ["date,s1,s2,s3,s4,s5,s6"];
      const fullCols: number[][] = Array.from({ length: MAX_SERIES }, () => []);

      for (let i = 0; i < N; i++) {
        const iso = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
        const rowVals: number[] = [];
        for (let s = 0; s < MAX_SERIES; s++) {
          let v = 100 + s * 10 + ((i + s) % 7);
          if (i === spikeIndices[s]) v = 1000 + s * 100;
          if (i === troughIndices[s]) v = -50 - s * 10;
          fullCols[s].push(v);
          rowVals.push(v);
        }
        lines.push(`${iso},${rowVals.join(",")}`);
      }

      const parsed = parseCsv(lines.join("\n"));
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(parsed.originalRowCount).toBe(N);
      expect(parsed.columns[0].raw[0]).toBe("2025-01-01");
      expect(parsed.columns[0].raw[MAX_POINTS - 1]).toBe(
        new Date(startMs + (N - 1) * 86_400_000).toISOString().slice(0, 10)
      );

      for (let s = 0; s < MAX_SERIES; s++) {
        const kept = parsed.columns[s + 1].nums;
        expect(Math.min(...kept)).toBe(Math.min(...fullCols[s]));
        expect(Math.max(...kept)).toBe(Math.max(...fullCols[s]));
      }
    });

    it("preserves exact min/max across all 7 numeric columns in continuous-X mode (MAX_SERIES + 1)", () => {
      const N = 2400;
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      const spikeRows = [103, 389, 701, 1051, 1409, 1777, 2111].map((idx) =>
        strideSet.has(idx) ? idx + 1 : idx
      );
      const troughRows = [197, 503, 859, 1201, 1553, 1901, 2269].map((idx) =>
        strideSet.has(idx) ? idx + 1 : idx
      );

      const lines = ["x,y1,y2,y3,y4,y5,y6"];
      const fullCols: number[][] = Array.from({ length: MAX_SERIES + 1 }, () => []);

      for (let i = 0; i < N; i++) {
        const rowVals: number[] = [];
        for (let c = 0; c < MAX_SERIES + 1; c++) {
          let v = c === 0 ? 50 + (i % 100) * 0.5 : 200 + c * 15 + (i % 11);
          if (i === spikeRows[c]) v = c === 0 ? 999 : 2000 + c * 100;
          if (i === troughRows[c]) v = c === 0 ? -99 : -100 - c * 10;
          fullCols[c].push(v);
          rowVals.push(v);
        }
        lines.push(rowVals.join(","));
      }

      const parsed = parseCsv(lines.join("\n"));
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(parsed.originalRowCount).toBe(N);

      const det = detectChart(parsed, "line");
      expect(det.type).toBe("line");
      expect(det.xColumn.name).toBe("x");
      expect(det.yColumns.length).toBe(MAX_SERIES);

      for (let c = 0; c < MAX_SERIES + 1; c++) {
        const kept = parsed.columns[c].nums;
        expect(Math.min(...kept)).toBe(Math.min(...fullCols[c]));
        expect(Math.max(...kept)).toBe(Math.max(...fullCols[c]));
      }
      // Original first and last rows preserved
      expect(parsed.columns[0].nums[0]).toBe(fullCols[0][0]);
      expect(parsed.columns[0].nums[MAX_POINTS - 1]).toBe(fullCols[0][N - 1]);
    });
  });

  describe("3. Reverse-chronological & shuffled-date ordering", () => {
    it("preserves global min/max and chronological endpoints on a 3,000-row reverse-chronological series", () => {
      const N = 3000;
      const startMs = Date.UTC(2020, 0, 1);
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      const spikeIdx = strideSet.has(777) ? 778 : 777;
      const dropIdx = strideSet.has(2111) ? 2112 : 2111;

      const lines = ["date,value"];
      const allVals: number[] = [];
      let oldestDate = "";
      let newestDate = "";

      for (let i = 0; i < N; i++) {
        const dayOffset = N - 1 - i;
        const iso = new Date(startMs + dayOffset * 86_400_000).toISOString().slice(0, 10);
        if (dayOffset === 0) oldestDate = iso;
        if (dayOffset === N - 1) newestDate = iso;
        let v = 50 + (i % 15);
        if (i === spikeIdx) v = 888;
        if (i === dropIdx) v = -25;
        allVals.push(v);
        lines.push(`${iso},${v}`);
      }

      const parsed = parseCsv(lines.join("\n"));
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(Math.max(...parsed.columns[1].nums)).toBe(888);
      expect(Math.min(...parsed.columns[1].nums)).toBe(-25);
      expect(parsed.columns[0].raw).toContain(oldestDate);
      expect(parsed.columns[0].raw).toContain(newestDate);
    });

    it("preserves global min/max and chronological endpoints on a 3,000-row shuffled-date series", () => {
      const N = 3000;
      const startMs = Date.UTC(2020, 0, 1);
      // Coprime permutation: gcd(7919, 3000) === 1
      const perm = Array.from({ length: N }, (_, i) => (i * 7919 + 137) % N);
      const oldestDate = new Date(startMs).toISOString().slice(0, 10);
      const newestDate = new Date(startMs + (N - 1) * 86_400_000).toISOString().slice(0, 10);

      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      const spikePos = strideSet.has(1111) ? 1112 : 1111;
      const dropPos = strideSet.has(2222) ? 2223 : 2222;

      const lines = ["date,value"];
      for (let i = 0; i < N; i++) {
        const dayOffset = perm[i];
        const iso = new Date(startMs + dayOffset * 86_400_000).toISOString().slice(0, 10);
        let v = 30 + (i % 20);
        if (i === spikePos) v = 777;
        if (i === dropPos) v = -12;
        lines.push(`${iso},${v}`);
      }

      const parsed = parseCsv(lines.join("\n"));
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(Math.max(...parsed.columns[1].nums)).toBe(777);
      expect(Math.min(...parsed.columns[1].nums)).toBe(-12);
      // Both chronological endpoints and original first/last rows are kept
      expect(parsed.columns[0].raw).toContain(oldestDate);
      expect(parsed.columns[0].raw).toContain(newestDate);
      expect(parsed.columns[0].raw[0]).toBe(
        new Date(startMs + perm[0] * 86_400_000).toISOString().slice(0, 10)
      );
      expect(parsed.columns[0].raw[MAX_POINTS - 1]).toBe(
        new Date(startMs + perm[N - 1] * 86_400_000).toISOString().slice(0, 10)
      );
    });
  });

  describe("4. NaN gaps & constant-value deterministic fill", () => {
    it("strictly hits MAX_POINTS on a constant-value 2,000-row dataset and preserves an isolated peak", () => {
      const N = 2000;
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      const peakIdx = strideSet.has(999) ? 1000 : 999;

      const linesFlat = ["row_id,val"];
      const linesPeak = ["row_id,val"];
      for (let i = 0; i < N; i++) {
        linesFlat.push(`r${i},42`);
        linesPeak.push(`r${i},${i === peakIdx ? 999 : 42}`);
      }

      const parsedFlat = parseCsv(linesFlat.join("\n"));
      expect(parsedFlat.rowCount).toBe(MAX_POINTS);
      expect(parsedFlat.columns[1].nums.every((v) => v === 42)).toBe(true);

      const parsedPeak = parseCsv(linesPeak.join("\n"));
      expect(parsedPeak.rowCount).toBe(MAX_POINTS);
      expect(parsedPeak.columns[1].nums.every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.max(...parsedPeak.columns[1].nums)).toBe(999);
      expect(Math.min(...parsedPeak.columns[1].nums)).toBe(42);
    });

    it("strictly hits MAX_POINTS on a NaN-gapped 2,000-row dataset without NaN corruption and preserves extrema", () => {
      const N = 2000;
      const startMs = Date.UTC(2024, 0, 1);
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      const spikeIdx = strideSet.has(1455) ? 1456 : 1455;
      const dropIdx = strideSet.has(1733) ? 1734 : 1733;

      const lines = ["date,metric"];
      for (let i = 0; i < N; i++) {
        const isMissingRow = i >= 400 && i < 650; // 250 contiguous N/A rows (12.5% < 20% threshold)
        const iso = isMissingRow
          ? "N/A"
          : new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
        let valStr = isMissingRow ? "N/A" : String(20 + (i % 8));
        if (i === spikeIdx) valStr = "500";
        if (i === dropIdx) valStr = "-5";
        lines.push(`${iso},${valStr}`);
      }

      const parsed = parseCsv(lines.join("\n"));
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(parsed.columns[0].type).toBe("date");
      expect(parsed.columns[1].type).toBe("number");

      const finiteVals = parsed.columns[1].nums.filter((v) => !Number.isNaN(v));
      expect(finiteVals.length).toBeGreaterThan(0);
      expect(Math.max(...finiteVals)).toBe(500);
      expect(Math.min(...finiteVals)).toBe(-5);
    });

    it("unplottable NaN-date rows with huge numeric values never shadow a real valid-date peak in the tail bucket", () => {
      const N = 2000;
      const startMs = Date.UTC(2024, 0, 1);
      const lines = ["date,metric"];
      for (let i = 0; i < N; i++) {
        // Put 2 invalid-date rows with huge values (99999) and a real valid-date peak (950)
        // near the end of the chronological range (where valid/invalid would share a bucket if merged).
        if (i === 1995 || i === 1996) {
          lines.push(`bad-date,99999`);
        } else {
          const iso = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
          const v = i === 1994 ? 950 : 20 + (i % 5);
          lines.push(`${iso},${v}`);
        }
      }
      const parsed = parseCsv(lines.join("\n"));
      const det = detectChart(parsed);
      const cfg = buildConfig(parsed, det, { width: 1200, height: 675 });
      const plottedY = ((cfg.data?.datasets?.[0]?.data ?? []) as { x: number; y: number | null }[])
        .map((pt) => pt.y)
        .filter((y): y is number => y !== null);
      expect(Math.max(...plottedY)).toBe(950);
    });
  });

  describe("5. Full-dataset classification before downsampling", () => {
    it("detects European number format from a lone 12,5 at row 777 (and off-stride row 778) of 1,500 rows", () => {
      const N = 1500;
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      expect(strideSet.has(778)).toBe(false);

      for (const targetRow of [777, 778]) {
        const lines = ["label,amount"];
        for (let i = 0; i < N; i++) {
          lines.push(i === targetRow ? `item${i},"12,5"` : `item${i},3.850`);
        }
        const parsed = parseCsv(lines.join("\n"));
        expect(parsed.rowCount).toBe(MAX_POINTS);
        expect(parsed.originalRowCount).toBe(N);

        const nums = parsed.columns[1].nums;
        expect(nums).toContain(12.5);
        expect(nums.filter((v) => v !== 12.5).every((v) => v === 3850)).toBe(true);
      }
    });

    it("normalizes mixed CJK magnitude units from a lone 2億元 at row 777 (and off-stride row 778) among 50萬元 rows", () => {
      const N = 1500;
      const strideSet = new Set(naiveStrideIndices(N, MAX_POINTS));
      expect(strideSet.has(778)).toBe(false);

      for (const targetRow of [777, 778]) {
        const lines = ["dept,revenue"];
        for (let i = 0; i < N; i++) {
          lines.push(i === targetRow ? `d${i},2億元` : `d${i},50萬元`);
        }
        const parsed = parseCsv(lines.join("\n"));
        expect(parsed.rowCount).toBe(MAX_POINTS);
        expect(parsed.columns[1].unit).toBe("萬元");

        const nums = parsed.columns[1].nums;
        expect(nums).toContain(20000);
        expect(Math.max(...nums)).toBe(20000);
        expect(nums.filter((v) => v !== 20000).every((v) => v === 50)).toBe(true);
        expect(parsed.notes.some((n) => /mixes units.*normalized to 萬元/i.test(n))).toBe(true);
      }
    });
  });

  describe("6. End-to-end artifact verification (SVG + #sr-table), determinism, and boundary", () => {
    const csv = buildLatencyCsv(5000, 1234, 3457);

    it("renders SVG ticks >= 900 across twitter and instagram presets and populates #sr-table with 950 and 0", () => {
      const parsed = parseCsv(csv);
      const detection = detectChart(parsed);

      const targetPresets = [
        PRESETS.find((p) => p.id === "twitter")!,
        PRESETS.find((p) => p.id === "instagram")!,
      ];

      for (const preset of targetPresets) {
        const svg = renderSvgString(parsed, detection, "Hourly Latency", preset);
        const doc = parseSvgDoc(svg);
        const numericTicks = [...doc.querySelectorAll("text")]
          .map((t) => Number((t.textContent ?? "").trim().replace(/,/g, "")))
          .filter((n) => Number.isFinite(n));
        expect(Math.max(...numericTicks)).toBeGreaterThanOrEqual(900);
      }

      const cfg = buildConfig(parsed, detection, {
        title: "Hourly Latency",
        width: targetPresets[0].width,
        height: targetPresets[0].height,
      });
      const table = document.createElement("table");
      const summary = document.createElement("p");
      populateSrTable(table, summary, cfg, detection, parsed, "Hourly Latency");

      const cellTexts = [...table.querySelectorAll("tbody td")].map((td) => td.textContent?.trim());
      expect(cellTexts).toContain("950");
      expect(cellTexts).toContain("0");
    });

    it("is byte-deterministic: parsing and exporting the 5,000-row CSV twice yields identical SVG strings", () => {
      const p1 = parseCsv(csv);
      const d1 = detectChart(p1);
      const svg1 = renderSvgString(p1, d1, "Hourly Latency", PRESETS[0]);

      const p2 = parseCsv(csv);
      const d2 = detectChart(p2);
      const svg2 = renderSvgString(p2, d2, "Hourly Latency", PRESETS[0]);

      expect(svg1).toBe(svg2);
    });

    it("boundary invariant: a 1,000-row CSV (<= MAX_POINTS) is not downsampled", () => {
      const csv1000 = buildLatencyCsv(MAX_POINTS, 234, 789);
      const parsed = parseCsv(csv1000);
      expect(parsed.rowCount).toBe(MAX_POINTS);
      expect(parsed.originalRowCount).toBeUndefined();
      expect(parsed.notes.some((n) => /large file|sampled/i.test(n))).toBe(false);
    });
  });
});
