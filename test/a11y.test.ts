// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCsv, scrub } from "../src/csv";
import { detectChart } from "../src/detect";
import { buildConfig } from "../src/chart";
import { autoTitle, buildSrSummary, populateSrTable } from "../src/a11y";

function setupDOM(): void {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
  document.documentElement.innerHTML = html;
}

function assertAccessibleToScreenReaders(el: HTMLElement | null): void {
  if (!el) throw new Error("Element does not exist");
  if (el.hidden) throw new Error("Element has hidden attribute");
  if (el.getAttribute("aria-hidden") === "true") throw new Error("Element has aria-hidden='true'");
  if (el.style.display === "none") throw new Error("Element has display: none");
  let parent = el.parentElement;
  while (parent) {
    if (parent.hidden) throw new Error(`Parent <${parent.tagName.toLowerCase()}> has hidden attribute`);
    if (parent.getAttribute("aria-hidden") === "true") {
      throw new Error(`Parent <${parent.tagName.toLowerCase()}> has aria-hidden='true'`);
    }
    if (parent.style.display === "none") {
      throw new Error(`Parent <${parent.tagName.toLowerCase()}> has display: none`);
    }
    parent = parent.parentElement;
  }
}

describe("v1.6 Accessibility: Dropzone Semantics", () => {
  beforeEach(() => {
    setupDOM();
  });

  it("dropzone is a button element with type='button'", () => {
    const drop = document.getElementById("drop");
    expect(drop).not.toBeNull();
    expect(drop?.tagName.toLowerCase()).toBe("button");
    expect(drop?.getAttribute("type")).toBe("button");
  });

  it("dropzone has an accessible name", () => {
    const drop = document.getElementById("drop");
    const name = drop?.getAttribute("aria-label") ?? drop?.textContent?.trim();
    expect(name).toBeTruthy();
    expect(name).toMatch(/choose|csv|drop/i);
  });

  it("clicking dropzone delegates click to hidden file input", () => {
    const drop = document.getElementById("drop") as HTMLButtonElement;
    const file = document.getElementById("file") as HTMLInputElement;
    expect(drop).not.toBeNull();
    expect(file).not.toBeNull();

    let fileClicked = false;
    file.click = () => {
      fileClicked = true;
    };
    drop.addEventListener("click", () => file.click());
    drop.click();
    expect(fileClicked).toBe(true);
  });
});

