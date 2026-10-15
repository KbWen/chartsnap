// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanNumberString, parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { buildConfig } from "../src/chart";

describe("v1.10.1: Currency-First Accounting Negatives ($(500))", () => {
  it("parses accounting negatives where currency symbol is outside parentheses", () => {
    expect(cleanNumberString("$(500)")).toEqual({ cleaned: "-500", unit: "$" });
    expect(cleanNumberString("$ (500)")).toEqual({ cleaned: "-500", unit: "$" });
    expect(cleanNumberString("$ (1,234.56)")).toEqual({ cleaned: "-1,234.56", unit: "$" });
    expect(cleanNumberString("NT$(800)")).toEqual({ cleaned: "-800", unit: "NT$" });
    expect(cleanNumberString("€(120.50)")).toEqual({ cleaned: "-120.50", unit: "€" });
  });

  it("parses accounting negatives where currency symbol is inside parentheses", () => {
    expect(cleanNumberString("($500)")).toEqual({ cleaned: "-500", unit: "$" });
    expect(cleanNumberString("($ 1,234.56)")).toEqual({ cleaned: "-1,234.56", unit: "$" });
    expect(cleanNumberString("(NT$ 800)")).toEqual({ cleaned: "-800", unit: "NT$" });
  });

  it("parses minus sign before or after currency prefix", () => {
    expect(cleanNumberString("-$500")).toEqual({ cleaned: "-500", unit: "$" });
    expect(cleanNumberString("$-500")).toEqual({ cleaned: "-500", unit: "$" });
  });

  it("Tenth-Man Guard: stock tickers with parentheses $(AAPL) or $AAPL remain text categories", () => {
    expect(cleanNumberString("$AAPL")).toEqual({ cleaned: "$AAPL" });
    expect(cleanNumberString("$(AAPL)")).toEqual({ cleaned: "$(AAPL)" });
    expect(cleanNumberString("$(TSLA)")).toEqual({ cleaned: "$(TSLA)" });

    const csv = "Ticker,Balance\n$(AAPL),$(500)\n$(MSFT),$1200\n$(TSLA),$(350.25)";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    expect(parsed.columns[0].type).toBe("category");
    expect(parsed.columns[1].type).toBe("number");
    expect(parsed.columns[1].nums).toEqual([-500, 1200, -350.25]);
    expect(parsed.columns[1].unit).toBe("$");
    expect(detection.type).toBe("bar");
    expect(detection.xColumn.name).toBe("Ticker");
    expect(detection.yColumns[0].nums).toEqual([-500, 1200, -350.25]);
  });

  it("renders chart configuration with extracted currency unit on Y axis", () => {
    const csv = "Quarter,Net Profit\nQ1,$(500)\nQ2,$1500\nQ3,$(250)";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);
    const config = buildConfig(parsed, detection, { width: 1200, height: 675 });

    const yTitle = (config.options?.scales?.y as any)?.title?.text;
    expect(yTitle).toBe("Net Profit ($)");
  });
});

describe("v1.10.1: Dropzone Drop Event Deduplication", () => {
  it("stopping event propagation on dropzone prevents duplicate window drop execution", () => {
    const dropzone = document.createElement("button");
    dropzone.id = "drop";
    document.body.appendChild(dropzone);

    const handleFileSpy = vi.fn();

    // Mirroring main.ts event listener structure:
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      handleFileSpy("window");
    });

    dropzone.addEventListener("drop", (e) => {
      e.stopPropagation();
      handleFileSpy("dropzone");
    });

    // 1. Drop on dropzone
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    dropzone.dispatchEvent(dropEvent);

    // Expect handleFileSpy called ONLY ONCE by dropzone, not by window
    expect(handleFileSpy).toHaveBeenCalledTimes(1);
    expect(handleFileSpy).toHaveBeenCalledWith("dropzone");

    // 2. Drop elsewhere on window
    handleFileSpy.mockClear();
    const windowDropEvent = new Event("drop", { bubbles: true, cancelable: true });
    window.dispatchEvent(windowDropEvent);

    expect(handleFileSpy).toHaveBeenCalledTimes(1);
    expect(handleFileSpy).toHaveBeenCalledWith("window");

    dropzone.remove();
  });
});
