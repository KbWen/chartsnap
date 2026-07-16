// v1.5.1: every series colour clears WCAG 1.4.11's 3:1 against the export background.
//
// Asserted over PALETTE itself rather than over a list of hexes copied out of it, so a colour
// added later cannot land below the floor unnoticed. The ochre shipped at 2.903:1 from v1 until
// 2026-07-16 — a graphical object below the contrast floor, in the artifact the whole tool
// exists to produce, and nothing in the suite could see it.
import { describe, expect, it } from "vitest";
import { EXPORT_BG, PALETTE } from "../src/chart";

/** WCAG relative luminance — the only normative formula. */
const luminance = (hex: string): number => {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Nudge every channel by ±1: the grid the colour is actually quantised onto. */
const neighbourhood = (hex: string): string[] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out: string[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dg = -1; dg <= 1; dg++)
      for (let db = -1; db <= 1; db++)
        out.push(
          "#" +
            [r + dr, g + dg, b + db]
              .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
              .join("")
        );
  return out;
};

describe("every series colour is a legal graphical object", () => {
  it.each(PALETTE)("%s clears 3:1 against the export background", (hex) => {
    expect(contrast(hex, EXPORT_BG)).toBeGreaterThanOrEqual(3);
  });

  it("the ochre clears it with room for a rounding step, not by 0.7%", () => {
    // #cb8335 and #cc8333 are both nominally legal and both fail here: a single 8-bit step
    // drops them under 3:1. A margin thinner than the quantisation grid is not a margin.
    const ochre = PALETTE[1];
    const worst = Math.min(...neighbourhood(ochre).map((h) => contrast(h, EXPORT_BG)));
    expect(worst, `${ochre} at its worst ±1 neighbour`).toBeGreaterThanOrEqual(3);
  });

  it("the signature has not moved", () => {
    // The one colour that is also --accent in the UI. If a palette change touches this, it is
    // no longer a contrast fix.
    expect(PALETTE[0]).toBe("#155e4c");
  });
});
