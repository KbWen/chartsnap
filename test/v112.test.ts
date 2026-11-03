// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildSrSummary, collectNotes, mixedUnitsNote, populateSrTable, slugifyTitle } from "../src/a11y";
import { buildConfig, PALETTE } from "../src/chart";
import { cleanNumberString, parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { copyPngToClipboard, PRESETS, renderSvgString } from "../src/export";
import sampleBar from "../samples/fruit-votes.csv?raw";
import sampleEdge from "../samples/edge-cases.csv?raw";

function parseSvgDoc(svg: string): Document {
  const normalized = svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );
  const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
}

/** Compute world (x, y) of a canvas2svg <text> node by accumulating ancestor <g transform="..."> transforms. */
function svgTextPos(node: Element): { x: number; y: number } {
  let x = Number(node.getAttribute("x") ?? 0);
  let y = Number(node.getAttribute("y") ?? 0);
  let cur: Element | null = node;
  while (cur && cur.tagName.toLowerCase() !== "svg") {
    const tf = cur.getAttribute("transform") ?? "";
    for (const m of tf.matchAll(/translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/g)) {
      x += Number(m[1]);
      y += Number(m[2] ?? 0);
    }
    for (const m of tf.matchAll(/matrix\(\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*\)/g)) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = Number(m[3]);
      const d = Number(m[4]);
      const e = Number(m[5]);
      const f = Number(m[6]);
      const nx = a * x + c * y + e;
      const ny = b * x + d * y + f;
      x = nx;
      y = ny;
    }
    cur = cur.parentElement;
  }
  return { x, y };
}

