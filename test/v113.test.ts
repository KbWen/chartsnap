// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildConfig } from "../src/chart";
import { parseCsv, scrub } from "../src/csv";
import { detectChart } from "../src/detect";

describe("v1.13 — Input fidelity, keyboard velocity, dimension defense & social discoverability", () => {
  describe("1. index.html file picker accept & social metadata", () => {
    const htmlPath = resolve(__dirname, "../index.html");
    const html = readFileSync(htmlPath, "utf-8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    it("file input accept attribute includes .tsv and text/tab-separated-values", () => {
      const fileInput = doc.getElementById("file") as HTMLInputElement;
      expect(fileInput).not.toBeNull();
      const accept = fileInput.getAttribute("accept") ?? "";
      expect(accept).toContain(".tsv");
      expect(accept).toContain("text/tab-separated-values");
      expect(accept).toBe(".csv,text/csv,text/plain,.tsv,text/tab-separated-values");
    });

    it("includes complete Open Graph meta tags", () => {
      const getMeta = (prop: string) =>
        doc.querySelector(`meta[property="${prop}"]`)?.getAttribute("content");

      expect(getMeta("og:title")).toBe("chartsnap — CSV to chart, in your browser");
      expect(getMeta("og:description")).toBe(
        "Drop a CSV and get a chart sized for Twitter, Instagram, Slide (16:9), or A4. Runs in your browser, nothing uploaded. Free PNG and SVG export."
      );
      expect(getMeta("og:type")).toBe("website");
      expect(getMeta("og:url")).toBe("https://kbwen.github.io/chartsnap/");
      expect(getMeta("og:image")).toBe("https://kbwen.github.io/chartsnap/og.png");
    });

    it("includes complete Twitter Card meta tags", () => {
      const getMeta = (name: string) =>
        doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

      expect(getMeta("twitter:card")).toBe("summary_large_image");
      expect(getMeta("twitter:title")).toBe("chartsnap — CSV to chart, in your browser");
      expect(getMeta("twitter:description")).toBe(
        "Drop a CSV and get a chart sized for Twitter, Instagram, Slide (16:9), or A4. Runs in your browser, nothing uploaded. Free PNG and SVG export."
      );
      expect(getMeta("twitter:image")).toBe("https://kbwen.github.io/chartsnap/og.png");
    });
  });

  describe("2. Assets & Public Dir", () => {
    it("public/og.png exists and matches docs/hero.png byte-for-byte", () => {
      const heroPath = resolve(__dirname, "../docs/hero.png");
      const ogPath = resolve(__dirname, "../public/og.png");

      expect(existsSync(heroPath)).toBe(true);
      expect(existsSync(ogPath)).toBe(true);

      const heroBuf = readFileSync(heroPath);
      const ogBuf = readFileSync(ogPath);

      expect(ogBuf.length).toBe(heroBuf.length);
      expect(ogBuf.equals(heroBuf)).toBe(true);
    });

    it("vite.config.ts excludes og.png and sw.js from service worker precache manifest", () => {
      const viteConfigSrc = readFileSync(resolve(__dirname, "../vite.config.ts"), "utf-8");
      // Assert the filter logic excludes both sw.js and og.png
      expect(viteConfigSrc).toMatch(
        /builtFiles\(outDir\)\.filter\(\s*\(f\)\s*=>\s*f\s*!==\s*"sw\.js"\s*&&\s*f\s*!==\s*"og\.png"\s*\)/
      );

      const swDistPath = resolve(__dirname, "../dist/sw.js");
      if (existsSync(swDistPath)) {
        const swDist = readFileSync(swDistPath, "utf-8");
        expect(swDist).not.toContain('"./og.png"');
        expect(swDist).not.toContain('"./sw.js"');
        expect(swDist).toContain('"./index.html"');
      }
    });
  });

  describe("3. UTF-8 BOM handling in CSV parsing and scrubbing", () => {
    it("scrub removes XML illegal characters including U+FEFF BOM", () => {
      const input = "col\uFEFFname\u0000with\u0008ctrl";
      expect(scrub(input)).toBe("colnamewithctrl");
    });

    it("parseCsv strips leading UTF-8 BOM from header row so column names and date axes work correctly", () => {
      const bomCsv = "\uFEFFyear,sales\n2020,10\n2021,20";
      const parsed = parseCsv(bomCsv);

      expect(parsed.columns[0].name).toBe("year");
      expect(parsed.columns[0].type).toBe("date");

      const detection = detectChart(parsed);
      expect(detection.type).toBe("line");
      expect(detection.yearAxis).toBe(true);
      expect(detection.timeAxis).toBe(true);
    });

    it("scrub removes embedded U+FEFF within data cells during parseCsv", () => {
      const cellBomCsv = "category,count\n\uFEFFApples,10\nOr\uFEFFanges,20";
      const parsed = parseCsv(cellBomCsv);

      expect(parsed.columns[0].raw[0]).toBe("Apples");
      expect(parsed.columns[0].raw[1]).toBe("Oranges");
    });
  });

  describe("4. buildConfig default dimensions defense", () => {
    it("handles omitted width and height without producing NaN in scale or font sizes", () => {
      const csv = "Year,Revenue\n2020,100\n2021,150";
      const parsed = parseCsv(csv);
      const detection = detectChart(parsed);

      // Call buildConfig with minimal / partial BuildOpts omitting width and height
      const config = buildConfig(parsed, detection, { title: "Defense Test" });

      expect(config).toBeDefined();
      expect(config.options).toBeDefined();

      const options = config.options as any;
      const titleFont = options.plugins?.title?.font?.size;
      expect(typeof titleFont).toBe("number");
      expect(Number.isFinite(titleFont)).toBe(true);
      expect(titleFont).toBeGreaterThan(0);

      const xTickFont = options.scales?.x?.ticks?.font?.size;
      expect(typeof xTickFont).toBe("number");
      expect(Number.isFinite(xTickFont)).toBe(true);
      expect(xTickFont).toBeGreaterThan(0);

      const yTickFont = options.scales?.y?.ticks?.font?.size;
      expect(typeof yTickFont).toBe("number");
      expect(Number.isFinite(yTickFont)).toBe(true);
      expect(yTickFont).toBeGreaterThan(0);

      // Verify no NaN values leaked into stringified config options
      const json = JSON.stringify(config.options);
      expect(json).not.toContain("NaN");
      expect(json).not.toContain("null");
    });
  });

  describe("5. Paste textarea keyboard submission & empty-paste feedback", () => {
    it("shows helpful error status when submitting empty paste area and responds to Ctrl+Enter / Cmd+Enter", async () => {
      vi.resetModules();
      const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
      document.documentElement.innerHTML = html;
      await import("../src/main");

      const pasteArea = document.getElementById("paste-area") as HTMLTextAreaElement;
      const pasteRender = document.getElementById("paste-render") as HTMLButtonElement;
      const statusEl = document.getElementById("status") as HTMLElement;
      const resultEl = document.getElementById("result") as HTMLElement;

      expect(pasteArea).not.toBeNull();
      expect(pasteRender).not.toBeNull();
      expect(statusEl).not.toBeNull();

      // 1. Click render with empty textarea -> shows error message
      pasteArea.value = "";
      pasteRender.click();
      expect(statusEl.textContent).toBe("Please paste or enter CSV text first.");
      expect(statusEl.className).toBe("status error");

      // 2. Click render with whitespace-only textarea -> shows error message
      pasteArea.value = "   \n\t  ";
      pasteRender.click();
      expect(statusEl.textContent).toBe("Please paste or enter CSV text first.");
      expect(statusEl.className).toBe("status error");

      // 3. Ctrl+Enter keydown in pasteArea triggers pasteRender click
      pasteArea.value = "Fruit,Votes\nApples,30\nBananas,45";
      const ctrlEnterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      pasteArea.dispatchEvent(ctrlEnterEvent);

      expect(ctrlEnterEvent.defaultPrevented).toBe(true);
      expect(resultEl.hidden).toBe(false);
      expect(statusEl.textContent).toContain("Rendered bar chart");

      // 4. Meta+Enter (Cmd+Enter on Mac) keydown in pasteArea also triggers pasteRender click
      pasteArea.value = "Month,Sales\nJan,100\nFeb,150";
      const metaEnterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      pasteArea.dispatchEvent(metaEnterEvent);

      expect(metaEnterEvent.defaultPrevented).toBe(true);
      expect(resultEl.hidden).toBe(false);

      // 5. Plain Enter keydown does not trigger render or prevent default
      const plainEnterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      pasteArea.dispatchEvent(plainEnterEvent);
      expect(plainEnterEvent.defaultPrevented).toBe(false);
    });
  });
});