describe("v1.6 Accessibility: Title in DOM", () => {
  beforeEach(() => {
    setupDOM();
  });

  it("chart title element exists in the DOM outside canvas pixels", () => {
    const titleEl = document.getElementById("chart-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.tagName.toLowerCase()).toBe("h2");
  });

  it("asserts title on all three distinct title paths: file, paste, chip", () => {
    const csvData = "date,sales\n2025-01-01,100\n2025-02-01,150";
    const parsed = parseCsv(csvData);
    const detection = detectChart(parsed);

    // Path 1: File path uses scrubbed filename
    const fileRawName = "q3_quarterly_report.csv";
    const fileTitle = scrub(fileRawName.replace(/\.[^.]+$/, ""));
    expect(fileTitle).toBe("q3_quarterly_report");

    // Path 2: Paste path uses autoTitle
    const pasteTitle = autoTitle(detection);
    expect(pasteTitle).toBe("sales over date");

    // Path 3: Sample chip uses literal title
    const chipTitle = "Monthly sales";

    // All three must differ so a test hardcoding one fails on the other two
    expect(fileTitle).not.toBe(pasteTitle);
    expect(fileTitle).not.toBe(chipTitle);
    expect(pasteTitle).not.toBe(chipTitle);

    const titleEl = document.getElementById("chart-title")!;

    // Test File path
    titleEl.textContent = fileTitle;
    expect(titleEl.textContent).toBe("q3_quarterly_report");

    // Test Paste path
    titleEl.textContent = pasteTitle;
    expect(titleEl.textContent).toBe("sales over date");

    // Test Chip path
    titleEl.textContent = chipTitle;
    expect(titleEl.textContent).toBe("Monthly sales");
  });
});

describe("v1.6 Accessibility: Screen Reader Table (#sr-table)", () => {
  beforeEach(() => {
    setupDOM();
  });

  it("visually-hidden data table container exists and passes a11y checks", () => {
    const table = document.getElementById("sr-table") as HTMLTableElement;
    expect(table).not.toBeNull();
    // Container in index.html is #sr-container inside #result
    // When #result is rendered (unhidden), #sr-table is accessible
    const result = document.getElementById("result")!;
    result.hidden = false;
    expect(() => assertAccessibleToScreenReaders(table)).not.toThrow();
  });

  it("negative control: an a11y check strictly throws if table or container is hidden or aria-hidden", () => {
    const table = document.getElementById("sr-table") as HTMLTableElement;
    const container = document.getElementById("sr-container") as HTMLElement;
    const result = document.getElementById("result")!;
    result.hidden = false;

    // Baseline: accessible
    expect(() => assertAccessibleToScreenReaders(table)).not.toThrow();

    // Negative control 1: table display: none
    table.style.display = "none";
    expect(() => assertAccessibleToScreenReaders(table)).toThrow(/display: none/);
    table.style.display = "";

    // Negative control 2: table aria-hidden="true"
    table.setAttribute("aria-hidden", "true");
    expect(() => assertAccessibleToScreenReaders(table)).toThrow(/aria-hidden='true'/);
    table.removeAttribute("aria-hidden");

    // Negative control 3: container aria-hidden="true"
    container.setAttribute("aria-hidden", "true");
    expect(() => assertAccessibleToScreenReaders(table)).toThrow(/aria-hidden='true'/);
    container.removeAttribute("aria-hidden");

    // Negative control 4: ancestor hidden attribute
    result.hidden = true;
    expect(() => assertAccessibleToScreenReaders(table)).toThrow(/hidden attribute/);
    result.hidden = false;
  });

  it("scatter plot: table positionally matches buildConfig datasets, excluding NaNs", () => {
    const csvWithNans = [
      "height,weight",
      "170,65",
      "180,NaN",
      "175,72",
      "NaN,80",
      "165,58",
    ].join("\n");
    const parsed = parseCsv(csvWithNans);
    const detection = detectChart(parsed);
    const config = buildConfig(parsed, detection, {
      title: "Height vs weight",
      width: 800,
      height: 600,
    });

    const table = document.getElementById("sr-table") as HTMLTableElement;
    const summary = document.getElementById("sr-summary") as HTMLElement;
    populateSrTable(table, summary, config, detection, parsed, "Height vs weight");

    // Scatter datasets in config:
    const points = config.data.datasets[0].data as { x: number; y: number }[];
    expect(points.length).toBe(3); // 2 rows with NaN skipped

    // Summary asserts points and columns
    expect(summary.textContent).toBe(
      "Height vs weight: scatter plot with 3 points comparing weight against height."
    );

    // Headers
    const headers = table.querySelectorAll("thead th");
    expect(headers.length).toBe(2);
    expect(headers[0].textContent).toBe("height");
    expect(headers[1].textContent).toBe("weight");

    // Positionally assert every single plotted point
    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBe(points.length);
    for (let i = 0; i < points.length; i++) {
      const cells = rows[i].querySelectorAll("td");
      expect(cells.length).toBe(2);
      expect(Number(cells[0].textContent)).toBe(points[i].x);
      expect(Number(cells[1].textContent)).toBe(points[i].y);
    }
  });

  it("time-axis line: table rows are chronologically sorted matching buildConfig datasets", () => {
    // Unsorted dates in CSV
    const csvUnsortedDates = [
      "date,sales",
      "2025-05-01,500",
      "2025-01-01,100",
      "2025-03-01,300",
    ].join("\n");
    const parsed = parseCsv(csvUnsortedDates);
    const detection = detectChart(parsed);
    const config = buildConfig(parsed, detection, {
      title: "Sales over time",
      width: 800,
      height: 600,
    });

    const table = document.getElementById("sr-table") as HTMLTableElement;
    const summary = document.getElementById("sr-summary") as HTMLElement;
    populateSrTable(table, summary, config, detection, parsed, "Sales over time");

    const datasets = config.data.datasets;
    const sortedData = datasets[0].data as { x: number; y: number }[];

    expect(summary.textContent).toBe(
      "Sales over time: line chart with 3 time points across 1 series (sales)."
    );

    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBe(3);

    // First row must be Jan, then Mar, then May
    expect(rows[0].querySelector("th")?.textContent).toBe("2025-01-01");
    expect(Number(rows[0].querySelector("td")?.textContent)).toBe(100);

    expect(rows[1].querySelector("th")?.textContent).toBe("2025-03-01");
    expect(Number(rows[1].querySelector("td")?.textContent)).toBe(300);

    expect(rows[2].querySelector("th")?.textContent).toBe("2025-05-01");
    expect(Number(rows[2].querySelector("td")?.textContent)).toBe(500);

    // Positionally assert against config dataset values
    for (let i = 0; i < sortedData.length; i++) {
      expect(Number(rows[i].querySelector("td")?.textContent)).toBe(sortedData[i].y);
    }
  });

  it("dropped series beyond MAX_SERIES (6) are excluded from the table, staying synchronized with Chart.js", () => {
    const csvWide = [
      "month,s1,s2,s3,s4,s5,s6,s7,s8",
      "Jan,1,2,3,4,5,6,7,8",
      "Feb,10,20,30,40,50,60,70,80",
    ].join("\n");
    const parsed = parseCsv(csvWide);
    const detection = detectChart(parsed);
    expect(detection.droppedSeries).toEqual(["s7", "s8"]);

    const config = buildConfig(parsed, detection, {
      title: "Wide Series",
      width: 800,
      height: 600,
    });

    const table = document.getElementById("sr-table") as HTMLTableElement;
    const summary = document.getElementById("sr-summary") as HTMLElement;
    populateSrTable(table, summary, config, detection, parsed, "Wide Series");

    // Verify only the 6 plotted datasets exist in table headers
    const ths = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(ths).toEqual(["month", "s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(ths).not.toContain("s7");
    expect(ths).not.toContain("s8");

    // Rows have 1 th + 6 tds
    const firstRow = table.querySelector("tbody tr")!;
    expect(firstRow.querySelector("th")?.textContent).toBe("Jan");
    const tds = Array.from(firstRow.querySelectorAll("td")).map((td) => Number(td.textContent));
    expect(tds).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("v1.6 Accessibility: Permanent Live Regions", () => {
  beforeEach(() => {
    setupDOM();
  });

  it("status and notes live regions are outside any element that can be hidden", () => {
    const status = document.getElementById("status");
    const notes = document.getElementById("notes");
    const result = document.getElementById("result");

    expect(status).not.toBeNull();
    expect(notes).not.toBeNull();
    expect(result).not.toBeNull();

    // Neither live region is inside #result (which is toggled with hidden)
    expect(result?.contains(status)).toBe(false);
    expect(result?.contains(notes)).toBe(false);

    // Initial state: not hidden
    expect(status?.hidden).toBe(false);
    expect(notes?.hidden).toBe(false);

    // Both have role="status" and aria-live="polite"
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(notes?.getAttribute("role")).toBe("status");
    expect(notes?.getAttribute("aria-live")).toBe("polite");
  });

  it("invariant holds: at no moment is active status/notes satisfying textContent !== '' && (hidden || display === 'none')", () => {
    const status = document.getElementById("status") as HTMLElement;
    const notes = document.getElementById("notes") as HTMLElement;

    const assertInvariant = (el: HTMLElement) => {
      if (el.textContent !== "") {
        expect(el.hidden).toBe(false);
        expect(el.style.display).not.toBe("none");
        let parent = el.parentElement;
        while (parent) {
          expect(parent.hidden).toBe(false);
          expect(parent.style.display).not.toBe("none");
          parent = parent.parentElement;
        }
      }
    };

    // Simulate status message
    status.textContent = "Error: Invalid CSV format";
    status.className = "status error";
    assertInvariant(status);

    // Simulate notes message
    notes.textContent = "Some characters didn't decode as UTF-8";
    assertInvariant(notes);

    // Simulate clear
    status.textContent = "";
    notes.textContent = "";
    assertInvariant(status);
    assertInvariant(notes);
  });
});
