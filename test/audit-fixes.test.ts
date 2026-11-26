// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Chart } from "chart.js";
import Papa from "papaparse";
import { describe, expect, it, vi } from "vitest";
import { bindDropzoneEvents } from "../src/a11y";
import { buildConfig } from "../src/chart";
import { cleanNumberString, isYearHeader, parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";
import type { ChartTheme } from "../src/types";

function parseSvgDoc(svg: string): Document {
  const normalized = svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );
  const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
}

describe("Audit fixes — property-based regression suite", () => {
  describe("Fix 1: isYearHeader rejects relative/comparative year qualifiers anywhere in header", () => {
    it("rejects relative year qualifiers anywhere in the header token stream", () => {
      const rejected = [
        "sales_last_year",
        "revenue_this_year",
        "profit_prior_year",
        "bonus_next_year",
        "cost_prev_year",
        "metric_past_year",
        "revenue_previous_year",
        "last_year",
        "this year",
        "next-year",
        "prior year",
        "year_over_year",
        "sales_vs_last_year",
      ];
      for (const h of rejected) {
        expect(isYearHeader(h), `expected "${h}" to be rejected`).toBe(false);
      }
    });

    it("preserves valid year headers across casings, qualifiers, and parentheticals", () => {
      const accepted = [
        "year",
        "Year",
        "yr",
        "years",
        "fiscal_year",
        "calendar year",
        "birth_year",
        "model-year",
        "Year (AD)",
        "year_2025",
        "年份",
        "年度",
      ];
      for (const h of accepted) {
        expect(isYearHeader(h), `expected "${h}" to be accepted`).toBe(true);
      }
    });

    it("charts Region,sales_last_year,sales_this_year as a bar chart over Region with both columns numeric", () => {
      const csv = [
        "Region,sales_last_year,sales_this_year",
        "North,2000,2050",
        "South,2010,2080",
        "East,2020,2090",
      ].join("\n");
      const parsed = parseCsv(csv);
      expect(parsed.columns[0].type).toBe("category");
      expect(parsed.columns[1].type).toBe("number");
      expect(parsed.columns[2].type).toBe("number");
      expect(parsed.columns[1].nums).toEqual([2000, 2010, 2020]);
      expect(parsed.columns[2].nums).toEqual([2050, 2080, 2090]);

      const detection = detectChart(parsed);
      expect(detection.type).toBe("bar");
      expect(detection.timeAxis).toBe(false);
      expect(detection.xColumn.name).toBe("Region");
      expect(detection.yColumns.map((c) => c.name)).toEqual(["sales_last_year", "sales_this_year"]);
    });
  });

  describe("Fix 2: Reject impossible calendar dates before Date.parse rollover", () => {
    it("parses impossible slash/ISO-time dates as NaN rather than rolling over into March/May", () => {
      const impossible = [
        "2025/02/31",
        "2025/04/31",
        "2025-02-31 09:30:00",
        "2025-02-31T09:30:00Z",
        "2025-02-31t09:30:00z",
        "2025/06/31",
        "2025-02-29 09:30:00",
        "2025/02/29",
        "2025-13-01T00:00:00Z",
        "2025-00-10 08:00:00",
      ];
      const csv = ["when,v", ...impossible.map((d, i) => `${d},${i + 1}`)].join("\n");
      const parsed = parseCsv(csv);
      expect(parsed.columns[0].type).toBe("category");
      for (let i = 0; i < impossible.length; i++) {
        expect(parsed.columns[0].times[i], `expected NaN for "${impossible[i]}"`).toBeNaN();
      }
    });

    it("keeps valid leap-day dates (slash and ISO instant) as exact valid dates", () => {
      const slashLeap = parseCsv("when,v\n2024/02/29,10\n2024/03/01,20");
      expect(slashLeap.columns[0].type).toBe("date");
      expect(slashLeap.columns[0].times[0]).toBe(+new Date(2024, 1, 29));
      expect(detectChart(slashLeap)).toMatchObject({ type: "line", timeAxis: true });

      const isoLeap = parseCsv("when,v\n2024-02-29T09:30:00Z,10\n2024-03-01T09:30:00Z,20");
      expect(isoLeap.columns[0].type).toBe("date");
      expect(isoLeap.columns[0].times[0]).toBe(Date.UTC(2024, 1, 29, 9, 30, 0));
      expect(detectChart(isoLeap)).toMatchObject({ type: "line", timeAxis: true });
    });
  });

  describe("Fix 3: Case-insensitive currency unit canonicalization", () => {
    it("canonicalizes ASCII currency prefixes/suffixes so mixed case doesn't trigger mixed-unit errors", () => {
      const p1 = parseCsv("item,price\nA,USD 100\nB,usd 200");
      expect(p1.columns[1].unit).toBe("USD");
      expect(p1.columns[1].nums).toEqual([100, 200]);
      expect(p1.notes).toEqual([]);

      const p2 = parseCsv("d,v\nA,nt$ 50萬元\nB,NT$ 1億元");
      expect(p2.columns[1].unit).toBe("NT$萬元");
      expect(p2.columns[1].nums).toEqual([50, 10000]);
      expect(p2.notes.some((n) => n.includes("normalized to NT$萬元"))).toBe(true);
    });

    it("handles case pairs across supported currency codes while preserving symbols and CJK units", () => {
      const cases: [string, string, string][] = [
        ["eur 100", "EUR 200", "EUR"],
        ["100 eur", "200 EUR", "EUR"],
        ["ntd 50", "NTD 75", "NTD"],
        ["gbp 10", "GBP 20", "GBP"],
        ["jpy 1000", "JPY 2000", "JPY"],
        ["rmb 30", "RMB 40", "RMB"],
        ["hk$ 10", "HK$ 20", "HK$"],
        ["s$ 10", "S$ 20", "S$"],
        ["a$ 10", "A$ 20", "A$"],
        ["c$ 10", "C$ 20", "C$"],
        ["nz$ 10", "NZ$ 20", "NZ$"],
        ["chf 10", "CHF 20", "CHF"],
        ["krw 10", "KRW 20", "KRW"],
        ["inr 10", "INR 20", "INR"],
      ];
      for (const [a, b, expectedUnit] of cases) {
        const parsed = parseCsv(`k,v\nX,${a}\nY,${b}`);
        expect(parsed.columns[1].unit).toBe(expectedUnit);
        expect(parsed.notes).toEqual([]);
      }

      expect(cleanNumberString("50萬元")).toEqual({ cleaned: "50", unit: "萬元" });
      expect(cleanNumberString("25%")).toEqual({ cleaned: "25", unit: "%" });
      expect(cleanNumberString("$42")).toEqual({ cleaned: "42", unit: "$" });
      expect(cleanNumberString("€42")).toEqual({ cleaned: "42", unit: "€" });
    });
  });

  describe("Fix 4: Deduplicate timestamps in tickUnit for real Chart.js time axes", () => {
    function renderTimeAxis(csv: string, width: number, height: number) {
      const parsed = parseCsv(csv);
      const detection = detectChart(parsed);
      const config = buildConfig(parsed, detection, {
        title: "Dup Test",
        width,
        height,
        animate: false,
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      config.options = { ...config.options, responsive: false, animation: false, devicePixelRatio: 1 };
      const chart = new Chart(canvas, config);
      try {
        const unit = (chart.scales.x as unknown as { _unit?: string })._unit;
        const configUnit = (config.options?.scales?.x as { time?: { unit?: string } } | undefined)?.time?.unit;
        const ticks = chart.scales.x.getTicks().map((t) => t.value);
        const dataPoints = new Set(parsed.columns[0].times.filter((t) => !Number.isNaN(t)));
        const onData = ticks.filter((v) => dataPoints.has(v)).length;
        return { configUnit, unit, onData, total: ticks.length };
      } finally {
        chart.destroy();
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    it.each(PRESETS)("monthly CSV with duplicate timestamps gets time.unit='month' and 100% on-data ticks at $id", (preset) => {
      const rows = [
        "month,sales",
        "2025-01-15,100",
        "2025-01-15,110",
        "2025-02-15,120",
        "2025-02-15,130",
        "2025-03-15,140",
        "2025-03-15,150",
        "2025-04-15,160",
        "2025-04-15,170",
        "2025-05-15,180",
        "2025-05-15,190",
        "2025-06-15,200",
        "2025-06-15,210",
      ].join("\n");
      const res = renderTimeAxis(rows, preset.width, preset.height);
      expect(res.configUnit).toBe("month");
      expect(res.unit).toBe("month");
      expect(res.total).toBeGreaterThan(0);
      expect(res.onData).toBe(res.total);
    });

    it.each(PRESETS)("daily CSV with duplicate timestamps gets time.unit='day' and 100% on-data ticks at $id", (preset) => {
      const rows = ["day,val"];
      for (let d = 1; d <= 10; d++) {
        const iso = `2025-01-${String(d).padStart(2, "0")}`;
        rows.push(`${iso},${d * 10}`);
        rows.push(`${iso},${d * 10 + 5}`);
      }
      const res = renderTimeAxis(rows.join("\n"), preset.width, preset.height);
      expect(res.configUnit).toBe("day");
      expect(res.unit).toBe("day");
      expect(res.total).toBeGreaterThan(0);
      expect(res.onData).toBe(res.total);
    });
  });

  describe("Fix 5: Positive-dimension guard in buildConfig", () => {
    it("falls back safely on zero, negative, NaN, or Infinity width/height/basis across chart types", () => {
      const samples = [
        "date,sales\n2025-01-01,100\n2025-02-01,200",
        "cat,val\nA,10\nB,20",
        "x,y\n1,2\n3,4",
      ];
      const badOpts = [
        { width: 0, height: 0 },
        { width: -10, height: -5 },
        { width: 800, height: 600, basis: 0 },
        { width: Number.NaN, height: Number.POSITIVE_INFINITY, basis: -20 },
      ];

      for (const csv of samples) {
        const parsed = parseCsv(csv);
        const det = detectChart(parsed);
        for (const opts of badOpts) {
          const cfg = buildConfig(parsed, det, { title: "Dim Guard", ...opts });
          const options = cfg.options as Record<string, any>;
          const titleSize = options.plugins.title.font.size;
          const legendSize = options.plugins.legend.labels.font.size;
          const xTickSize = options.scales.x.ticks.font.size;
          const yTickSize = options.scales.y.ticks.font.size;

          for (const sz of [titleSize, legendSize, xTickSize, yTickSize]) {
            expect(typeof sz).toBe("number");
            expect(Number.isFinite(sz)).toBe(true);
            expect(sz).toBeGreaterThan(0);
          }

          const serialized = JSON.stringify(cfg.options);
          expect(serialized).not.toContain("NaN");
          expect(serialized).not.toContain("Infinity");
          expect(serialized).not.toContain("null");
        }
      }
    });
  });

  describe("Fix 6: Harden renderSvgString background <rect> injection", () => {
    it("produces valid XML without duplicating <svg> when theme.bg contains single quotes and $ replacement tokens", () => {
      const parsed = parseCsv("cat,val\nA,10\nB,20");
      const det = detectChart(parsed);

      const cases: { bg: string; expectedFill: string }[] = [
        { bg: "#fff'$&", expectedFill: "#fff$" },
        { bg: "#fff'$1$$", expectedFill: "#fff$1$$" },
      ];

      for (const { bg, expectedFill } of cases) {
        const adversarialTheme: ChartTheme = {
          id: "adv",
          name: "Adversarial",
          bg,
          ink: "#111111",
          muted: "#555555",
          grid: "#dddddd",
          palette: ["#155e4c", "#ca8233", "#2f4161", "#5885e7", "#7b0900", "#b76385"],
        };

        const svg = renderSvgString(parsed, det, "Safe SVG", PRESETS[0], adversarialTheme);
        const doc = parseSvgDoc(svg);
        const svgRoot = doc.documentElement;
        expect(svgRoot.tagName.toLowerCase()).toBe("svg");

        const firstRect = svgRoot.querySelector("rect");
        expect(firstRect).not.toBeNull();
        const fill = firstRect?.getAttribute("fill") ?? "";
        expect(fill).toBe(expectedFill);
        expect(fill).not.toContain("<svg");
        expect(fill).not.toContain("'");
        // Only one <svg> element in the entire document
        expect(doc.querySelectorAll("svg").length).toBe(1);
      }
    });
  });

  describe("Fix 7: FileReader cancellation on non-file loads & single-parse global paste", () => {
    it("cancels stale FileReader on sample click, global paste, and __cs.load; ignores contentEditable and invalid pastes", async () => {
      vi.resetModules();
      const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
      document.documentElement.innerHTML = html;
      await import("../src/main");

      const cs = (window as unknown as { __cs: Record<string, any> }).__cs;
      const OriginalFileReader = globalThis.FileReader;
      const readers: { onload: (() => void) | null; onerror: (() => void) | null; result: ArrayBuffer | null }[] = [];
      (globalThis as unknown as { FileReader: unknown }).FileReader = class SlowFileReader {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        result: ArrayBuffer | null = null;
        readAsArrayBuffer() {
          readers.push(this);
        }
      };

      try {
        // (a1) Start slow FileReader, then click sample chip -> stale FileReader must be ignored
        cs.loadFile(new File(["x,y\nStale,1"], "stale_chip.csv", { type: "text/csv" }));
        expect(readers.length).toBe(1);
        document.querySelector<HTMLButtonElement>('[data-sample="bar"]')?.click();
        expect(cs.state()?.title).toBe("Fruit votes");

        readers[0].result = new TextEncoder().encode("x,y\nStale,1").buffer;
        readers[0].onload?.();
        expect(cs.state()?.title).toBe("Fruit votes");

        // (a2) Start slow FileReader, then global paste valid CSV -> stale FileReader must be ignored
        cs.loadFile(new File(["x,y\nStale2,1"], "stale_paste.csv", { type: "text/csv" }));
        expect(readers.length).toBe(2);

        const parseSpy = vi.spyOn(Papa, "parse");
        const validPaste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
        Object.defineProperty(validPaste, "clipboardData", {
          value: { getData: () => "Team,Score\nRed,12\nBlue,18" },
        });
        document.dispatchEvent(validPaste);
        expect(validPaste.defaultPrevented).toBe(true);
        // Must parse once (not twice!)
        expect(parseSpy).toHaveBeenCalledTimes(1);
        parseSpy.mockRestore();
        expect(cs.state()?.title).toBe("Score by Team");

        readers[1].result = new TextEncoder().encode("x,y\nStale2,1").buffer;
        readers[1].onload?.();
        expect(cs.state()?.title).toBe("Score by Team");

        // (a3) Start slow FileReader, then call __cs.load -> stale FileReader must be ignored
        cs.loadFile(new File(["x,y\nStale3,1"], "stale_load.csv", { type: "text/csv" }));
        expect(readers.length).toBe(3);
        cs.load("Item,Count\nPen,5\nBook,8", "Stationery");
        expect(cs.state()?.title).toBe("Stationery");

        readers[2].result = new TextEncoder().encode("x,y\nStale3,1").buffer;
        readers[2].onload?.();
        expect(cs.state()?.title).toBe("Stationery");

        // (b1) Global paste when activeElement is contentEditable is ignored
        const editable = document.createElement("div");
        editable.contentEditable = "true";
        Object.defineProperty(editable, "isContentEditable", { configurable: true, value: true });
        editable.tabIndex = 0;
        document.body.appendChild(editable);
        editable.focus();
        expect(document.activeElement).toBe(editable);

        const cePaste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
        Object.defineProperty(cePaste, "clipboardData", {
          value: { getData: () => "A,B\n1,2\n3,4" },
        });
        document.dispatchEvent(cePaste);
        expect(cePaste.defaultPrevented).toBe(false);
        expect(cs.state()?.title).toBe("Stationery");
        editable.remove();

        // (b2) Unparseable/non-chartable global paste stays completely inert and does not cancel in-flight FileReader
        cs.loadFile(new File(["x,y\nAlive,42\nMore,99"], "still_alive.csv", { type: "text/csv" }));
        expect(readers.length).toBe(4);
        const badPaste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
        Object.defineProperty(badPaste, "clipboardData", {
          value: { getData: () => "col1,col2\nfoo,bar" }, // DetectError: no numeric column
        });
        document.dispatchEvent(badPaste);
        expect(badPaste.defaultPrevented).toBe(false);
        expect(cs.state()?.title).toBe("Stationery");

        readers[3].result = new TextEncoder().encode("x,y\nAlive,42\nMore,99").buffer;
        readers[3].onload?.();
        expect(cs.state()?.title).toBe("still_alive");
      } finally {
        globalThis.FileReader = OriginalFileReader;
      }
    });
  });

  describe("Fix 8: bindDropzoneEvents prevents dragleave flicker over child elements", () => {
    it("keeps .dragging when moving into a child element, removes it on external dragleave, and handles drop once", () => {
      const dropEl = document.createElement("button");
      const childSpan = document.createElement("span");
      const nestedStrong = document.createElement("strong");
      childSpan.appendChild(nestedStrong);
      dropEl.appendChild(childSpan);

      const outside = document.createElement("div");
      const win = new EventTarget();
      const onFile = vi.fn();

      bindDropzoneEvents(dropEl, win, onFile);

      // dragenter adds .dragging
      dropEl.dispatchEvent(new Event("dragenter", { bubbles: true, cancelable: true }));
      expect(dropEl.classList.contains("dragging")).toBe(true);

      // dragleave to child span keeps .dragging
      const leaveToChild = new Event("dragleave", { bubbles: true, cancelable: true });
      Object.defineProperty(leaveToChild, "relatedTarget", { value: childSpan });
      dropEl.dispatchEvent(leaveToChild);
      expect(leaveToChild.defaultPrevented).toBe(true);
      expect(dropEl.classList.contains("dragging")).toBe(true);

      // dragleave to nested strong keeps .dragging
      const leaveToNested = new Event("dragleave", { bubbles: true, cancelable: true });
      Object.defineProperty(leaveToNested, "relatedTarget", { value: nestedStrong });
      dropEl.dispatchEvent(leaveToNested);
      expect(dropEl.classList.contains("dragging")).toBe(true);

      // dragleave to outside element removes .dragging
      const leaveOutside = new Event("dragleave", { bubbles: true, cancelable: true });
      Object.defineProperty(leaveOutside, "relatedTarget", { value: outside });
      dropEl.dispatchEvent(leaveOutside);
      expect(dropEl.classList.contains("dragging")).toBe(false);

      // dragleave with null relatedTarget removes .dragging
      dropEl.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
      expect(dropEl.classList.contains("dragging")).toBe(true);
      const leaveNull = new Event("dragleave", { bubbles: true, cancelable: true });
      Object.defineProperty(leaveNull, "relatedTarget", { value: null });
      dropEl.dispatchEvent(leaveNull);
      expect(dropEl.classList.contains("dragging")).toBe(false);

      // drop clears .dragging, stops propagation, and calls onFile exactly once
      dropEl.dispatchEvent(new Event("dragenter", { bubbles: true, cancelable: true }));
      expect(dropEl.classList.contains("dragging")).toBe(true);
      const file = new File(["a,b\n1,2"], "test.csv", { type: "text/csv" });
      const dropEvt = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvt, "dataTransfer", { value: { files: [file] } });
      const stopSpy = vi.spyOn(dropEvt, "stopPropagation");
      dropEl.dispatchEvent(dropEvt);

      expect(dropEvt.defaultPrevented).toBe(true);
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(dropEl.classList.contains("dragging")).toBe(false);
      expect(onFile).toHaveBeenCalledTimes(1);
      expect(onFile).toHaveBeenCalledWith(file);
    });
  });
});
