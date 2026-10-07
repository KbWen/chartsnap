// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { exportPng, PRESETS, renderSvgString } from "../src/export";
import { listThemes } from "../src/themes";
import sampleLine from "../samples/monthly-sales.csv?raw";
import sampleBar from "../samples/fruit-votes.csv?raw";
import sampleScatter from "../samples/height-weight.csv?raw";

const SAMPLES = [
  { name: "Monthly Sales (Line)", csv: sampleLine, expectedType: "line" },
  { name: "Fruit Votes (Bar)", csv: sampleBar, expectedType: "bar" },
  { name: "Height/Weight (Scatter)", csv: sampleScatter, expectedType: "scatter" },
];

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const normalizeRoot = (svg: string): string =>
  svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );

describe("Comprehensive E2E Artifact Audit across all Themes, Samples, and Presets", () => {
  const themes = listThemes();

  for (const sample of SAMPLES) {
    describe(`Sample: ${sample.name}`, () => {
      const parsed = parseCsv(sample.csv);
      const detection = detectChart(parsed);

      it(`correctly auto-detects as ${sample.expectedType}`, () => {
        expect(detection.type).toBe(sample.expectedType);
      });

      for (const theme of themes) {
        describe(`Theme: ${theme.name} (${theme.id})`, () => {
          for (const preset of PRESETS) {
            it(`produces valid responsive SVG at ${preset.id} (${preset.width}x${preset.height})`, () => {
              const svg = renderSvgString(parsed, detection, sample.name, preset, theme);

              // 1. Must declare responsive viewBox matching preset dimensions
              expect(svg).toContain(`viewBox="0 0 ${preset.width} ${preset.height}"`);

              // 2. Must parse as valid XML (no parsererror)
              const doc = new DOMParser().parseFromString(normalizeRoot(svg), "image/svg+xml");
              expect(doc.querySelector("parsererror")).toBeNull();
              const root = doc.documentElement;
              expect(root.getAttribute("viewBox")).toBe(`0 0 ${preset.width} ${preset.height}`);

              // 3. Must inject opaque background rect matching theme.bg
              expect(svg).toContain(`<rect x="0" y="0" width="${preset.width}" height="${preset.height}" fill="${theme.bg}"/>`);

              // 4. Must contain drawn geometry
              expect(svg).toMatch(/<path\b/);

              // 5. Must contain the theme's lead color
              expect(svg.toLowerCase()).toContain(theme.palette[0].toLowerCase());
            });

            it(`produces real, non-empty PNG at ${preset.id}`, async () => {
              const blob = await exportPng(parsed, detection, sample.name, preset, theme);

              expect(blob.type).toBe("image/png");
              expect(blob.size).toBeGreaterThan(1000);

              const buffer = new Uint8Array(await blob.arrayBuffer());
              // Assert PNG magic header bytes
              for (let i = 0; i < PNG_MAGIC.length; i++) {
                expect(buffer[i]).toBe(PNG_MAGIC[i]);
              }
            });
          }
        });
      }
    });
  }
});
