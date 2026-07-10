// v1.2: the two ways chartsnap used to draw a wrong chart without saying anything —
// European numbers read as American, and calendar dates shifted by the viewer's timezone.
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";

const col = (csv: string, i = 1) => parseCsv(csv).columns[i];
const nums = (csv: string, i = 1) => col(csv, i).nums;
const notesFor = (csv: string) => parseCsv(csv).notes.join(" | ");

describe("number conventions are decided per column", () => {
  it("reads European numbers when the column proves it", () => {
    expect(nums('x,v\nA,"1.234,56"\nB,"9.876,54"')).toEqual([1234.56, 9876.54]); // both separators
    expect(nums("x,v\nA,1.234.567\nB,2.000.000")).toEqual([1234567, 2000000]); // dots must group
    expect(nums('x,v\nA,"12,5"\nB,"3,75"')).toEqual([12.5, 3.75]); // comma can't be grouping here
    expect(nums('x,v\nA,"1234,567"\nB,"2345,678"')).toEqual([1234.567, 2345.678]); // 4-digit lead
  });

  it("handles the real European export: semicolon-delimited, decimal comma", () => {
    // A decimal comma can't survive a comma delimiter unquoted, which is exactly why
    // European spreadsheets export with ";". PapaParse sniffs the delimiter for us.
    expect(nums("Stadt;Wert\nBerlin;12,5\nHamburg;3,75")).toEqual([12.5, 3.75]);
    expect(nums("Stadt;Einwohner\nBerlin;3.850.000\nHamburg;1.900.000")).toEqual([3850000, 1900000]);
    expect(nums("Stadt;Umsatz\nBerlin;1.234,56\nHamburg;9.876,54")).toEqual([1234.56, 9876.54]);
  });

  it("leaves American numbers exactly as they were", () => {
    expect(nums('x,v\nA,"1,234.56"\nB,"9,876.54"')).toEqual([1234.56, 9876.54]);
    expect(nums('city,pop\nBerlin,"3,850,000"\nHamburg,"1,900,000"')).toEqual([3850000, 1900000]);
    expect(nums('x,v\nA,"2,500"\nB,980')).toEqual([2500, 980]);
    expect(nums("x,v\nA,0.125\nB,1.25\nC,3.14159")).toEqual([0.125, 1.25, 3.14159]);
  });

  it("one decisive cell settles the whole column", () => {
    // "3.850" alone is ambiguous, but "1.234.567" can only be dot-grouping → both are EU.
    expect(nums("x,v\nA,3.850\nB,1.234.567")).toEqual([3850, 1234567]);
    // "1.25" can only be a decimal → the dot is a decimal point, so "3.850" is 3.85.
    expect(nums("x,v\nA,3.850\nB,1.25")).toEqual([3.85, 1.25]);
  });

  // A single stray cell decides the separator's role for the whole column. When that role
  // is "decimal point", every grouped-looking cell shrinks 1000x. Both directions of this
  // were once silent; the values may be right, but the user must be told they're a guess.
  it("never rescales a column by 1000x in silence — comma direction", () => {
    // Four US thousands + one comma-decimal straggler. The comma can only have one role,
    // so EU is the coherent reading — but say so, because "2,500" probably meant 2500.
    const csv = 'region,sales\nNorth,"2,500"\nSouth,"1,900"\nEast,"3,750"\nWest,"4,200"\nCentral,"12,5"';
    expect(nums(csv)).toEqual([2.5, 1.9, 3.75, 4.2, 12.5]);
    const note = notesFor(csv);
    expect(note).toMatch(/ambiguous/i);
    expect(note).toContain("2,500");
    expect(note).toContain("2.5"); // what we used
    expect(note).toContain("2500"); // what they may have meant
  });

  it("never rescales a column by 1000x in silence — dot direction", () => {
    // The mirror: three EU thousands + one dot-decimal straggler.
    const csv = "city,pop\nBerlin,3.850\nHamburg,1.900\nMunich,1.512\nKoln,1.25";
    expect(nums(csv)).toEqual([3.85, 1.9, 1.512, 1.25]);
    expect(notesFor(csv)).toMatch(/“pop” is ambiguous: “3\.850” was read as 3\.85, not 3850/);
  });

  it("stays quiet when a separator is proven to be a grouping mark", () => {
    // "1.234.567" proves the dot groups → "3.850" is confidently 3850. Nothing to warn about.
    expect(notesFor("x,v\nA,3.850\nB,1.234.567")).toBe("");
    // "3,850,000" proves the comma groups → "2,500" is confidently 2500.
    expect(notesFor('city,pop\nBerlin,"3,850,000"\nHamburg,"2,500"')).toBe("");
  });

  it("does not eat the decimal point of an exponent", () => {
    // EU grouping-strip must not treat the "e" as a group boundary: 1.234e5 is 123400.
    expect(nums("x,v\nA,1.111.222\nB,1.234e5")).toEqual([1111222, 123400]);
    expect(nums("x,v\nA,1e5\nB,2.5")).toEqual([100000, 2.5]);
  });

  it("renders an undecidable column, but names both readings", () => {
    const csv = "city,pop\nBerlin,3.850\nHamburg,1.900\nMunich,1.512";
    expect(nums(csv)).toEqual([3.85, 1.9, 1.512]); // American reading — nothing silently moves
    const note = notesFor(csv);
    expect(note).toMatch(/ambiguous/i);
    expect(note).toContain("pop");
    expect(note).toContain("3.85"); // what we used
    expect(note).toContain("3850"); // what they may have meant
  });

  it("stays quiet for ordinary decimals and ordinary US thousands", () => {
    expect(notesFor("x,v\nA,0.125\nB,0.250")).toBe("");
    expect(notesFor("x,v\nA,1.25\nB,3.50")).toBe("");
    expect(notesFor('x,v\nA,"2,500"\nB,980')).toBe("");
    expect(notesFor("x,v\nA,10\nB,25")).toBe("");
  });

  it("flags a column that contradicts itself", () => {
    // Enough American cells to keep the column numeric, one European straggler.
    const csv = 'x,v\nA,"1,234.56"\nB,"2,345.67"\nC,"3,456.78"\nD,"4,567.89"\nE,"5,678.90"\nF,"1.234,56"';
    const p = parseCsv(csv);
    expect(p.columns[1].type).toBe("number");
    expect(p.notes.join(" ")).toMatch(/mixed number formats/i);
    expect(Number.isNaN(p.columns[1].nums[5])).toBe(true); // the straggler can't be read
  });

  it("still explains itself when the contradiction drops the column to a category", () => {
    // 4 of 6 parse → below TYPE_THRESHOLD → "category". The column silently leaves the
    // chart; without a note the user has no idea why.
    const csv = 'x,v\nA,"1,234.56"\nB,"2,345.67"\nC,"3,456.78"\nD,"4,567.89"\nE,"1.234,56"\nF,"9.876,54"';
    const p = parseCsv(csv);
    expect(p.columns[1].type).toBe("category");
    expect(p.notes.join(" ")).toMatch(/mixed number formats/i);
  });
});

