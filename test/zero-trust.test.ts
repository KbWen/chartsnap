// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildConfig } from "../src/chart";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";
import { DEFAULT_THEME_ID, getTheme, registerTheme, THEMES } from "../src/themes";
import type { ChartTheme } from "../src/types";
import {
  ciede2000,
  contrast,
  hexToRgb,
  rgbToLab,
  simulateCVD,
} from "./palette.test";

const normalizeRoot = (svg: string): string =>
  svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );

/**
 * Machado 2009 Tritanopia simulation matrix (severity 1.0 in linear sRGB).
 */
const TRITANOPIA_1_0 = [
  [1.012702, -0.014283, 0.001581],
  [-0.012438, 0.985957, 0.026481],
  [0.213303, 0.559286, 0.227411],
];

describe("Zero-Trust Security & Adversarial Attack Defense", () => {
  describe("Prototype Pollution Defense", () => {
    it("getTheme refuses inherited Object prototype properties and returns default theme", () => {
      const inheritedKeys = ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"];
      for (const key of inheritedKeys) {
        const theme = getTheme(key);
        expect(theme.id).toBe(DEFAULT_THEME_ID);
        expect(theme.bg).toBe(THEMES[DEFAULT_THEME_ID].bg);
      }
    });

    it("registerTheme rejects prototype pollution payloads without polluting Object.prototype", () => {
      const attackTheme: ChartTheme = {
        id: "__proto__",
        name: "Exploit",
        bg: "#000000",
        ink: "#ffffff",
        muted: "#888888",
        grid: "#cccccc",
        palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
      };

      const result = registerTheme(attackTheme);
      expect(result).toBe(false);
      // Ensure Object prototype was NOT polluted
      expect(({} as Record<string, unknown>).bg).toBeUndefined();
      expect(({} as Record<string, unknown>).palette).toBeUndefined();
    });

    it("registerTheme rejects 'constructor' and 'prototype' IDs", () => {
      const validColorsTheme = {
        name: "Fake",
        bg: "#000000",
        ink: "#ffffff",
        muted: "#888888",
        grid: "#cccccc",
        palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
      };

      expect(registerTheme({ id: "constructor", ...validColorsTheme })).toBe(false);
      expect(registerTheme({ id: "prototype", ...validColorsTheme })).toBe(false);
    });
  });

  describe("XSS and Injection Defense in Custom Themes", () => {
    it("registerTheme rejects malicious HTML/script injections in color fields", () => {
      const base = {
        id: "xss-test",
        name: "XSS Test",
        bg: "#ffffff",
        ink: "#000000",
        muted: "#666666",
        grid: "#dddddd",
        palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
      };

      expect(registerTheme({ ...base, bg: '"><script>alert(1)</script>' })).toBe(false);
      expect(registerTheme({ ...base, ink: "javascript:void(0)" })).toBe(false);
      expect(registerTheme({ ...base, palette: ["#111111", '"><img src=x onerror=alert(1)>'] })).toBe(false);
    });

    it("renderSvgString sanitizes any rogue quote or angle-bracket characters in theme.bg", () => {
      const rogueTheme: ChartTheme = {
        id: "rogue",
        name: "Rogue",
        bg: '#fffdf8" onload="alert(1)',
        ink: "#1c1a15",
        muted: "#6f6a5f",
        grid: "#ece6d9",
        palette: ["#155e4c", "#ca8233", "#2f4161", "#5885e7", "#7b0900", "#b76385"],
      };

      const sample = parseCsv("cat,val\nA,10\nB,20");
      const det = detectChart(sample);
      const svg = renderSvgString(sample, det, "Safe", PRESETS[0], rogueTheme);

      // Quotes must be stripped from fill attribute
      expect(svg).not.toContain('fill="#fffdf8" onload');
      const doc = new DOMParser().parseFromString(normalizeRoot(svg), "image/svg+xml");
      expect(doc.querySelector("parsererror")).toBeNull();
    });
  });

  describe("Negative Controls: Ensuring the Test Oracles Actually Catch Defects", () => {
    it("negative control: Machado 2009 CVD oracle detects and fails on known protanopia collision", () => {
      // Old v1.5 series 3 and 5: #6b7f92 and #8a8199
      const rgb1 = hexToRgb("#6b7f92");
      const rgb2 = hexToRgb("#8a8199");
      const p1 = simulateCVD(rgb1, [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
      ]);
      const p2 = simulateCVD(rgb2, [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
      ]);
      const dE = ciede2000(rgbToLab(p1), rgbToLab(p2));

      // The old palette failed the >= 15.0 threshold (dE was ~2.24)
      expect(dE).toBeLessThan(15.0);
      expect(dE).toBeLessThan(5.0);
    });

    it("negative control: WCAG graphical contrast oracle detects and fails on old ochre", () => {
      // Old ochre #cf8636 on warm paper #fffdf8 measured 2.903:1
      const c = contrast("#cf8636", "#fffdf8");
      expect(c).toBeLessThan(3.0);
    });

    it("negative control: DOMParser XML well-formedness catches unclosed XML tag", () => {
      const brokenXml = '<svg viewBox="0 0 100 100"><rect fill="#fff"></svg>';
      const doc = new DOMParser().parseFromString(brokenXml, "image/svg+xml");
      expect(doc.querySelector("parsererror")).not.toBeNull();
    });
  });

  describe("Tritanopia (Blue-Blindness) Verification across all Themes", () => {
    const allThemes = Object.values(THEMES);

    it.each(allThemes)("Theme $name ($id) series pairs maintain min CVD ΔE00 under Tritanopia", (theme) => {
      let minTri = 999;
      let worstPair = "";
      for (let i = 0; i < theme.palette.length; i++) {
        for (let j = i + 1; j < theme.palette.length; j++) {
          const rgb1 = hexToRgb(theme.palette[i]);
          const rgb2 = hexToRgb(theme.palette[j]);
          const t1 = simulateCVD(rgb1, TRITANOPIA_1_0);
          const t2 = simulateCVD(rgb2, TRITANOPIA_1_0);
          const dE = ciede2000(rgbToLab(t1), rgbToLab(t2));
          if (dE < minTri) {
            minTri = dE;
            worstPair = `${theme.palette[i]} & ${theme.palette[j]}`;
          }
        }
      }
      // Tritanopia difference is well above JND (>= 9.0, ~4x JND of 2.3)
      expect(minTri, `Tritanopia worst pair for ${theme.id}: ${worstPair}`).toBeGreaterThanOrEqual(9.0);
    });
  });

  describe("Immutability & Side-Effect Freedom", () => {
    it("rendering charts across different themes does not mutate the ParsedCsv or Detection objects", () => {
      const sample = parseCsv("col_a,col_b\n2025-01-01,100\n2025-02-01,200");
      const detection = detectChart(sample);

      // Deep snapshot before rendering
      const sampleBefore = JSON.stringify(sample);
      const detectionBefore = JSON.stringify(detection);

      // Freeze top-level objects to prove no mutations occur
      Object.freeze(sample);
      Object.freeze(detection);
      Object.freeze(sample.columns);

      for (const theme of Object.values(THEMES)) {
        buildConfig(sample, detection, {
          title: "Frozen Test",
          width: 800,
          height: 600,
          theme,
        });
        renderSvgString(sample, detection, "Frozen Test", PRESETS[0], theme);
      }

      expect(JSON.stringify(sample)).toBe(sampleBefore);
      expect(JSON.stringify(detection)).toBe(detectionBefore);
    });
  });
});
