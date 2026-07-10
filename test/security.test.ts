// @vitest-environment jsdom
//
// Core Rule 4: never inject unsanitized user input into HTML/DOM. Column names and cell
// values are attacker-controlled if someone is talked into opening a hostile .csv, and
// they end up as the chart title, legend labels, axis titles and tick labels.
//
// The exported SVG is the sharp edge: it is a FILE the user may reopen in a browser, and
// a <script> inside an SVG document DOES execute. canvas2svg builds text via DOM nodes and
// serializes, which escapes — this suite is the tripwire for that ever changing.
//
// The live page is safe by construction (main.ts assigns only .textContent) and is checked
// by hand in the browser; jsdom can't host main.ts without the real index.html.
import { describe, expect, it } from "vitest";
import { parseCsv, scrub } from "../src/csv";
import { detectChart } from "../src/detect";
import { exportSvg, PRESETS, renderSvgString } from "../src/export";
import type { ChartType } from "../src/types";

const CLOSE_TEXT = `</text><script>alert(1)</script>`;
const ATTR_BREAK = `" onload="alert(1)`;
const RTL_OVERRIDE = `${String.fromCharCode(0x202e)}evil rtl`; // bidi override
const NUL = String.fromCharCode(0); // a raw C0 control char
const TITLE = `</title><script>alert(3)</script><svg onload=alert(4)>`;

const field = (s: string) => `"${s.replace(/"/g, '""')}"`;

// Hostile headers (→ legend + axis titles) and hostile cell values (→ tick labels).
const HOSTILE_CSV = [
  ["category", CLOSE_TEXT, ATTR_BREAK].map(field).join(","),
  [`<img src=x onerror=alert(9)>`, "10", "20"].map(field).join(","),
  [`"><script>alert(2)</script>`, "30", "40"].map(field).join(","),
  [`]]>&entity;<!--`, "50", "60"].map(field).join(","),
  [RTL_OVERRIDE, "70", "80"].map(field).join(","),
].join("\n");

/**
 * jsdom's XMLSerializer emits `xmlns:xlink` twice on the root, a well-formedness error
 * unrelated to any payload. Verified 2026-07-10 that a real browser emits it once and the
 * raw SVG parses clean, so collapse the duplicate and let DOMParser see the real structure
 * instead of bailing out with a parsererror stub.
 */
const normalizeRoot = (svg: string): string =>
  svg.replace(
    /(<svg\b)([^>]*?)( xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink")([^>]*?)\3/,
    "$1$2$3$4"
  );

const eventAttrs = (doc: Document): string[] =>
  Array.from(doc.querySelectorAll("*")).flatMap((el) =>
    Array.from(el.attributes)
      .map((a) => a.name)
      .filter((n) => /^on/i.test(n))
  );

const RAW_SCRIPT_TAG = /<script\b/i;
const ON_ATTR_IN_TAG = /<[a-zA-Z][^>]*\son\w+\s*=/i;

function assertInert(svg: string, label: string): void {
  // Parsed the way a browser opens the downloaded file.
  const doc = new DOMParser().parseFromString(normalizeRoot(svg), "image/svg+xml");
  expect(doc.querySelectorAll("parsererror").length, `${label}: parsererror`).toBe(0);
  expect(doc.querySelectorAll("script").length, `${label}: <script> elements`).toBe(0);
  expect(eventAttrs(doc), `${label}: on* attributes`).toEqual([]);
  for (const a of Array.from(doc.querySelectorAll("a"))) {
    const href = a.getAttribute("href") ?? a.getAttribute("xlink:href") ?? "";
    expect(/javascript:/i.test(href), `${label}: javascript: href`).toBe(false);
  }
  // Byte-level, parser-independent. A literal "onload=" may survive as inert character
  // data inside a <text> node, but must never appear inside a real start tag.
  expect(RAW_SCRIPT_TAG.test(svg), `${label}: raw <script`).toBe(false);
  expect(ON_ATTR_IN_TAG.test(svg), `${label}: on* inside a tag`).toBe(false);
  expect((svg.match(/<svg\b/gi) ?? []).length, `${label}: <svg element count`).toBe(1);
}

describe("a hostile CSV cannot put script into the exported SVG", () => {
  for (const forced of [undefined, "line", "bar", "scatter"] as (ChartType | undefined)[]) {
    it(`${forced ?? "auto-detected"} chart stays inert at every preset`, () => {
      const parsed = parseCsv(HOSTILE_CSV);
      const detection = detectChart(parsed, forced);
      for (const preset of PRESETS) {
        const svg = renderSvgString(parsed, detection, TITLE, preset);
        assertInert(svg, `${forced ?? "auto"}/${preset.id}`);
        // Proof the hostile text was rendered-and-escaped, not quietly dropped.
        expect(svg).toMatch(/&lt;script&gt;|&lt;\/text&gt;/);
      }
    });
  }

  it("the downloaded Blob carries the same inert bytes", async () => {
    const parsed = parseCsv(HOSTILE_CSV);
    const blob = exportSvg(parsed, detectChart(parsed), TITLE, PRESETS[0]);
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    assertInert(await blob.text(), "blob");
  });

  // renderSvgString injects the background with String.replace, whose REPLACEMENT string
  // treats $&, $1, $` and $' specially. User data must never reach that argument.
  it("$-sequences in user data don't corrupt the background-rect injection", () => {
    const dollar = "$&$1$`$'$$ end";
    const csv = [["cat", dollar].map(field).join(","), 'a,"1"', 'b,"2"'].join("\n");
    const parsed = parseCsv(csv);
    const svg = renderSvgString(parsed, detectChart(parsed), dollar, PRESETS[0]);
    assertInert(svg, "dollar");
    const rects = svg.match(/<rect x="0" y="0"[^>]*fill="#fffdf8"\/>/g) ?? [];
    expect(rects.length, "exactly one background rect").toBe(1);
    expect(svg.includes("$&$1$`$'$$ end") || svg.includes("$&amp;")).toBe(true);
  });

  // C0 control chars are illegal in XML. Since v1.3 they are stripped at parse time, so the
  // export stays well-formed instead of producing a file the user cannot reopen.
  it("a control char is stripped, leaving a well-formed SVG", () => {
    const parsed = parseCsv(`cat,val\nrow${NUL}one,10\nrowtwo,20`);
    // Titles derived from a file name are scrubbed at the boundary in main.ts.
    const svg = renderSvgString(parsed, detectChart(parsed), scrub(`t${NUL}`), PRESETS[0]);
    expect(svg.includes(NUL), "NUL must not reach the SVG").toBe(false);
    assertInert(svg, "control-char");
  });

  it("a 2,000-column CSV parses without throwing", () => {
    const header = Array.from({ length: 2000 }, (_, i) => `c${i}`).join(",");
    const row = Array.from({ length: 2000 }, (_, i) => String(i)).join(",");
    expect(parseCsv(`${header}\n${row}\n${row}`).columns.length).toBe(2000);
  });
});
