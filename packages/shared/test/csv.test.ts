import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "../src/csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted cells with commas, quotes, and newlines", () => {
    const text = '"hello, world","say ""hi""","line1\nline2"\n';
    expect(parseCsv(text)).toEqual([['hello, world', 'say "hi"', "line1\nline2"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty cells", () => {
    expect(parseCsv("a,,c\n,,\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("round-trip", () => {
  it("serialize(parse(x)) is lossless for canonical csv", () => {
    const canonical = 'name,amount,note\nwidget,100,"has, comma"\ngadget,250,"say ""hi"""\n';
    expect(serializeCsv(parseCsv(canonical))).toBe(canonical);
  });

  it("parse(serialize(rows)) returns the same rows", () => {
    const rows = [
      ["h1", "h,2", 'q"3'],
      ["", "multi\nline", "plain"],
    ];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });
});