describe("v1.12 — Silent-Wrong-Chart Remediation, Publication Craft & Workflow Polish", () => {
  describe("1. Horizontal bars for long or numerous categories (Core Rule 2 SVG geometry)", () => {
    const LONG_DEPT_CSV = [
      "Department,Headcount",
      "Customer Success & Enterprise Support,48",
      "Platform Infrastructure & Reliability,62",
      "Product Design & User Research,29",
      "Global Supply Chain & Logistics,54",
      "Corporate Finance & Accounting,33",
      "Security Engineering & Compliance,41",
      "People Operations & Talent Acquisition,25",
      "Strategic Partnerships & Business Dev,37",
    ].join("\n");

    const EXPECTED_DEPTS = [
      "Customer Success & Enterprise Support",
      "Platform Infrastructure & Reliability",
      "Product Design & User Research",
      "Global Supply Chain & Logistics",
      "Corporate Finance & Accounting",
      "Security Engineering & Compliance",
      "People Operations & Talent Acquisition",
      "Strategic Partnerships & Business Dev",
    ];

    for (const preset of PRESETS) {
      it(`renders all 8/8 long department labels inside bounds and in top-to-bottom order at '${preset.id}'`, () => {
        const parsed = parseCsv(LONG_DEPT_CSV);
        const detection = detectChart(parsed);
        const config = buildConfig(parsed, detection, { width: preset.width, height: preset.height });
        expect((config.options as { indexAxis?: string })?.indexAxis).toBe("y");

        const svg = renderSvgString(parsed, detection, "Department Headcount", preset);
        const doc = parseSvgDoc(svg);
        const textNodes = [...doc.querySelectorAll("text")];

        const labelCoords = EXPECTED_DEPTS.map((dept) => {
          const node = textNodes.find((el) => el.textContent?.trim() === dept);
          expect(node, `missing label "${dept}" at ${preset.id}`).toBeDefined();
          const { x, y } = svgTextPos(node!);
          return { dept, x, y };
        });

        expect(labelCoords).toHaveLength(8);
        for (let i = 0; i < labelCoords.length; i++) {
          expect(labelCoords[i].x).toBeGreaterThanOrEqual(0);
          if (i > 0) {
            // Top-to-bottom CSV order: row i appears strictly below row i - 1
            expect(labelCoords[i].y).toBeGreaterThan(labelCoords[i - 1].y);
          }
        }
      });
    }

    it("switches 12 medium-length categories to horizontal bars and renders all 12 labels", () => {
      const rows = Array.from({ length: 12 }, (_, i) => `Category ${i + 1},${(i + 1) * 10}`);
      const parsed = parseCsv(["Name,Score", ...rows].join("\n"));
      const detection = detectChart(parsed);
      const svg = renderSvgString(parsed, detection, "12 Categories", PRESETS[0]);
      const doc = parseSvgDoc(svg);
      const texts = [...doc.querySelectorAll("text")].map((t) => t.textContent?.trim());
      for (let i = 1; i <= 12; i++) {
        expect(texts).toContain(`Category ${i}`);
      }
    });

    it("must keep working: short categorical CSVs, synthetic Row index, and 2-letter codes stay vertical", () => {
      // samples/fruit-votes.csv (6 rows, max len 8)
      const pFruit = parseCsv(sampleBar);
      const cfgFruit = buildConfig(pFruit, detectChart(pFruit), { width: 1200, height: 675 });
      expect((cfgFruit.options as { indexAxis?: string })?.indexAxis).toBeUndefined();
      expect((cfgFruit.options?.scales?.x?.ticks as { autoSkip?: boolean })?.autoSkip).toBe(false);

      // samples/edge-cases.csv (4 rows, max len 14)
      const pEdge = parseCsv(sampleEdge);
      const cfgEdge = buildConfig(pEdge, detectChart(pEdge), { width: 1200, height: 675 });
      expect((cfgEdge.options as { indexAxis?: string })?.indexAxis).toBeUndefined();

      // 12-row single-numeric-column CSV (synthetic "Row" X-axis)
      const singleNumCsv = ["Score", ...Array.from({ length: 12 }, (_, i) => String((i + 1) * 5))].join("\n");
      const pSingle = parseCsv(singleNumCsv);
      const cfgSingle = buildConfig(pSingle, detectChart(pSingle), { width: 1200, height: 675 });
      expect((cfgSingle.options as { indexAxis?: string })?.indexAxis).toBeUndefined();

      // 12-row 2-letter country codes (maxLabelLen === 2 <= 4)
      const codes = ["US", "UK", "JP", "DE", "FR", "CA", "AU", "SG", "TW", "KR", "NL", "SE"];
      const codeCsv = ["Code,Val", ...codes.map((c, i) => `${c},${i + 10}`)].join("\n");
      const pCodes = parseCsv(codeCsv);
      const cfgCodes = buildConfig(pCodes, detectChart(pCodes), { width: 1200, height: 675 });
      expect((cfgCodes.options as { indexAxis?: string })?.indexAxis).toBeUndefined();
    });
  });

  describe("2. Intra-column CJK magnitude normalization & honest mixed-unit axes", () => {
    it("normalizes mixed CJK magnitudes and renders geometrically proportional bar heights (4x ratio, not inverted)", () => {
      const csv = "Branch,Revenue\nHQ,2億元\nSouth,5000萬元";
      const parsed = parseCsv(csv);
      expect(parsed.columns[1].nums).toEqual([2, 0.5]);
      expect(parsed.columns[1].unit).toBe("億元");
      expect(parsed.notes.some((n) => n.includes("normalized to 億元"))).toBe(true);

      const detection = detectChart(parsed);
      const svg = renderSvgString(parsed, detection, "Revenue", PRESETS[0]);
      const doc = parseSvgDoc(svg);

      // Extract filled bar paths matching lead palette color
      const leadHex = PALETTE[0].toLowerCase();
      const barPaths = [...doc.querySelectorAll("path")].filter(
        (p) => (p.getAttribute("fill") ?? "").toLowerCase() === leadHex
      );
      expect(barPaths.length).toBe(2);

      const barHeights = barPaths.map((p) => {
        const d = p.getAttribute("d") ?? "";
        const ys = [...d.matchAll(/[ML]\s*[-\d.]+\s+([-\d.]+)/g)].map((m) => Number(m[1]));
        return Math.max(...ys) - Math.min(...ys);
      });

      // HQ (2億元 = 20,000萬) MUST be ~4x taller than South (5,000萬元)
      const ratio = barHeights[0] / barHeights[1];
      expect(ratio).toBeGreaterThan(3.9);
      expect(ratio).toBeLessThan(4.1);
    });

    it("handles currency prefix + CJK magnitude ('NT$ 50萬元'), bare '億'/'萬', plain zero '0', and avoids IEEE-754 float noise", () => {
      const csv = "Dept,Budget\nA,NT$ 50萬元\nB,NT$ 1.14千元\nC,NT$ 1.2億元\nD,0";
      const parsed = parseCsv(csv);
      expect(parsed.columns[1].unit).toBe("NT$萬元");
      expect(parsed.columns[1].nums).toEqual([50, 0.114, 12000, 0]);
      // Ensure 1.14 * 1000 / 10000 === 0.114 cleanly without 0.11400000000000002
      expect(String(parsed.columns[1].nums[1])).toBe("0.114");

      const bareCsv = "Dept,Sales\nA,2億\nB,5000萬";
      const parsedBare = parseCsv(bareCsv);
      expect(parsedBare.columns[1].nums).toEqual([2, 0.5]);
      expect(parsedBare.columns[1].unit).toBe("億");
    });

    it("clears column.unit on incommensurable mixed currencies so exported SVG never lies about the axis currency", () => {
      const csv = "Market,Price\nUS,$100\nEU,€80";
      const parsed = parseCsv(csv);
      expect(parsed.columns[1].nums).toEqual([100, 80]);
      expect(parsed.columns[1].unit).toBeUndefined();

      const svg = renderSvgString(parsed, detectChart(parsed), "Prices", PRESETS[0]);
      expect(svg).not.toContain("Price ($)");
      expect(svg).not.toContain("Price (€)");
    });

    it("flags unit + unitless multi-series in mixedUnitsNote and displays shared unit on homogeneous multi-series", () => {
      // Heterogeneous: $ + unitless -> must warn
      const pMixed = parseCsv("Month,Revenue,Orders\n2025-01,$1200,45\n2025-02,$1500,52");
      const dMixed = detectChart(pMixed);
      const note = mixedUnitsNote(dMixed);
      expect(note).toContain("mixed units ($, no unit)");

      // Homogeneous: both $ -> no mixed warning, and shared unit "$" shown on value axis
      const pShared = parseCsv("Month,Revenue,Cost\n2025-01,$1200,$800\n2025-02,$1500,$950");
      const dShared = detectChart(pShared);
      expect(mixedUnitsNote(dShared)).toBeNull();
      const cfgShared = buildConfig(pShared, dShared, { width: 1200, height: 675 });
      expect(cfgShared.options?.scales?.y?.title).toMatchObject({ display: true, text: "$" });
    });
  });

  describe("3. Chronological & continuous-axis integrity across line / bar / scatter overrides", () => {
    it("sorts reverse-chronological dates Oldest -> Newest and drops NaN dates when forced to bar", () => {
      const csv = "Date,Sales\n2025-03-01,300\nN/A,999\n2025-01-01,100\n2025-02-01,200";
      const parsed = parseCsv(csv);
      const barDet = detectChart(parsed, "bar");
      const config = buildConfig(parsed, barDet, { width: 1200, height: 675 });

      expect(config.data.labels).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
      expect(config.data.datasets[0].data).toEqual([100, 200, 300]);

      const svg = renderSvgString(parsed, barDet, "Chrono Bar", PRESETS[0]);
      const doc = parseSvgDoc(svg);
      const texts = [...doc.querySelectorAll("text")];
      const xOf = (label: string) => {
        const el = texts.find((t) => t.textContent?.trim() === label);
        expect(el).toBeDefined();
        return svgTextPos(el!).x;
      };
      expect(xOf("2025-01-01")).toBeLessThan(xOf("2025-02-01"));
      expect(xOf("2025-02-01")).toBeLessThan(xOf("2025-03-01"));
    });

    it("plots 2-numeric-column CSV forced to line on a true continuous linear X-axis (dx(2->10) > 6 * dx(1->2)) with accessible table", () => {
      const csv = "Dose (mg),Response (%)\n1,10%\n2,50%\n10,90%";
      const parsed = parseCsv(csv);
      const lineDet = detectChart(parsed, "line");

      expect(lineDet.xColumn.name).toBe("Dose (mg)");
      expect(lineDet.yColumns.map((c) => c.name)).toEqual(["Response (%)"]);

      const svg = renderSvgString(parsed, lineDet, "Dose Response", PRESETS[0]);
      const doc = parseSvgDoc(svg);
      const strokeHex = PALETTE[0].toLowerCase();
      const linePath = [...doc.querySelectorAll("path")].find(
        (p) =>
          (p.getAttribute("stroke") ?? "").toLowerCase() === strokeHex &&
          (p.getAttribute("fill") ?? "none") === "none" &&
          (p.getAttribute("d") ?? "").includes("L")
      );
      expect(linePath).toBeDefined();
      const rawCoords = [...(linePath!.getAttribute("d") ?? "").matchAll(/[ML]\s*([-\d.]+)\s+([-\d.]+)/g)].map(
        (m) => ({ x: Number(m[1]), y: Number(m[2]) })
      );
      // segment: {} emits M p0 L p1 M p1 L p2 — deduplicate consecutive shared vertices
      const coords = rawCoords.filter(
        (pt, idx) => idx === 0 || Math.abs(pt.x - rawCoords[idx - 1].x) > 0.01 || Math.abs(pt.y - rawCoords[idx - 1].y) > 0.01
      );
      expect(coords.length).toBe(3);
      const dx12 = coords[1].x - coords[0].x;
      const dx210 = coords[2].x - coords[1].x;
      // On a proportional linear axis, (10 - 2) / (2 - 1) = 8x; categorical Row spacing would be 1x!
      expect(dx210).toBeGreaterThan(6 * dx12);

      // Verify screen-reader summary & table
      const cfg = buildConfig(parsed, lineDet, { width: 800, height: 600 });
      const table = document.createElement("table");
      const summary = document.createElement("p");
      populateSrTable(table, summary, cfg, lineDet, parsed, "Dose Response");
      expect(buildSrSummary("Dose Response", lineDet, cfg)).toBe(
        "Dose Response: line chart with 3 points across 1 series (Response (%))."
      );
      const rows = table.querySelectorAll("tbody tr");
      expect(rows.length).toBe(3);
      expect(rows[0].querySelector("th")?.textContent).toBe("1");
      expect(rows[2].querySelector("th")?.textContent).toBe("10");
      expect(rows[2].querySelector("td")?.textContent).toBe("90");
    });

    it("includes entity row headers in #sr-table and notes omitted canvas labels on forced scatter", () => {
      const csv = "Country,GDP,Population,Area\nTaiwan,790,23,36\nJapan,4200,124,378";
      const parsed = parseCsv(csv);
      const scatterDet = detectChart(parsed, "scatter");
      expect(scatterDet.droppedSeries).toEqual(["Area"]);

      const notes = collectNotes(parsed, scatterDet);
      expect(notes.some((n) => n.includes("does not label individual points by “Country”"))).toBe(true);

      const cfg = buildConfig(parsed, scatterDet, { width: 800, height: 600 });
      const table = document.createElement("table");
      const summary = document.createElement("p");
      populateSrTable(table, summary, cfg, scatterDet, parsed, "Countries");
      const rowHeaders = [...table.querySelectorAll("tbody th[scope='row']")].map((th) => th.textContent);
      expect(rowHeaders).toEqual(["Taiwan", "Japan"]);
    });
  });

  describe("4. Summary-row exclusion, scientific units, regional currencies & dot/quarter dates", () => {
    it("peels trailing Total / Average / 合計 summary rows without touching 'TotalEnergies' or 2-row CSVs", () => {
      // 3 dates + Total previously scored 3/4 = 0.75 < 0.8 -> degraded to bar chart!
      const dateWithTotal = "Month,Sales\n2025-01,100\n2025-02,120\n2025-03,140\nTotal,360";
      const p1 = parseCsv(dateWithTotal);
      expect(p1.rowCount).toBe(3);
      expect(detectChart(p1).type).toBe("line");
      expect(p1.notes.some((n) => n.includes("Excluded summary row “Total”"))).toBe(true);

      // Stacked Total + Average
      const stacked = "Dept,Sales\nNorth,100\nSouth,140\nEast,120\nTotal,360\nAverage,120";
      const p2 = parseCsv(stacked);
      expect(p2.rowCount).toBe(3);
      expect(p2.notes.some((n) => n.includes("Excluded summary rows (“Total”, “Average”)"))).toBe(true);

      // CJK 合計
      const zhTotal = "部門,營收\n台北,100\n台中,80\n合計,180";
      const pZh = parseCsv(zhTotal);
      expect(pZh.rowCount).toBe(2);
      expect(pZh.notes.some((n) => n.includes("“合計”"))).toBe(true);

      // Negative controls: real company name "TotalEnergies", 2-row CSV, and non-numeric rest cell
      const company = parseCsv("Company,Cap\nShell,210\nBP,105\nTotalEnergies,160");
      expect(company.rowCount).toBe(3);
      const twoRow = parseCsv("Item,Val\nA,10\nTotal,10");
      expect(twoRow.rowCount).toBe(2);
      const vocab = parseCsv("Word,Gloss,Freq\nMean,Average,10\nSum,Add,12\nTotal,Complete,42");
      expect(vocab.rowCount).toBe(3);
    });

    it("preserves unit on scientific notation ($1.5e6) and parses EU comma-exponent (1,5e6)", () => {
      const usSci = parseCsv("Item,Cap\nA,$1.5e6\nB,$2.5e6");
      expect(usSci.columns[1].unit).toBe("$");
      expect(usSci.columns[1].nums).toEqual([1500000, 2500000]);

      const euSci = parseCsv('Item,Cap\nA,"1,5e6"\nB,"2,5e6"');
      expect(euSci.columns[1].nums).toEqual([1500000, 2500000]);
    });

    it("supports regional currencies (HK$, S$, A$, C$, NZ$, CHF, ₩, ₹) while keeping ticker guard", () => {
      expect(cleanNumberString("HK$ 1,250")).toEqual({ cleaned: "1,250", unit: "HK$" });
      expect(cleanNumberString("S$850.50")).toEqual({ cleaned: "850.50", unit: "S$" });
      expect(cleanNumberString("A$99")).toEqual({ cleaned: "99", unit: "A$" });
      expect(cleanNumberString("C$120")).toEqual({ cleaned: "120", unit: "C$" });
      expect(cleanNumberString("NZ$75")).toEqual({ cleaned: "75", unit: "NZ$" });
      expect(cleanNumberString("CHF 400")).toEqual({ cleaned: "400", unit: "CHF" });
      expect(cleanNumberString("₩50,000")).toEqual({ cleaned: "50,000", unit: "₩" });
      expect(cleanNumberString("₹1,200")).toEqual({ cleaned: "1,200", unit: "₹" });
      // Ticker guards
      expect(cleanNumberString("HK$AAPL")).toEqual({ cleaned: "HK$AAPL" });
      expect(cleanNumberString("S$TSLA")).toEqual({ cleaned: "S$TSLA" });
    });

    it("parses 3-segment dot dates (2025.01.05) and quarters (2025-Q1..Q4) without hijacking 2-segment decimal prices (2025.01)", () => {
      // 3-segment dot date -> date
      const dotParsed = parseCsv("Date,Val\n2025.01.05,10\n2025.02.05,20");
      expect(dotParsed.columns[0].type).toBe("date");
      expect(dotParsed.columns[0].times[0]).toBe(+new Date(2025, 0, 5));

      // Invalid calendar day 2025.02.31 -> rejected
      const badDot = parseCsv("Date,Val\n2025.02.31,10\n2025.04.31,20");
      expect(badDot.columns[0].type).toBe("category");

      // CRITICAL TRAP GUARD: 2-segment decimal prices (2025.01, 2024.12) MUST remain numbers!
      const priceParsed = parseCsv("Product,Price\nMacBook,2025.01\nThinkPad,2024.12\nSurface,1999.99");
      expect(priceParsed.columns[1].type).toBe("number");
      expect(priceParsed.columns[1].nums).toEqual([2025.01, 2024.12, 1999.99]);
      expect(detectChart(priceParsed).type).toBe("bar");

      // Quarters -> quarterAxis time line rendering Q1 - 2025 .. Q4 - 2025
      const qParsed = parseCsv("Quarter,Rev\n2025-Q1,100\n2025-Q2,120\n2025-Q3,115\n2025-Q4,150");
      const qDet = detectChart(qParsed);
      expect(qDet.type).toBe("line");
      expect(qDet.timeAxis).toBe(true);
      expect(qDet.quarterAxis).toBe(true);
      const qSvg = renderSvgString(qParsed, qDet, "Quarterly", PRESETS[0]);
      expect(qSvg).toContain("Q1 - 2025");
      expect(qSvg).toContain("Q4 - 2025");
    });
  });

  describe("5. Slide 16:9 preset, slugifyTitle, Copy PNG clipboard & resilient UI lifecycle", () => {
    it("includes Slide 16:9 (1920x1080) preset while keeping a4print last", () => {
      expect(PRESETS.length).toBe(5);
      const slide = PRESETS.find((p) => p.id === "slide");
      expect(slide).toEqual({ id: "slide", label: "Slide 16:9 · 1920×1080", width: 1920, height: 1080 });
      expect(PRESETS[PRESETS.length - 1].id).toBe("a4print");
    });

    it("slugifies ASCII, CJK, and hostile titles safely", () => {
      expect(slugifyTitle("Monthly sales")).toBe("monthly-sales");
      expect(slugifyTitle("台灣部門營收 2025 (NT$)")).toBe("台灣部門營收-2025-nt");
      expect(slugifyTitle("../../../etc/passwd")).toBe("etc-passwd");
      expect(slugifyTitle("   ---   ")).toBe("chartsnap");
      expect(slugifyTitle("a".repeat(80)).length).toBeLessThanOrEqual(50);
    });

    it("copyPngToClipboard supports Promise<Blob> ClipboardItem, Blob fallback, and unsupported-browser error", async () => {
      const parsed = parseCsv("x,y\nA,10\nB,20");
      const detection = detectChart(parsed);

      const origClipboardItem = globalThis.ClipboardItem;
      const origClipboard = navigator.clipboard;

      try {
        // 1. Unsupported browser
        (globalThis as any).ClipboardItem = undefined;
        await expect(
          copyPngToClipboard(parsed, detection, "Test", PRESETS[0])
        ).rejects.toThrow(/not supported/i);

        // 2. Safari-style Promise<Blob> ClipboardItem
        const writeMock = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { write: writeMock },
        });
        let receivedData: unknown;
        (globalThis as any).ClipboardItem = class MockClipboardItem {
          constructor(items: Record<string, unknown>) {
            receivedData = items["image/png"];
          }
        };
        await copyPngToClipboard(parsed, detection, "Test", PRESETS[0]);
        expect(writeMock).toHaveBeenCalledTimes(1);
        expect(receivedData).toBeInstanceOf(Promise);
        const resolvedBlob = await (receivedData as Promise<Blob>);
        expect(resolvedBlob.type).toBe("image/png");

        // 3. Fallback when ClipboardItem rejects Promise<Blob> and requires resolved Blob
        (globalThis as any).ClipboardItem = class StrictBlobClipboardItem {
          constructor(items: Record<string, unknown>) {
            if (!(items["image/png"] instanceof Blob)) {
              throw new TypeError("Expected Blob");
            }
            receivedData = items["image/png"];
          }
        };
        await copyPngToClipboard(parsed, detection, "Test", PRESETS[0]);
        expect(writeMock).toHaveBeenCalledTimes(2);
        expect(receivedData).toBeInstanceOf(Blob);
      } finally {
        (globalThis as any).ClipboardItem = origClipboardItem;
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: origClipboard,
        });
      }
    });

    it("initializes live sample silently, keeps accidental prose paste inert, and guards FileReader out-of-order races", async () => {
      vi.resetModules();
      const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
      document.documentElement.innerHTML = html;
      await import("../src/main");

      const cs = (window as any).__cs;
      const resultEl = document.getElementById("result")!;
      const statusEl = document.getElementById("status")!;
      const lineChip = document.querySelector<HTMLButtonElement>('[data-sample="line"]')!;

      // 1. Silent initial sample render
      expect(resultEl.hidden).toBe(false);
      expect(cs.state()?.title).toBe("Monthly sales");
      expect(lineChip.classList.contains("active")).toBe(true);
      expect(lineChip.getAttribute("aria-pressed")).toBe("true");
      expect(statusEl.textContent).toBe("");

      // 2. Accidental prose paste with commas & newlines stays completely INERT
      const proseEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(proseEvent, "clipboardData", {
        value: { getData: () => "Hi Alice,\nLet's review the notes tomorrow, thanks!" },
      });
      document.dispatchEvent(proseEvent);
      expect(proseEvent.defaultPrevented).toBe(false);
      expect(cs.state()?.title).toBe("Monthly sales");
      expect(resultEl.hidden).toBe(false);

      // 3. Valid tabular paste updates chart, clears chip .active, and sets sr-only status confirmation
      const csvEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(csvEvent, "clipboardData", {
        value: { getData: () => "Team,Points\nAlpha,10\nBeta,25" },
      });
      document.dispatchEvent(csvEvent);
      expect(csvEvent.defaultPrevented).toBe(true);
      expect(cs.state()?.title).toBe("Points by Team");
      expect(lineChip.classList.contains("active")).toBe(false);
      expect(statusEl.className).toContain("sr-only");
      expect(statusEl.textContent).toContain("Rendered bar chart");

      // 4. Out-of-order FileReader race: slow File 1 finishes AFTER fast File 2 -> File 2 MUST win!
      const OriginalFileReader = globalThis.FileReader;
      const readers: { onload: (() => void) | null; result: ArrayBuffer | null }[] = [];
      (globalThis as any).FileReader = class MockRaceFileReader {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        result: ArrayBuffer | null = null;
        readAsArrayBuffer() {
          readers.push(this);
        }
      };

      try {
        cs.loadFile(new File(["x,y\nA,1\nB,2"], "stale_first.csv", { type: "text/csv" }));
        cs.loadFile(new File(["x,y\nC,10\nD,20"], "fresh_second.csv", { type: "text/csv" }));
        expect(readers.length).toBe(2);

        // File 2 finishes first
        readers[1].result = new TextEncoder().encode("x,y\nC,10\nD,20").buffer;
        readers[1].onload?.();
        expect(cs.state()?.title).toBe("fresh_second");

        // Stale File 1 finishes later -> must be ignored!
        readers[0].result = new TextEncoder().encode("x,y\nA,1\nB,2").buffer;
        readers[0].onload?.();
        expect(cs.state()?.title).toBe("fresh_second");
      } finally {
        globalThis.FileReader = OriginalFileReader;
      }
    });
  });
});
