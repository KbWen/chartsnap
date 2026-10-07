// v1.5.1: every series colour clears WCAG 1.4.11's 3:1 against the export background.
//
// Asserted over PALETTE itself rather than over a list of hexes copied out of it, so a colour
// added later cannot land below the floor unnoticed. The ochre shipped at 2.903:1 from v1 until
// 2026-07-16 — a graphical object below the contrast floor, in the artifact the whole tool
// exists to produce, and nothing in the suite could see it.
import { describe, expect, it } from "vitest";
import { EXPORT_BG, PALETTE } from "../src/chart";
import { MAX_SERIES } from "../src/detect";

/** WCAG relative luminance — the only normative formula. */
export const luminance = (hex: string): number => {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Nudge every channel by ±1: the grid the colour is actually quantised onto. */
export const neighbourhood = (hex: string): string[] => {
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

  it.each(PALETTE)("%s clears 3:1 across its ±1 rounding neighbourhood", (hex) => {
    const worst = Math.min(...neighbourhood(hex).map((h) => contrast(h, EXPORT_BG)));
    expect(worst, `${hex} at its worst ±1 neighbour`).toBeGreaterThanOrEqual(3);
  });

  it("the signature has not moved", () => {
    // The one colour that is also --accent in the UI. If a palette change touches this, it is
    // no longer a contrast fix.
    expect(PALETTE[0]).toBe("#155e4c");
  });
});

describe("the cap and the palette cannot drift apart", () => {
  it("MAX_SERIES equals PALETTE.length", () => {
    // chart.ts indexes PALETTE[i % PALETTE.length] in three places, which wraps SILENTLY. A cap
    // above the palette draws two series in the same colour — the one failure this tool exists
    // to prevent — and the two numbers live in different files, equal only by coincidence until
    // this line. It costs nothing today and it is the tripwire for whoever forks this and
    // decides eight series sounds reasonable.
    expect(MAX_SERIES).toBe(PALETTE.length);
  });
});

/**
 * Machado 2009 CVD simulation (severity 1.0 in linear sRGB) and CIEDE2000 color difference.
 * Reference: Machado et al., IEEE TVCG 2009.
 */
export const PROTANOPIA_1_0 = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

export const DEUTERANOPIA_1_0 = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.011820, 0.042940, 0.968881],
];

export const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

export const hexToRgb = (hex: string): [number, number, number] => {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
};

export const simulateCVD = (rgb: [number, number, number], matrix: number[][]): [number, number, number] => {
  const lin = rgb.map(srgbToLinear);
  const outLin = [
    matrix[0][0] * lin[0] + matrix[0][1] * lin[1] + matrix[0][2] * lin[2],
    matrix[1][0] * lin[0] + matrix[1][1] * lin[1] + matrix[1][2] * lin[2],
    matrix[2][0] * lin[0] + matrix[2][1] * lin[1] + matrix[2][2] * lin[2],
  ];
  return outLin.map(linearToSrgb) as [number, number, number];
};

export const rgbToLab = (rgb: [number, number, number]): [number, number, number] => {
  const [r, g, b] = rgb.map(srgbToLinear);
  const X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const Y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0;
  const Z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

export const ciede2000 = (lab1: [number, number, number], lab2: [number, number, number]): number => {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h1p = (Math.atan2(b1, a1p) * (180 / Math.PI) + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * (180 / Math.PI) + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
    else dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(((dhp / 2) * Math.PI) / 180);

  const LbarP = (L1 + L2) / 2;
  const CbarP = (C1p + C2p) / 2;

  let hbarP = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarP = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarP = (h1p + h2p + 360) / 2;
    else hbarP = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((hbarP - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * hbarP) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbarP + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hbarP - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-(((hbarP - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(CbarP ** 7 / (CbarP ** 7 + 25 ** 7));
  const RT = -RC * Math.sin(((2 * dTheta) * Math.PI) / 180);

  const SL = 1 + (0.015 * (LbarP - 50) ** 2) / Math.sqrt(20 + (LbarP - 50) ** 2);
  const SC = 1 + 0.045 * CbarP;
  const SH = 1 + 0.015 * CbarP * T;

  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH)
  );
};

describe("every pair is distinguishable to a colourblind reader (CVD)", () => {
  it("min pairwise ΔE00 under protanopia is at least 15", () => {
    let minProt = 999;
    let worstPair = "";
    for (let i = 0; i < PALETTE.length; i++) {
      for (let j = i + 1; j < PALETTE.length; j++) {
        const rgb1 = hexToRgb(PALETTE[i]);
        const rgb2 = hexToRgb(PALETTE[j]);
        const p1 = simulateCVD(rgb1, PROTANOPIA_1_0);
        const p2 = simulateCVD(rgb2, PROTANOPIA_1_0);
        const dE = ciede2000(rgbToLab(p1), rgbToLab(p2));
        if (dE < minProt) {
          minProt = dE;
          worstPair = `${PALETTE[i]} (series ${i + 1}) & ${PALETTE[j]} (series ${j + 1})`;
        }
      }
    }
    expect(minProt, `Protanopia worst pair: ${worstPair}`).toBeGreaterThanOrEqual(15);
  });

  it("min pairwise ΔE00 under deuteranopia is at least 15", () => {
    let minDeut = 999;
    let worstPair = "";
    for (let i = 0; i < PALETTE.length; i++) {
      for (let j = i + 1; j < PALETTE.length; j++) {
        const rgb1 = hexToRgb(PALETTE[i]);
        const rgb2 = hexToRgb(PALETTE[j]);
        const d1 = simulateCVD(rgb1, DEUTERANOPIA_1_0);
        const d2 = simulateCVD(rgb2, DEUTERANOPIA_1_0);
        const dE = ciede2000(rgbToLab(d1), rgbToLab(d2));
        if (dE < minDeut) {
          minDeut = dE;
          worstPair = `${PALETTE[i]} (series ${i + 1}) & ${PALETTE[j]} (series ${j + 1})`;
        }
      }
    }
    expect(minDeut, `Deuteranopia worst pair: ${worstPair}`).toBeGreaterThanOrEqual(15);
  });
});

