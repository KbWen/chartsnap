// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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
  it("renders US-formatted thousands-separator ticks (1,000,000) in exported SVG <text> nodes", () => {
    const csv = "category,value\nA,1000000\nB,2500000";
    const parsed = parseCsv(csv);
    const detection = detectChart(parsed);
    const config = buildConfig(parsed, detection, { width: 800, height: 600 });

    expect(config.options?.locale).toBe("en-US");

    const svg = renderSvgString(parsed, detection, "Revenue", PRESETS[0]);
    const normalizeRoot = svg.replace(
      /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
      "$1$2$3$4"
    );
    const doc = new DOMParser().parseFromString(normalizeRoot, "image/svg+xml");
    const texts = [...doc.querySelectorAll("text")].map((el) => el.textContent?.trim() ?? "");
    expect(texts.some((t) => /^\d{1,3}(?:,\d{3}){2}$/.test(t))).toBe(true);
    expect(texts).toContain("1,000,000");
  });
});

describe("v1.7: Service Worker Navigate & Asset Fallback Resilience", () => {
  it("executes generated SW fetch handler and resolves 503 Response on offline cache misses", async () => {
    const viteConfigSrc = readFileSync(resolve(__dirname, "../vite.config.ts"), "utf-8");
    const match = /function serviceWorkerSource[\s\S]*?return `([\s\S]*?)`;\s*\}/.exec(viteConfigSrc);
    expect(match).not.toBeNull();
    const swScript = match![1]
      .replace("${version}", "testver")
      .replace("${JSON.stringify(urls, null, 2)}", '["./", "./index.html"]');

    const listeners: Record<string, (event: any) => void> = {};
    const mockSelf = {
      location: { origin: "https://example.com" },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
      addEventListener: (type: string, cb: (event: any) => void) => {
        listeners[type] = cb;
      },
    };
    const mockCaches = {
      open: async () => ({ addAll: async () => undefined }),
      keys: async () => [],
      delete: async () => true,
      match: vi.fn(async () => undefined),
    };
    const mockFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    new Function("self", "caches", "fetch", "Response", "URL", swScript)(
      mockSelf,
      mockCaches,
      mockFetch,
      Response,
      URL
    );

    expect(typeof listeners.fetch).toBe("function");

    // 1. Offline navigate miss -> resolves to 503 Response (never undefined)
    let navResult: Promise<Response> | undefined;
    listeners.fetch({
      request: { method: "GET", url: "https://example.com/", mode: "navigate" },
      respondWith: (p: Promise<Response>) => {
        navResult = p;
      },
    });
    const navResp = await navResult;
    expect(navResp).toBeInstanceOf(Response);
    expect(navResp?.status).toBe(503);

    // 2. Offline non-navigate asset miss -> resolves to 503 Response (never rejects unhandled)
    let assetResult: Promise<Response> | undefined;
    listeners.fetch({
      request: { method: "GET", url: "https://example.com/assets/app.js", mode: "cors" },
      respondWith: (p: Promise<Response>) => {
        assetResult = p;
      },
    });
    const assetResp = await assetResult;
    expect(assetResp).toBeInstanceOf(Response);
    expect(assetResp?.status).toBe(503);
  });
});

describe("v1.7: Prefers-Reduced-Motion Support", () => {
  it("style.css declares @media (prefers-reduced-motion: reduce)", () => {
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf-8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
