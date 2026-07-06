// @vitest-environment jsdom
//
// The canary for the fragile part of the app: SVG export runs Chart.js through
// canvas2svg (unmaintained) with several runtime shims. If a Chart.js bump or a
// canvas2svg quirk breaks it, this fails instead of shipping blank SVGs to users.
// Runs under jsdom + node-canvas (canvas2svg needs a real 2D context to measure text).
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";

const CASES: Record<string, string> = {
  line: "month,rev\n2025-01-01,10\n2025-02-01,20\n2025-03-01,15\n2025-04-01,25",
  bar: "fruit,votes\nApples,30\nPears,45\nCherries,18\nBananas,52",
  scatter: "h,w\n158,52\n167,61\n175,70\n185,83",
};

describe("SVG export produces real, non-empty vector output", () => {
  for (const [name, csv] of Object.entries(CASES)) {
    it(`${name} chart → valid SVG with geometry`, () => {
      const parsed = parseCsv(csv);
      const detection = detectChart(parsed);
      const svg = renderSvgString(parsed, detection, name, PRESETS[0]);

      expect(svg).toContain("<svg");
      expect(svg).toMatch(/<path\b/); // actual drawn geometry, not just a frame
      expect(svg).toContain("#fffdf8"); // warm background rect was injected
      expect(svg.length).toBeGreaterThan(2000);
    });
  }

  it("a forced categorical line (override) renders real geometry", () => {
    const parsed = parseCsv(CASES.bar); // category data, auto-detected as bar
    const detection = detectChart(parsed, "line"); // force line via the escape hatch
    const svg = renderSvgString(parsed, detection, "line", PRESETS[0]);
    expect(svg).toMatch(/<path\b/);
    expect(svg).toContain("#155e4c");
  });

  it("bar chart renders rounded corners as arc paths (not squared-off)", () => {
    const parsed = parseCsv(CASES.bar);
    const detection = detectChart(parsed);
    const svg = renderSvgString(parsed, detection, "bar", PRESETS[0]);
    // Rounded bar tops are drawn via ctx.arc() → SVG elliptical-arc "A" commands.
    const barPath = [...svg.matchAll(/<path\b[^>]*>/g)]
      .map((m) => m[0])
      .find((p) => p.toLowerCase().includes("#155e4c"));
    expect(barPath).toBeTruthy();
    expect(barPath).toMatch(/\bd="[^"]*[Aa]/);
  });
});
