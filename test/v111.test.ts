// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cleanNumberString, isYearHeader, parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { resolveTitle, withBusy } from "../src/a11y";

describe("v1.11 Multi-Persona Real-World Resilience", () => {
  describe("1. Trailing currencies & CJK monetary suffixes in cleanNumberString", () => {
    it("parses trailing currency symbols, ISO codes, and CJK monetary suffixes", () => {
      // European trailing currencies
      expect(cleanNumberString("120 €")).toEqual({ cleaned: "120", unit: "€" });
      expect(cleanNumberString("-120 €")).toEqual({ cleaned: "-120", unit: "€" });
      expect(cleanNumberString("(80 €)")).toEqual({ cleaned: "-80", unit: "€" });
      expect(cleanNumberString("(80) €")).toEqual({ cleaned: "-80", unit: "€" });
      expect(cleanNumberString("150 EUR")).toEqual({ cleaned: "150", unit: "EUR" });
      expect(cleanNumberString("300 GBP")).toEqual({ cleaned: "300", unit: "GBP" });
      expect(cleanNumberString("200 USD")).toEqual({ cleaned: "200", unit: "USD" });
      expect(cleanNumberString("100 $")).toEqual({ cleaned: "100", unit: "$" });

      // CJK trailing units and currencies
      expect(cleanNumberString("50萬元")).toEqual({ cleaned: "50", unit: "萬元" });
      expect(cleanNumberString("800千元")).toEqual({ cleaned: "800", unit: "千元" });
      expect(cleanNumberString("3億元")).toEqual({ cleaned: "3", unit: "億元" });
      expect(cleanNumberString("500元")).toEqual({ cleaned: "500", unit: "元" });
      expect(cleanNumberString("100 NT$")).toEqual({ cleaned: "100", unit: "NT$" });
      expect(cleanNumberString("200 NTD")).toEqual({ cleaned: "200", unit: "NTD" });
      expect(cleanNumberString("300 NT")).toEqual({ cleaned: "300", unit: "NT" });
      expect(cleanNumberString("400 JPY")).toEqual({ cleaned: "400", unit: "JPY" });
      expect(cleanNumberString("500 ¥")).toEqual({ cleaned: "500", unit: "¥" });
      expect(cleanNumberString("600 RMB")).toEqual({ cleaned: "600", unit: "RMB" });
    });

    it("emits warning when a single column mixes distinct units, but stays silent when consistent", () => {
      // Mixed units in the same column
      const mixedCsv = "Branch,Revenue\nTaipei,50萬元\nTaichung,800千元\nTainan,1.2億元";
      const parsedMixed = parseCsv(mixedCsv);
      expect(parsedMixed.columns[1].type).toBe("number");
      expect(parsedMixed.columns[1].nums).toEqual([50, 800, 1.2]);
      const mixedNote = parsedMixed.notes.find((n) => n.includes("mixes units"));
      expect(mixedNote).toBeDefined();
      expect(mixedNote).toContain("Column “Revenue” mixes units (萬元, 千元, 億元) — read at face value.");

      // Consistent unit in column: no warning
      const uniformCsv = "Branch,Revenue\nTaipei,50萬元\nTaichung,80萬元\nTainan,120萬元";
      const parsedUniform = parseCsv(uniformCsv);
      expect(parsedUniform.notes.some((n) => n.includes("mixes units"))).toBe(false);
      expect(parsedUniform.columns[1].unit).toBe("萬元");
    });

    it("preserves stock ticker guard and rejects double signs", () => {
      // Stock ticker guard holds
      expect(cleanNumberString("$AAPL")).toEqual({ cleaned: "$AAPL" });
      expect(cleanNumberString("$(AAPL)")).toEqual({ cleaned: "$(AAPL)" });
      expect(cleanNumberString("AAPL €")).toEqual({ cleaned: "AAPL €" });

      // Double signs rejected
      for (const bad of ["--500", "+-500", "-+500", "(-500)", "(+500)", "-+120 €"]) {
        const res = cleanNumberString(bad);
        expect(res.cleaned).toBe(bad);
      }
    });
  });

  describe("2. Title-row vs. partially-blank header disambiguation", () => {
    it("preserves partially-blank header with EU decimal data row 1 ('item;\\nApples;12,5\\nPears;15,2')", () => {
      const csv = "item;\nApples;12,5\nPears;15,2";
      const parsed = parseCsv(csv);
      expect(parsed.extractedTitle).toBeUndefined();
      expect(parsed.columns[0].name).toBe("item");
      expect(parsed.columns[1].name).toBe("Column 2");
      expect(parsed.rowCount).toBe(2);
      expect(parsed.columns[0].raw).toEqual(["Apples", "Pears"]);
      expect(parsed.columns[1].nums).toEqual([12.5, 15.2]);
    });

    it("preserves partially-blank header with missing value in row 1 ('item,\\nApples,N/A\\nPears,45')", () => {
      const csv = "item,\nApples,N/A\nPears,45";
      const parsed = parseCsv(csv);
      expect(parsed.extractedTitle).toBeUndefined();
      expect(parsed.columns[0].name).toBe("item");
      expect(parsed.columns[1].name).toBe("Column 2");
      expect(parsed.rowCount).toBe(2);
      expect(parsed.columns[0].raw).toEqual(["Apples", "Pears"]);
      expect(parsed.columns[1].nums[0]).toBeNaN();
      expect(parsed.columns[1].nums[1]).toBe(45);
    });

    it("extracts title and recognizes 4-digit year headers in Excel pivot tables", () => {
      const pivotCsv =
        "2025 Regional Sales,,,\nRegion,2023,2024,2025\nNorth,100,120,150\nSouth,80,90,110";
      const parsed = parseCsv(pivotCsv);
      expect(parsed.extractedTitle).toBe("2025 Regional Sales");
      expect(parsed.columns.map((c) => c.name)).toEqual(["Region", "2023", "2024", "2025"]);
      expect(parsed.rowCount).toBe(2);
      expect(parsed.columns[0].raw).toEqual(["North", "South"]);
      expect(parsed.columns[1].nums).toEqual([100, 80]);
      expect(parsed.columns[2].nums).toEqual([120, 90]);
      expect(parsed.columns[3].nums).toEqual([150, 110]);
    });

    it("maintains backward compatibility for standard title rows and unnamed index headers", () => {
      // Unnamed pandas/R index column
      const rCsv = ",votes\nApples,30\nPears,45";
      const parsedR = parseCsv(rCsv);
      expect(parsedR.extractedTitle).toBeUndefined();
      expect(parsedR.columns[0].name).toBe("Column 1");
      expect(parsedR.columns[1].name).toBe("votes");

      // Single-line un-delimited title row
      const titleCsv = "Annual Sales Report 2025\nYear,Revenue\n2023,100\n2024,150";
      const parsedTitle = parseCsv(titleCsv);
      expect(parsedTitle.extractedTitle).toBe("Annual Sales Report 2025");
      expect(parsedTitle.columns[0].name).toBe("Year");
      expect(parsedTitle.columns[1].name).toBe("Revenue");

      // Excel merged title row with trailing comma
      const mergedCsv = "Annual Sales Report 2025,\nYear,Revenue\n2023,100\n2024,150";
      const parsedMerged = parseCsv(mergedCsv);
      expect(parsedMerged.extractedTitle).toBe("Annual Sales Report 2025");
      expect(parsedMerged.columns[0].name).toBe("Year");
      expect(parsedMerged.columns[1].name).toBe("Revenue");
    });
  });

  describe("3. In-sheet extractedTitle priority over generic filename in resolveTitle", () => {
    it("prioritizes extractedTitle over sourceTitle (filename) when present", () => {
      const csvWithTitle = "2025 Regional Sales,,,\nRegion,2023,2024,2025\nNorth,100,120,150";
      const parsed = parseCsv(csvWithTitle);
      expect(parsed.extractedTitle).toBe("2025 Regional Sales");

      const det = detectChart(parsed);
      // In-sheet title beats generic filename 'Book1' or 'export'
      expect(resolveTitle(det, parsed, "Book1")).toBe("2025 Regional Sales");
      expect(resolveTitle(det, parsed, "export")).toBe("2025 Regional Sales");
      // Still beats autoTitle when sourceTitle is undefined
      expect(resolveTitle(det, parsed, undefined)).toBe("2025 Regional Sales");
    });

    it("prioritizes sourceTitle when extractedTitle is absent, and falls back to autoTitle only when both are absent", () => {
      const normalCsv = "Category,Sales\nWidgets,100\nGadgets,200";
      const parsed = parseCsv(normalCsv);
      expect(parsed.extractedTitle).toBeUndefined();

      const det = detectChart(parsed);
      // When no extractedTitle, file name / chip title wins
      expect(resolveTitle(det, parsed, "q3_quarterly_report")).toBe("q3_quarterly_report");
      expect(resolveTitle(det, parsed, "Monthly sales")).toBe("Monthly sales");

      // When neither exists, autoTitle generates readable title
      expect(resolveTitle(det, parsed, undefined)).toBe("Sales by Category");
    });
  });

  describe("4. isYearHeader precision across Chinese and English", () => {
    it("correctly identifies valid year headers", () => {
      const validHeaders = [
        "year",
        "Year",
        "yr",
        "years",
        "fiscal_year",
        "calendar year",
        "birth_year",
        "model-year",
        "Year (AD)",
        "年",
        "年份",
        "年度",
        "年份(西元)",
        "年度別",
        "會計年度",
        "會計年度 2025",
        "年_2025",
        "西元年",
        "出生年",
      ];
      for (const h of validHeaders) {
        expect(isYearHeader(h), `Expected '${h}' to be a year header`).toBe(true);
      }
    });

    it("rejects metric columns containing '年' or 'year' from being year headers", () => {
      const invalidHeaders = [
        "去年營收",
        "今年營收",
        "明年預估",
        "前年營收",
        "歷年營收",
        "全年營收",
        "半年營收",
        "年營收",
        "年終獎金",
        "年齡",
        "年資",
        "年增率",
        "last_year_revenue",
        "this_year_sales",
        "next_year_target",
        "prior_year",
        "prev_year",
        "previous_year",
        "past_year",
        "year_end_bonus",
        "3-yr-avg",
        "Year over Year %",
        "last_year",
        "this year",
      ];
      for (const h of invalidHeaders) {
        expect(isYearHeader(h), `Expected '${h}' NOT to be a year header`).toBe(false);
      }
    });

    it("treats Taiwanese revenue columns in NT$ thousands (店別,去年營收,今年營收) as numbers, not date axis", () => {
      const csv = "店別,去年營收,今年營收\n台北店,2000,2100\n台中店,1950,2050";
      const parsed = parseCsv(csv);
      expect(parsed.columns[1].type).toBe("number");
      expect(parsed.columns[2].type).toBe("number");
      expect(parsed.columns[1].bareYears).toBe(false);
      expect(parsed.columns[2].bareYears).toBe(false);

      const det = detectChart(parsed);
      expect(det.type).toBe("bar");
      expect(det.xColumn.name).toBe("店別");
      expect(det.yColumns.map((c) => c.name)).toEqual(["去年營收", "今年營收"]);
      expect(det.timeAxis).toBe(false);
    });

    it("treats English metric columns (last_year_revenue) with 4-digit values as numbers", () => {
      const csv = "store,last_year_revenue,this_year_revenue\nStore A,2000,2100\nStore B,1950,2050";
      const parsed = parseCsv(csv);
      expect(parsed.columns[1].type).toBe("number");
      expect(parsed.columns[2].type).toBe("number");
      expect(parsed.columns[1].bareYears).toBe(false);

      const det = detectChart(parsed);
      expect(det.type).toBe("bar");
      expect(det.xColumn.name).toBe("store");
      expect(det.timeAxis).toBe(false);
    });

    it("still creates a time-axis line chart for legitimate year headers", () => {
      const csv = "年份,利潤\n2020,500\n2021,600\n2022,750";
      const parsed = parseCsv(csv);
      expect(parsed.columns[0].type).toBe("date");
      expect(parsed.columns[0].bareYears).toBe(true);

      const det = detectChart(parsed);
      expect(det.type).toBe("line");
      expect(det.xColumn.name).toBe("年份");
      expect(det.timeAxis).toBe(true);
    });
  });

  describe("5. Keyboard focus retention & aria-busy in withBusy", () => {
    it("sets aria-busy and disabled while running, restores text and aria-busy on completion", async () => {
      const btn = document.createElement("button");
      btn.textContent = "Download PNG";

      let executed = false;
      const runner = withBusy(btn, "Rendering…", async () => {
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute("aria-busy")).toBe("true");
        expect(btn.textContent).toBe("Rendering…");
        executed = true;
      });

      await runner();
      expect(executed).toBe(true);
      expect(btn.disabled).toBe(false);
      expect(btn.hasAttribute("aria-busy")).toBe(false);
      expect(btn.textContent).toBe("Download PNG");
    });

    it("restores focus to button if it had focus prior to execution", async () => {
      const btn = document.createElement("button");
      btn.textContent = "Download SVG";
      document.body.appendChild(btn);
      btn.focus();
      expect(document.activeElement).toBe(btn);

      const runner = withBusy(btn, "Exporting…", async () => {
        expect(btn.disabled).toBe(true);
      });

      await runner();
      expect(btn.disabled).toBe(false);
      expect(document.activeElement).toBe(btn);
      document.body.removeChild(btn);
    });

    it("does NOT focus button if it did not have focus prior to execution", async () => {
      const otherInput = document.createElement("input");
      const btn = document.createElement("button");
      btn.textContent = "Export";
      document.body.appendChild(otherInput);
      document.body.appendChild(btn);

      otherInput.focus();
      expect(document.activeElement).toBe(otherInput);

      const runner = withBusy(btn, "Exporting…", async () => {
        expect(btn.disabled).toBe(true);
      });

      await runner();
      expect(btn.disabled).toBe(false);
      // Focus must remain on otherInput, not stolen by btn
      expect(document.activeElement).toBe(otherInput);

      document.body.removeChild(otherInput);
      document.body.removeChild(btn);
    });

    it("invokes onError callback on failure and restores button state in finally", async () => {
      const btn = document.createElement("button");
      btn.textContent = "Save";

      const errHandler = vi.fn();
      const runner = withBusy(
        btn,
        "Saving…",
        async () => {
          throw new Error("Disk full");
        },
        errHandler
      );

      await runner();
      expect(errHandler).toHaveBeenCalledTimes(1);
      expect(errHandler.mock.calls[0][0].message).toBe("Disk full");
      expect(btn.disabled).toBe(false);
      expect(btn.hasAttribute("aria-busy")).toBe(false);
      expect(btn.textContent).toBe("Save");
    });
  });

  describe("6. Clean state reset on error in main.ts", () => {
    it("resets state to null when a CSV parse or detect error occurs", async () => {
      const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
      document.documentElement.innerHTML = html;
      await import("../src/main");
      const cs = (window as any).__cs;
      expect(cs).toBeDefined();

      // Successfully load a chart
      cs.load("date,v\n2025-01-01,10\n2025-01-02,20");
      expect(cs.state()).not.toBeNull();
      expect(cs.state().detection.type).toBe("line");

      // Load an invalid CSV -> error caught -> state reset to null
      cs.load("single_row_only");
      expect(cs.state()).toBeNull();
      const statusEl = document.getElementById("status");
      expect(statusEl?.textContent).toContain("Need a header row plus at least one data row");
      const resultEl = document.getElementById("result");
      expect(resultEl?.hidden).toBe(true);
    });
  });
});
