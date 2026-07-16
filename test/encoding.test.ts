// v1.4: the non-UTF-8 guard. The v1 criterion ("non-UTF-8 fallback message") was true but
// narrower than intended: it divided replacement chars by TOTAL TEXT LENGTH, so a Big5 file
// whose Chinese sits only in the header had a fixed numerator and a growing denominator and
// decayed to nothing — caught at 200 rows, blind at 1,000. A zh-TW Excel "另存新檔 → CSV"
// export is Big5 by default, so this was the common path, not an edge case.
//
// Every byte sequence below is real, and asserted to be real: each fixture is decoded with
// TextDecoder('big5' | 'latin1' | 'utf-16le') and checked against the text it should be,
// before it is fed to decodeUtf8. A hand-guessed byte array proves nothing.
import { describe, expect, it } from "vitest";
import { decodeUtf8, parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";

const bytes = (...b: number[]) => new Uint8Array(b).buffer;
const utf8 = (s: string) => new TextEncoder().encode(s).buffer;
const join = (...parts: ArrayBuffer[]) => {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), at);
    at += p.byteLength;
  }
  return out.buffer;
};

// Big5/CP950 for "月份,營收" — 月=A4EB 份=A5F7 營=C0E7 收=A6AC.
const BIG5_HEADER = bytes(0xa4, 0xeb, 0xa5, 0xf7, 0x2c, 0xc0, 0xe7, 0xa6, 0xac);
/** `rows` ASCII data rows of the shape "1,10". */
const asciiRows = (rows: number) =>
  utf8("\n" + Array.from({ length: rows }, (_, i) => `${i + 1},${(i + 1) * 10}`).join("\n") + "\n");

describe("the fixtures are the encodings they claim to be", () => {
  it("BIG5_HEADER really is Big5 for 月份,營收", () => {
    expect(new TextDecoder("big5").decode(BIG5_HEADER)).toBe("月份,營收");
  });
});

describe("a mis-encoded file is flagged at any size", () => {
  it("Big5 header + ASCII rows — the case the old rate-vs-length guard went blind on", () => {
    // The number of replacement chars is fixed by the header; only the denominator grew.
    for (const rows of [5, 200, 1000, 5000]) {
      const file = join(BIG5_HEADER, asciiRows(rows));
      expect(decodeUtf8(file).looksNonUtf8, `${rows} rows`).toBe(true);
    }
  });

  it("Latin-1 with several accents", () => {
    // "ville,café\nParis,3\nNîmes,4" in Latin-1: é=0xE9, î=0xEE.
    const file = bytes(
      0x76, 0x69, 0x6c, 0x6c, 0x65, 0x2c, 0x63, 0x61, 0x66, 0xe9, 0x0a, // ville,café
      0x50, 0x61, 0x72, 0x69, 0x73, 0x2c, 0x33, 0x0a, // Paris,3
      0x4e, 0xee, 0x6d, 0x65, 0x73, 0x2c, 0x34, 0x0a // Nîmes,4
    );
    expect(new TextDecoder("latin1").decode(file)).toContain("café");
    expect(decodeUtf8(file).looksNonUtf8).toBe(true);
  });

  it("UTF-16LE with a BOM — Excel's “Unicode Text” export", () => {
    const src = "date,sales\n2025-01-01,10\n";
    const buf = new Uint8Array(2 + src.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe; // BOM
    for (let i = 0; i < src.length; i++) {
      buf[2 + i * 2] = src.charCodeAt(i) & 0xff;
      buf[3 + i * 2] = src.charCodeAt(i) >> 8;
    }
    expect(new TextDecoder("utf-16le").decode(buf.buffer)).toContain("date,sales");
    // The BOM alone lands as two replacement chars, which is exactly the floor.
    expect(decodeUtf8(buf.buffer).looksNonUtf8).toBe(true);
  });
});

describe("the flag never costs anyone their chart", () => {
  // The detector cannot separate two stray CP1252 bytes from a two-character Big5 header by
  // count, and it never will — so the guard's *consequence* is what has to be safe. A flagged
  // file still charts; the flag is a note. That is why a false positive is survivable, and it
  // is the whole reason the floor of 2 is allowed to be imperfect.
  it("a Big5 file still parses into columns — the labels are mojibake, the data is intact", () => {
    const file = join(BIG5_HEADER, asciiRows(1000));
    const { text, looksNonUtf8 } = decodeUtf8(file);
    expect(looksNonUtf8).toBe(true);
    const parsed = parseCsv(text);
    // Two columns, every row kept, the numbers read correctly, and a chart comes out. Only the
    // names are garbage — visibly so, which is the point: nobody posts “���” by accident.
    expect(parsed.columns).toHaveLength(2);
    expect(parsed.columns[1].type).toBe("number");
    expect(parsed.rowCount).toBe(1000);
    expect(() => detectChart(parsed)).not.toThrow();
    expect(parsed.columns[0].name).toMatch(/�/); // the header is mojibake, and looks it
  });

  it("a valid file carrying a smart-quote PAIR is flagged but still charts", () => {
    // Quotes come in pairs, which is exactly what the floor of 2 doesn't survive. As a
    // refusal this was fatal; as a note it costs one line the user can ignore.
    const file = join(utf8("month,sales\n"), bytes(0x92), utf8("Jan,10\nFeb,20\nMar"), bytes(0x92), utf8(",30\n"));
    expect(decodeUtf8(file).looksNonUtf8).toBe(true); // a false positive — the file IS UTF-8
    const parsed = parseCsv(decodeUtf8(file).text);
    expect(parsed.columns[1].type).toBe("number");
    expect(parsed.columns[1].nums).toEqual([10, 20, 30]); // every number intact
  });
});

describe("a real UTF-8 file is never flagged", () => {
  const cases: [string, ArrayBuffer][] = [
    ["Chinese, 1000 rows", join(utf8("月份,營收"), asciiRows(1000))],
    ["Chinese with a BOM", join(utf8("﻿月份,營收"), asciiRows(50))],
    ["emoji labels", utf8("mood,n\n🙂,3\n🙃,4\n😀,5\n")],
    ["plain ASCII", join(utf8("date,sales"), asciiRows(500))],
  ];
  for (const [label, buf] of cases) {
    it(label, () => {
      expect(decodeUtf8(buf).looksNonUtf8).toBe(false);
    });
  }

  it("one stray bad byte — a CP1252 smart quote out of Word — still renders", () => {
    // This is why the floor is 2 and not 1: repl=1, valid=0, which a ratio would score 1.0
    // and refuse. The file is UTF-8; refusing it would tell the user a falsehood about it.
    const file = join(utf8("name,note\nAcme,it"), bytes(0x92), utf8("s fine\nBeta,ok\n"));
    expect(decodeUtf8(file).looksNonUtf8).toBe(false);
  });

  it("a valid UTF-8 file truncated mid-character still renders", () => {
    // 營 is E7 87 9F; drop the last byte, as a chunked read would.
    const file = join(utf8("月份,營收\n2025-01,10\n"), bytes(0xe7, 0x87));
    expect(decodeUtf8(file).looksNonUtf8).toBe(false);
  });
});
