// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanNumberString, parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { buildConfig, collectNotes, formatTitleWithUnit, mixedUnitsNote } from "../src/chart";
import { buildSrSummary, populateSrTable, resolveTitle } from "../src/a11y";
import { exportPng, PRESETS, renderSvgString } from "../src/export";
import { registerTheme, THEMES } from "../src/themes";

describe("v1.10.2 Audit Remediations", () => {
  describe("1. Partially blank header survival vs. single-cell report title extraction", () => {
    it("preserves pandas/R unnamed index column header (',votes') and all 3 data rows", () => {
      const csv = ",votes\nApples,30\nPears,45\nCherries,18";
      const parsed = parseCsv(csv);
      expect(parsed.extractedTitle).toBeUndefined();
      expect(parsed.columns.map((c) => c.name)).toEqual(["Column 1", "votes"]);
      expect(parsed.rowCount).toBe(3);
      expect(parsed.columns[0].raw).toEqual(["Apples", "Pears", "Cherries"]);
      expect(parsed.columns[1].nums).toEqual([30, 45, 18]);

      const det = detectChart(parsed);
      expect(det.type).toBe("bar");
      const svg = renderSvgString(parsed, det, "Fruit Votes", PRESETS[0]);
      expect(svg).toContain("Apples");
      expect(svg).toContain("Pears");
      expect(svg).toContain("Cherries");
    });

    it("preserves trailing unnamed column header ('item,') and all 3 data rows", () => {
      const csv = "item,\nApples,30\nPears,45\nCherries,18";
      const parsed = parseCsv(csv);
      expect(parsed.extractedTitle).toBeUndefined();
      expect(parsed.columns.map((c) => c.name)).toEqual(["item", "Column 2"]);
      expect(parsed.rowCount).toBe(3);
      expect(parsed.columns[0].raw).toEqual(["Apples", "Pears", "Cherries"]);
      expect(parsed.columns[1].nums).toEqual([30, 45, 18]);
    });

    it("still extracts single-cell report title ('Annual Sales Report 2025') and Excel merged title ('Annual Sales Report 2025,')", () => {
      const plainTitleCsv = "Annual Sales Report 2025\nYear,Revenue\n2023,100\n2024,150";
      const parsedPlain = parseCsv(plainTitleCsv);
      expect(parsedPlain.extractedTitle).toBe("Annual Sales Report 2025");
      expect(parsedPlain.columns.map((c) => c.name)).toEqual(["Year", "Revenue"]);
      expect(parsedPlain.rowCount).toBe(2);

      const excelMergedTitleCsv = "Annual Sales Report 2025,\nYear,Revenue\n2023,100\n2024,150";
      const parsedMerged = parseCsv(excelMergedTitleCsv);
      expect(parsedMerged.extractedTitle).toBe("Annual Sales Report 2025");
      expect(parsedMerged.columns.map((c) => c.name)).toEqual(["Year", "Revenue"]);
      expect(parsedMerged.rowCount).toBe(2);
    });

    it("still turns completely blank header row (',\\n1,2\\n3,4') into Column 1, Column 2", () => {
      const parsed = parseCsv(",\n1,2\n3,4");
      expect(parsed.extractedTitle).toBeUndefined();
      expect(parsed.columns.map((c) => c.name)).toEqual(["Column 1", "Column 2"]);
      expect(parsed.rowCount).toBe(2);
    });
  });

  describe("2. Pure mixed-unit warning: no ParsedCsv mutation, shown on first render, silent on scatter", () => {
    it("does not mutate frozen parsed.notes when building config or rendering SVG/PNG on mixed-unit data", async () => {
      const parsed = parseCsv("Month,Revenue,Margin\n2025-01,$100,15%\n2025-02,$200,18%\n2025-03,$300,22%");
      const det = detectChart(parsed);
      expect(det.type).toBe("line");

      Object.freeze(parsed.notes);
      Object.freeze(parsed);

      expect(() => {
        buildConfig(parsed, det, {
          title: "Mixed Units",
          width: 1200,
          height: 675,
          theme: THEMES.editorial,
        });
      }).not.toThrow();

      expect(parsed.notes).toHaveLength(0);

      const notes = collectNotes(parsed, det);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain("Multi-series chart contains mixed units ($, %) on the same axis");

      const svg = renderSvgString(parsed, det, "Mixed Units", PRESETS[0]);
      expect(svg).toContain("<svg");
      const png = await exportPng(parsed, det, "Mixed Units", PRESETS[0]);
      expect(png.size).toBeGreaterThan(1000);
    });

    it("never emits mixed-unit warning on scatter plots where X and Y are orthogonal axes", () => {
      const parsed = parseCsv("Spend,ROI\n$100,12%\n$250,19%\n$400,25%");
      const det = detectChart(parsed);
      expect(det.type).toBe("scatter");
      expect(det.yColumns[0]?.unit).toBe("$");
      expect(det.yColumns[1]?.unit).toBe("%");

      expect(mixedUnitsNote(det)).toBeNull();
      expect(collectNotes(parsed, det)).toEqual([]);

      // Negative control: when forced to 'bar' or 'line' where both columns share the Y axis, it DOES warn
      const detBar = detectChart(parsed, "bar");
      expect(detBar.type).toBe("bar");
      expect(mixedUnitsNote(detBar)).toContain("Multi-series chart contains mixed units ($, %) on the same axis");
    });
  });

  describe("3. unreadDateNote structural pre-check: silent on category labels, flags ambiguous dates", () => {
    it.each([
      ["Store 1..3", "store,sales\nStore 1,100\nStore 2,200\nStore 3,300"],
      ["Item 1..3", "item,qty\nItem 1,10\nItem 2,20\nItem 3,30"],
      ["Phase 1..3", "phase,score\nPhase 1,5\nPhase 2,8\nPhase 3,9"],
      ["Week 1..4", "week,commits\nWeek 1,12\nWeek 2,15\nWeek 3,9\nWeek 4,21"],
      ["Model 3..5", "car,units\nModel 3,500\nModel 4,200\nModel 5,300"],
    ])("does NOT emit ambiguous date note for ordinary category labels (%s)", (_label, csv) => {
      const parsed = parseCsv(csv);
      expect(parsed.notes).toEqual([]);
    });

    it.each([
      ["US slash date", "date,v\n01/02/2025,10\n01/03/2025,20\n01/04/2025,30", "01/02/2025"],
      ["single-digit slash date", "date,v\n1/5/2025,10\n1/6/2025,20\n1/7/2025,30", "1/5/2025"],
      ["short month-year", "date,v\nJan-25,10\nFeb-25,20\nMar-25,30", "Jan-25"],
      ["ROC calendar date", "date,v\n114/01/05,10\n114/01/06,20\n114/01/07,30", "114/01/05"],
    ])("DOES emit ambiguous date note for %s (%s)", (_label, csv, sampleValue) => {
      const parsed = parseCsv(csv);
      expect(parsed.notes).toHaveLength(1);
      expect(parsed.notes[0]).toContain(`“${sampleValue}”`);
      expect(parsed.notes[0]).toContain("looks like dates in a format that could be read more than one way");
    });
  });

  describe("4. resolveTitle preserves explicit title across chart-type overrides", () => {
    it("retains sourceTitle or extractedTitle when switching chart types, falling back to autoTitle only when neither exists", () => {
      const parsedWithTitle = parseCsv("Q1 Board Report\nCategory,Sales,Profit\nA,10,2\nB,20,5\nC,30,8");
      const detBar = detectChart(parsedWithTitle, "bar");
      const detLine = detectChart(parsedWithTitle, "line");
      const detScatter = detectChart(parsedWithTitle, "scatter");

      // In-sheet extractedTitle takes priority even over sourceTitle (file/chip) across all overrides
      expect(resolveTitle(detBar, parsedWithTitle, "monthly-sales")).toBe("Q1 Board Report");
      expect(resolveTitle(detLine, parsedWithTitle, "monthly-sales")).toBe("Q1 Board Report");
      expect(resolveTitle(detScatter, parsedWithTitle, "monthly-sales")).toBe("Q1 Board Report");

      // Extracted title takes priority across all overrides when sourceTitle is undefined
      expect(resolveTitle(detBar, parsedWithTitle, undefined)).toBe("Q1 Board Report");
      expect(resolveTitle(detLine, parsedWithTitle, undefined)).toBe("Q1 Board Report");
      expect(resolveTitle(detScatter, parsedWithTitle, undefined)).toBe("Q1 Board Report");

      // When extractedTitle is absent, sourceTitle takes priority
      const parsedNoTitle = parseCsv("Category,Sales,Profit\nA,10,2\nB,20,5");
      expect(resolveTitle(detectChart(parsedNoTitle, "bar"), parsedNoTitle, "monthly-sales")).toBe("monthly-sales");
      expect(resolveTitle(detectChart(parsedNoTitle, "scatter"), parsedNoTitle, "monthly-sales")).toBe("monthly-sales");

      // Only when both sourceTitle and extractedTitle are absent does autoTitle take over
      expect(resolveTitle(detectChart(parsedNoTitle, "bar"), parsedNoTitle, undefined)).toBe("Sales, Profit by Category");
      expect(resolveTitle(detectChart(parsedNoTitle, "scatter"), parsedNoTitle, undefined)).toBe("Profit vs Sales");
    });
  });

  describe("5. Number/currency edge cases, token-aware unit deduplication, scatter a11y units, and registerTheme validation", () => {
    it("parses NTD prefix and +$500 / $+500 while rejecting double signs and malformed accounting negatives", () => {
      expect(cleanNumberString("NTD 1,200")).toEqual({ cleaned: "1,200", unit: "NTD" });
      expect(cleanNumberString("+$500")).toEqual({ cleaned: "500", unit: "$" });
      expect(cleanNumberString("$+500")).toEqual({ cleaned: "500", unit: "$" });

      const parsed = parseCsv("item,price,delta\nA,NTD 1200,+$50\nB,NTD 1500,-$20");
      expect(parsed.columns[1].unit).toBe("NTD");
      expect(parsed.columns[1].nums).toEqual([1200, 1500]);
      expect(parsed.columns[2].unit).toBe("$");
      expect(parsed.columns[2].nums).toEqual([50, -20]);

      // Reject double signs and malformed accounting negatives
      for (const bad of ["--500", "+-500", "-+500", "(-500)", "(+500)"]) {
        const p = parseCsv(`v\n${bad}\n${bad}`);
        expect(p.columns[0].type).toBe("category");
        expect(p.columns[0].nums.every((n) => Number.isNaN(n))).toBe(true);
      }
    });

    it("deduplicates alphabetic units on word boundaries without substring false positives", () => {
      expect(formatTitleWithUnit("Amount", "NT")).toBe("Amount (NT)");
      expect(formatTitleWithUnit("Client Count", "NT")).toBe("Client Count (NT)");
      expect(formatTitleWithUnit("Amount (NT)", "NT")).toBe("Amount (NT)");
      expect(formatTitleWithUnit("Revenue (usd)", "USD")).toBe("Revenue (usd)");
      expect(formatTitleWithUnit("Price ($)", "$")).toBe("Price ($)");
      expect(formatTitleWithUnit("Growth %", "%")).toBe("Growth %");
    });

    it("includes units on scatter X and Y columns in both buildSrSummary and populateSrTable", () => {
      const parsed = parseCsv("Spend,Return\n$100,15%\n$200,25%");
      const det = detectChart(parsed);
      expect(det.type).toBe("scatter");
      const config = buildConfig(parsed, det, { title: "ROI Analysis" });

      const summary = buildSrSummary("ROI Analysis", det, config);
      expect(summary).toContain("Spend ($)");
      expect(summary).toContain("Return (%)");

      const table = document.createElement("table");
      const summaryEl = document.createElement("p");
      populateSrTable(table, summaryEl, config, det, parsed, "ROI Analysis");
      const headers = Array.from(table.querySelectorAll("th")).map((th) => th.textContent);
      expect(headers).toEqual(["Spend ($)", "Return (%)"]);
    });

    it("enforces palette length >= 6 and valid 3/4/6/8-digit hex codes in registerTheme", () => {
      const baseTheme = {
        id: "audit_test_theme",
        name: "Audit Theme",
        description: "Test",
        bg: "#ffffff",
        ink: "#111111",
        muted: "#555555",
        grid: "#eeeeee",
        palette: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"],
      };

      // Reject fewer than 6 palette colors
      expect(registerTheme({ ...baseTheme, palette: ["#112233", "#223344"] })).toBe(false);

      // Reject 5-digit or 7-digit invalid hex codes
      expect(registerTheme({ ...baseTheme, bg: "#12345" })).toBe(false);
      expect(registerTheme({ ...baseTheme, bg: "#1234567" })).toBe(false);

      // Accept valid 6-color palette with 6-digit hex codes
      expect(registerTheme(baseTheme)).toBe(true);
      delete THEMES.audit_test_theme;
    });
  });
});
