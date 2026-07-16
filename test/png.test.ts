// @vitest-environment jsdom
//
// The PNG export had no test at all — the SVG path has a smoke test, a reproducibility test
// and a security test, and the raster path, which is the one most people actually download,
// had none. Found while releasing the canvas backing store in exportPng's `finally`: nothing
// in the suite could have told me whether that produced a blank or truncated file.
//
// Asserts the real bytes, not that the call returned: a canvas that has been torn down early
// yields a plausible-looking Blob that decodes to nothing.
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { exportPng, PRESETS } from "../src/export";

const CSV = "fruit,votes\nApples,30\nPears,45\nCherries,18\nBananas,52";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read width/height straight out of the IHDR chunk — the header, not our own bookkeeping. */
function ihdr(bytes: Uint8Array): { magic: boolean; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    magic: PNG_MAGIC.every((b, i) => bytes[i] === b),
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

describe("PNG export", () => {
  for (const preset of PRESETS) {
    it(`${preset.id} → a real PNG at exactly ${preset.width}×${preset.height}`, async () => {
      const parsed = parseCsv(CSV);
      const blob = await exportPng(parsed, detectChart(parsed), "votes", preset);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const head = ihdr(bytes);

      expect(head.magic).toBe(true);
      expect(head.width).toBe(preset.width);
      expect(head.height).toBe(preset.height);
      // A blank canvas of this size still compresses to a few KB, so this only catches an
      // empty file; the dimension check above is what proves the render happened at size.
      expect(bytes.byteLength).toBeGreaterThan(1000);
    });
  }

  it("survives repeated exports — the backing store is released, not the blob", async () => {
    // exportPng zeroes canvas.width/height in its `finally` to free ~34.8 MB at the A4
    // preset instead of waiting for GC. If that ran too early it would hand back a Blob of
    // a 0×0 canvas, so run the sequence a phone would actually kill the tab on.
    const parsed = parseCsv(CSV);
    const detection = detectChart(parsed);
    for (let i = 0; i < 3; i++) {
      const blob = await exportPng(parsed, detection, "votes", PRESETS[PRESETS.length - 1]);
      const head = ihdr(new Uint8Array(await blob.arrayBuffer()));
      expect(head.width, `export ${i + 1}`).toBe(3508);
      expect(head.height, `export ${i + 1}`).toBe(2480);
    }
  });
});
