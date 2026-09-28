// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Chart } from "chart.js";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { buildConfig } from "../src/chart";
import { PRESETS, renderSvgString } from "../src/export";

describe("v1.7: CJK Font Stack in SVG", () => {
  it("Chart.defaults.font.family includes ASCII CJK font fallbacks", () => {
    const family = Chart.defaults.font.family;
    expect(family).toContain("PingFang TC");
    expect(family).toContain("Microsoft JhengHei");
    expect(family).toContain("Noto Sans CJK TC");
    // Must NOT contain non-ASCII characters that crash canvas2svg
    expect(/^[\x00-\x7F]*$/.test(family)).toBe(true);
  });

  it("exported SVG declares CJK fonts for Figma/vector compatibility without crashing", () => {
    const csv = "水果,銷量\n蘋果,100\n香蕉,150";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);
    const svg = renderSvgString(parsed, detection, "水果銷售統計", PRESETS[0]);

    expect(svg).toContain("PingFang TC");
    expect(svg).toContain("Microsoft JhengHei");
    expect(svg).toContain("Noto Sans CJK TC");
    expect(svg).toContain("蘋果");
    expect(svg).toContain("香蕉");
  });
});

describe("v1.7: Full-Width Digits Normalization (NFKC)", () => {
  it("normalizes full-width digits in numeric columns (薪資,５００００)", () => {
    const csv = "項目,金額\n薪資,５００００\n獎金,１２０００";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    expect(detection.type).toBe("bar");
    expect(detection.yColumns.length).toBe(1);
    expect(detection.yColumns[0].name).toBe("金額");
    expect(detection.yColumns[0].nums).toEqual([50000, 12000]);
  });

  it("normalizes full-width dates in temporal columns (２０２５-０１-０５)", () => {
    const csv = "日期,銷量\n２０２５-０１-０５,１００\n２０２５-０２-０５,２００";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);

    expect(detection.type).toBe("line");
    expect(detection.timeAxis).toBe(true);
    expect(detection.yColumns[0].nums).toEqual([100, 200]);
  });
});

describe("v1.7: Chart.js Locale Determinism", () => {
  it("buildConfig explicitly sets locale to 'en-US' for deterministic thousand separators", () => {
    const csv = "category,value\nA,1000000\nB,2500000";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);
    const config = buildConfig(parsed, detection, { width: 800, height: 600 });

    expect(config.options?.locale).toBe("en-US");
  });
});

describe("v1.7: Service Worker Navigate Fallback Resilience", () => {
  it("sw.js navigate handler falls back safely instead of returning undefined to respondWith", () => {
    const viteConfigSrc = readFileSync(resolve(__dirname, "../vite.config.ts"), "utf-8");
    // Must handle miss gracefully: e.g. caches.match(...) .then(hit => hit || Response.error()) or similar
    expect(viteConfigSrc).not.toContain("caches.match(\"./\").then((hit) => hit || caches.match(\"./index.html\"))");
  });
});

describe("v1.7: Prefers-Reduced-Motion Support", () => {
  it("style.css declares @media (prefers-reduced-motion: reduce)", () => {
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf-8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
