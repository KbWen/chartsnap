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

/**
 * jsdom's XMLSerializer emits `xmlns:xlink` twice on the root — a well-formedness error with
 * nothing to do with the chart. Verified 2026-07-10 against a real browser that the raw SVG
 * parses clean (see DECISIONS), so collapse the duplicate rather than chase a phantom.
 */
const normalizeRoot = (svg: string): string =>
  svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );

/**
 * The exported SVG is a file users reopen — it has to be well-formed XML, not merely contain
 * the string "<svg". Note DOMParser does NOT throw on malformed input: it returns a document
 * whose root is `<parsererror>`. So the assertion has to be on the result; a test that merely
 * *calls* parseFromString is green no matter how broken the output is.
 */
const parseErrorIn = (svg: string): string | null => {
  const doc = new DOMParser().parseFromString(normalizeRoot(svg), "image/svg+xml");
  return doc.querySelector("parsererror")?.textContent ?? null;
};

describe("SVG export produces real, non-empty vector output", () => {
  for (const [name, csv] of Object.entries(CASES)) {
    it(`${name} chart → valid SVG with geometry`, () => {
      const parsed = parseCsv(csv);
      const detection = detectChart(parsed);
      const svg = renderSvgString(parsed, detection, name, PRESETS[0]);

      expect(parseErrorIn(svg)).toBeNull(); // well-formed XML, not just "contains <svg"
      expect(svg).toMatch(/<path\b/); // actual drawn geometry, not just a frame
      expect(svg).toContain("#fffdf8"); // warm background rect was injected
      expect(svg.length).toBeGreaterThan(2000);
    });
  }

  it("the well-formedness check can actually fail", () => {
    // The tripwire has to be able to go red, or it is decoration. A raw & is illegal in XML.
    const broken = '<svg xmlns="http://www.w3.org/2000/svg"><text>a & b</text></svg>';
    expect(broken).toContain("<svg"); // what this suite used to assert: green on broken output
    expect(parseErrorIn(broken)).not.toBeNull(); // what it asserts now: red
  });

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