// A bare calendar date has no timezone. Parsing it as UTC midnight (what Date.parse does)
// and drawing it on a local-time axis makes "2025-01-01" render as "Dec 31" west of UTC.
// CI runs UTC, which never exposes this, so pin the zone here.
describe("calendar dates are local midnight, in every timezone", () => {
  const withTz = (tz: string, fn: () => void): void => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      fn();
    } finally {
      process.env.TZ = prev;
    }
  };

  const firstTime = (cell: string) => parseCsv(`d,v\n${cell},1\n2030-06-15,2`).columns[0].times[0];

  for (const tz of ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Taipei"]) {
    it(`${tz}: "2025-01-01" is midnight on Jan 1, not the day before`, () => {
      withTz(tz, () => {
        const t = new Date(firstTime("2025-01-01"));
        expect([t.getFullYear(), t.getMonth(), t.getDate()]).toEqual([2025, 0, 1]);
        expect([t.getHours(), t.getMinutes()]).toEqual([0, 0]);
      });
    });
  }

  it("applies to year-only and year-month cells too", () => {
    withTz("America/Los_Angeles", () => {
      const y = new Date(firstTime("2019"));
      expect([y.getFullYear(), y.getMonth(), y.getDate(), y.getHours()]).toEqual([2019, 0, 1, 0]);
      const ym = new Date(firstTime("2025-03"));
      expect([ym.getFullYear(), ym.getMonth(), ym.getDate(), ym.getHours()]).toEqual([2025, 2, 1, 0]);
    });
  });

  it("keeps the exact instant when the cell carries a time or an offset", () => {
    withTz("America/New_York", () => {
      expect(firstTime("2025-01-01T09:30:00Z")).toBe(Date.UTC(2025, 0, 1, 9, 30));
      // No offset: ECMA-262 says local time, which is what a spreadsheet means.
      expect(firstTime("2025-01-01T00:00:00")).toBe(+new Date(2025, 0, 1));
    });
  });

  it("rejects impossible dates instead of rolling them forward", () => {
    // 2025-02-31 must not silently become March 3.
    expect(Number.isNaN(parseCsv("d,v\n2025-02-31,1\n2025-02-28,2").columns[0].times[0])).toBe(true);
    expect(Number.isNaN(parseCsv("d,v\n2025-13-01,1\n2025-12-01,2").columns[0].times[0])).toBe(true);
    // A bare number that isn't a plausible year stays a number, not a date.
    expect(parseCsv("v,w\n1234,1\n5678,2").columns[0].type).toBe("number");
  });
});
