// @vitest-environment jsdom
//
// "The same CSV always produces the same chart" is a third of the stated wedge. PNG was
// already byte-identical; SVG was not, because canvas2svg names each clipPath with a fresh
// random string. This is the tripwire for that.
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { PRESETS, renderSvgString } from "../src/export";

describe("SVG export is byte-reproducible", () => {
  const CSVS = {
    line: "month,rev\n2025-01-01,10\n2025-02-01,20\n2025-03-01,15",
    bar: "fruit,votes\nApples,30\nPears,45\nCherries,18",
    scatter: "h,w\n158,52\n167,61\n175,70",
  };

  for (const [name, csv] of Object.entries(CSVS)) {
    it(`${name}: the same CSV twice produces identical bytes`, () => {
      const p = parseCsv(csv);
      const d = detectChart(p);
      const a = renderSvgString(p, d, name, PRESETS[0]);
      const b = renderSvgString(p, d, name, PRESETS[0]);
      expect(a).toBe(b);
      // and the clipPath ids really were the churning part
      expect(a).toMatch(/<clipPath id="cs0"/);
      expect(a).toMatch(/url\(#cs0\)/);
    });
  }

  it("keeps every clip reference pointing at a clipPath that exists", () => {
    const p = parseCsv(CSVS.line);
    const svg = renderSvgString(p, detectChart(p), "line", PRESETS[0]);
    const defined = new Set([...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]));
    const used = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(defined.has(id)).toBe(true);
  });
});
