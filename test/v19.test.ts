// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConfig } from "../src/chart";
import { parseCsv } from "../src/csv";
import { detectChart, MAX_SERIES } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";
import { DEFAULT_THEME_ID, getTheme, listThemes, THEMES } from "../src/themes";
import type { ChartTheme } from "../src/types";
import {
  ciede2000,
  contrast,
  DEUTERANOPIA_1_0,
  hexToRgb,
  neighbourhood,
  PROTANOPIA_1_0,
  rgbToLab,
  simulateCVD,
} from "./palette.test";

const indexHtml = readFileSync(resolve(__dirname, "../index.html"), "utf-8");

describe("v1.9: Curated, Context-Grounded Business Palettes & Mathematical CVD Safety", () => {
  const themes = listThemes();

  it("registers at least the three core business themes", () => {
    const ids = themes.map((t) => t.id);
    expect(ids).toContain("editorial");
    expect(ids).toContain("corporate");
    expect(ids).toContain("nordic");
    expect(DEFAULT_THEME_ID).toBe("editorial");
  });

  describe.each(themes)("Theme: $name ($id)", (theme) => {
    it("palette length matches MAX_SERIES exactly", () => {
      expect(theme.palette.length).toBe(MAX_SERIES);
    });

    it("every series color clears WCAG graphical contrast >= 3:1 against theme.bg", () => {
      for (const hex of theme.palette) {
        const c = contrast(hex, theme.bg);
        expect(c, `${hex} on ${theme.bg}`).toBeGreaterThanOrEqual(3.0);
      }
    });

    it("every series color clears 3:1 across its ±1 rounding neighbourhood", () => {
      for (const hex of theme.palette) {
        const worst = Math.min(...neighbourhood(hex).map((h) => contrast(h, theme.bg)));
        expect(worst, `${hex} at its worst ±1 neighbour on ${theme.bg}`).toBeGreaterThanOrEqual(3.0);
      }
    });

    it("ink text clears WCAG AAA (>= 7:1) on theme.bg", () => {
      expect(contrast(theme.ink, theme.bg)).toBeGreaterThanOrEqual(7.0);
    });

    it("muted text clears WCAG AA (>= 4.5:1) on theme.bg", () => {
      expect(contrast(theme.muted, theme.bg)).toBeGreaterThanOrEqual(4.5);
    });

    it("min pairwise ΔE00 under protanopia is at least 15.0", () => {
      let minProt = 999;
      let worstPair = "";
      for (let i = 0; i < theme.palette.length; i++) {
        for (let j = i + 1; j < theme.palette.length; j++) {
          const rgb1 = hexToRgb(theme.palette[i]);
          const rgb2 = hexToRgb(theme.palette[j]);
          const p1 = simulateCVD(rgb1, PROTANOPIA_1_0);
          const p2 = simulateCVD(rgb2, PROTANOPIA_1_0);
          const dE = ciede2000(rgbToLab(p1), rgbToLab(p2));
          if (dE < minProt) {
            minProt = dE;
            worstPair = `${theme.palette[i]} & ${theme.palette[j]}`;
          }
        }
      }
      expect(minProt, `Theme ${theme.id} Protanopia worst pair: ${worstPair}`).toBeGreaterThanOrEqual(15.0);
    });

    it("min pairwise ΔE00 under deuteranopia is at least 15.0", () => {
      let minDeut = 999;
      let worstPair = "";
      for (let i = 0; i < theme.palette.length; i++) {
        for (let j = i + 1; j < theme.palette.length; j++) {
          const rgb1 = hexToRgb(theme.palette[i]);
          const rgb2 = hexToRgb(theme.palette[j]);
          const d1 = simulateCVD(rgb1, DEUTERANOPIA_1_0);
          const d2 = simulateCVD(rgb2, DEUTERANOPIA_1_0);
          const dE = ciede2000(rgbToLab(d1), rgbToLab(d2));
          if (dE < minDeut) {
            minDeut = dE;
            worstPair = `${theme.palette[i]} & ${theme.palette[j]}`;
          }
        }
      }
      expect(minDeut, `Theme ${theme.id} Deuteranopia worst pair: ${worstPair}`).toBeGreaterThanOrEqual(15.0);
    });
  });
});

