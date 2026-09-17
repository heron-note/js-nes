import { describe, expect, it } from "vitest";
import { tokenize, LexError } from "./lexer.js";

describe("tokenize", () => {
  it("tokenizes a simple let statement", () => {
    const tokens = tokenize("let x = 120;");
    expect(tokens.map((t) => t.type)).toEqual(["ident", "ident", "=", "num", ";", "eof"]);
    expect(tokens[3]?.num).toBe(120);
  });

  it("parses hex number literals", () => {
    const tokens = tokenize("0x1F");
    expect(tokens[0]).toMatchObject({ type: "num", num: 0x1f });
  });

  it("recognizes two-character operators before single-character ones", () => {
    const tokens = tokenize("x += 1; y == 2; z != 3; a <= 4; b >= 5;");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("+=");
    expect(types).toContain("==");
    expect(types).toContain("!=");
    expect(types).toContain("<=");
    expect(types).toContain(">=");
  });

  it("skips line comments", () => {
    const tokens = tokenize("let x = 1; // comment\nlet y = 2;");
    expect(tokens.filter((t) => t.type === "ident" && t.value === "let")).toHaveLength(2);
  });

  it("throws LexError on an unexpected character", () => {
    expect(() => tokenize("let x = 1 @ 2;")).toThrow(LexError);
  });

  it("tracks line numbers across newlines", () => {
    const tokens = tokenize("let x = 1;\nlet y = 2;");
    const secondLet = tokens.filter((t) => t.value === "let")[1];
    expect(secondLet?.line).toBe(2);
  });
});
