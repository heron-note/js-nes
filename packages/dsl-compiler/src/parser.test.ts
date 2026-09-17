import { describe, expect, it } from "vitest";
import { parse, ParseError } from "./parser.js";

describe("parse", () => {
  it("parses global let declarations", () => {
    const program = parse("let x = 120;\nlet y = 100;");
    expect(program.globals).toEqual([
      { name: "x", init: 120, line: 1 },
      { name: "y", init: 100, line: 2 },
    ]);
  });

  it("parses init/update function declarations", () => {
    const program = parse(`
      function init() {}
      function update() {}
    `);
    expect(program.functions.map((f) => f.name)).toEqual(["init", "update"]);
  });

  it("rejects function names other than init/update", () => {
    expect(() => parse("function foo() {}")).toThrow(ParseError);
  });

  it("parses assignment statements (=, +=, -=)", () => {
    const program = parse(`
      function update() {
        x = 5;
        x += 1;
        x -= 2;
      }
    `);
    expect(program.functions[0]?.body).toEqual([
      { kind: "assign", name: "x", op: "=", value: { kind: "num", value: 5 }, line: 3 },
      { kind: "assign", name: "x", op: "+=", value: { kind: "num", value: 1 }, line: 4 },
      { kind: "assign", name: "x", op: "-=", value: { kind: "num", value: 2 }, line: 5 },
    ]);
  });

  it("parses if/else with a btn.* truthy condition", () => {
    const program = parse(`
      function update() {
        if (btn.right) {
          x += 1;
        } else {
          x -= 1;
        }
      }
    `);
    const stmt = program.functions[0]?.body[0];
    expect(stmt?.kind).toBe("if");
    if (stmt?.kind !== "if") throw new Error("expected if");
    expect(stmt.test).toEqual({
      kind: "truthy",
      expr: { kind: "member", object: "btn", property: "right" },
    });
    expect(stmt.consequent).toHaveLength(1);
    expect(stmt.alternate).toHaveLength(1);
  });

  it("parses comparison conditions", () => {
    const program = parse(`
      function update() {
        if (x == 10) {
          x = 0;
        }
      }
    `);
    const stmt = program.functions[0]?.body[0];
    if (stmt?.kind !== "if") throw new Error("expected if");
    expect(stmt.test).toEqual({
      kind: "compare",
      op: "==",
      left: { kind: "ident", name: "x" },
      right: { kind: "num", value: 10 },
    });
  });

  it("parses builtin call statements with multiple arguments", () => {
    const program = parse(`
      function init() {
        setPalette(0, 15, 33, 0, 0);
      }
    `);
    const stmt = program.functions[0]?.body[0];
    expect(stmt).toEqual({
      kind: "callStmt",
      call: {
        kind: "call",
        callee: "setPalette",
        args: [
          { kind: "num", value: 0 },
          { kind: "num", value: 15 },
          { kind: "num", value: 33 },
          { kind: "num", value: 0 },
          { kind: "num", value: 0 },
        ],
        line: 3,
      },
    });
  });

  it("throws ParseError on malformed input", () => {
    expect(() => parse("let x = ;")).toThrow(ParseError);
    expect(() => parse("function update() { if x {} }")).toThrow(ParseError);
  });
});