const normalizeRoot = (svg: string): string =>
  svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );

describe("v1.9: Responsive SVG viewBox Declaration", () => {
  const sample = parseCsv("month,rev\n2025-01-01,10\n2025-02-01,25\n2025-03-01,18");
  const detection = detectChart(sample);

  it.each(PRESETS)("SVG export declares viewBox for preset $id", (preset) => {
    const svg = renderSvgString(sample, detection, "Revenue", preset);
    expect(svg).toContain(`viewBox="0 0 ${preset.width} ${preset.height}"`);
    const doc = new DOMParser().parseFromString(normalizeRoot(svg), "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const root = doc.documentElement;
    expect(root.getAttribute("viewBox")).toBe(`0 0 ${preset.width} ${preset.height}`);
  });
});

describe("v1.9: Theme Synchronization Across Export Formats", () => {
  const sample = parseCsv("team,score\nAlpha,85\nBeta,92\nGamma,78");
  const detection = detectChart(sample);

  it("corporate theme renders pure white bg rect and slate lead color", () => {
    const corp = THEMES.corporate;
    const svg = renderSvgString(sample, detection, "Scores", PRESETS[0], corp);
    expect(svg).toContain(`fill="${corp.bg}"`);
    expect(svg).toContain(corp.palette[0]); // #0f4c81
  });

  it("nordic theme renders zinc bg rect and pitch charcoal lead color", () => {
    const nordic = THEMES.nordic;
    const svg = renderSvgString(sample, detection, "Scores", PRESETS[0], nordic);
    expect(svg).toContain(`fill="${nordic.bg}"`);
    expect(svg).toContain(nordic.palette[0]); // #18181b
  });

  it("buildConfig honors theme parameter", () => {
    const corp = THEMES.corporate;
    const config = buildConfig(sample, detection, {
      title: "Test",
      width: 800,
      height: 600,
      theme: corp,
    });
    // Bar dataset backgroundColor should be corporate palette[0]
    const ds = config.data.datasets[0];
    expect(ds.backgroundColor).toBe(corp.palette[0]);
  });
});

describe("v1.9: Browser Auto-Inversion Shield & Restrained Theme Selector", () => {
  it("index.html specifies color-scheme light to shield against dark-mode inversion", () => {
    expect(indexHtml).toMatch(/<meta\s+name=["']color-scheme["']\s+content=["']light["']/i);
  });

  it("index.html has #theme-toggle group with buttons for all core themes", () => {
    expect(indexHtml).toContain('id="theme-toggle"');
    expect(indexHtml).toContain('data-theme="editorial"');
    expect(indexHtml).toContain('data-theme="corporate"');
    expect(indexHtml).toContain('data-theme="nordic"');
  });
});

describe("v1.9: Theme Extensibility ('不要寫死')", () => {
  it("getTheme falls back to default theme for unknown id", () => {
    expect(getTheme("unknown-theme-xyz").id).toBe(DEFAULT_THEME_ID);
    expect(getTheme().id).toBe(DEFAULT_THEME_ID);
  });

  it("custom theme object renders completely without modifying core logic", () => {
    const customTheme: ChartTheme = {
      id: "custom-brand",
      name: "Custom Brand",
      bg: "#fefcf6",
      ink: "#111827",
      muted: "#4b5563",
      grid: "#e5e7eb",
      palette: ["#1e3a8a", "#047857", "#b45309", "#4338ca", "#991b1b", "#0f766e"],
    };

    const sample = parseCsv("cat,val\nA,10\nB,20");
    const det = detectChart(sample);
    const svg = renderSvgString(sample, det, "Custom", PRESETS[0], customTheme);

    expect(svg).toContain(`fill="${customTheme.bg}"`);
    expect(svg).toContain(customTheme.palette[0]);
  });
});
