import { describe, expect, it } from "vitest";
import { parse, ParseError } from "./parser.js";

describe("parse（DSL v1: part/scene構文, Phase 1 パースのみ）", () => {
  it("part/sceneを使わないv0ソースは parts/scenes が空配列になる", () => {
    const program = parse(`
      let x = 0;
      function init() {}
      function update() {}
    `);
    expect(program.parts).toEqual([]);
    expect(program.scenes).toEqual([]);
  });

  it("partブロック（field + behavior）をパースできる", () => {
    const program = parse(`
      part Ball {
        field x = 128;
        field y = 120;

        behavior move(self) {
          self.x += 2;
          drawSprite(1, self.x, self.y, 0, 0);
        }
      }
    `);
    expect(program.parts).toHaveLength(1);
    const part = program.parts[0]!;
    expect(part.name).toBe("Ball");
    expect(part.fields).toEqual([
      { name: "x", init: 128, line: 3 },
      { name: "y", init: 120, line: 4 },
    ]);
    expect(part.behaviors).toHaveLength(1);
    expect(part.behaviors[0]!.name).toBe("move");
    expect(part.behaviors[0]!.body).toEqual([
      {
        kind: "assign",
        target: { kind: "member", object: "self", property: "x" },
        op: "+=",
        value: { kind: "num", value: 2 },
        line: 7,
      },
      {
        kind: "callStmt",
        call: {
          kind: "call",
          callee: "drawSprite",
          args: [
            { kind: "num", value: 1 },
            { kind: "member", object: "self", property: "x" },
            { kind: "member", object: "self", property: "y" },
            { kind: "num", value: 0 },
            { kind: "num", value: 0 },
          ],
          line: 8,
        },
      },
    ]);
  });

  it("behaviorの引数は self 以外だとParseErrorになる", () => {
    expect(() =>
      parse(`
      part Foo {
        behavior move(other) {}
      }
    `),
    ).toThrow(ParseError);
  });

  it("sceneブロック（instance + function）をパースできる", () => {
    const program = parse(`
      scene Main {
        instance ball: Ball;
        instance paddle: Paddle;

        function init() {}
        function update() {
          Ball.move(ball);
          if (ball.x < 28) {
            if (ball.y > paddle.y) {
              ball.goingRight = 1;
            }
          }
        }
      }
    `);
    expect(program.scenes).toHaveLength(1);
    const scene = program.scenes[0]!;
    expect(scene.name).toBe("Main");
    expect(scene.instances).toEqual([
      { name: "ball", partType: "Ball", line: 3 },
      { name: "paddle", partType: "Paddle", line: 4 },
    ]);
    expect(scene.functions.map((f) => f.name)).toEqual(["init", "update"]);

    const updateBody = scene.functions[1]!.body;
    expect(updateBody[0]).toEqual({
      kind: "behaviorCall",
      partType: "Ball",
      behaviorName: "move",
      instanceName: "ball",
      line: 8,
    });

    const outerIf = updateBody[1];
    expect(outerIf?.kind).toBe("if");
    if (outerIf?.kind !== "if") throw new Error("expected if");
    expect(outerIf.test).toEqual({
      kind: "compare",
      op: "<",
      left: { kind: "member", object: "ball", property: "x" },
      right: { kind: "num", value: 28 },
    });

    const innerIf = outerIf.consequent[0];
    expect(innerIf?.kind).toBe("if");
    if (innerIf?.kind !== "if") throw new Error("expected if");
    expect(innerIf.test).toEqual({
      kind: "compare",
      op: ">",
      left: { kind: "member", object: "ball", property: "y" },
      right: { kind: "member", object: "paddle", property: "y" },
    });
    expect(innerIf.consequent).toEqual([
      {
        kind: "assign",
        target: { kind: "member", object: "ball", property: "goingRight" },
        op: "=",
        value: { kind: "num", value: 1 },
        line: 11,
      },
    ]);
  });

  it("sceneの関数は init/update 以外だとParseErrorになる", () => {
    expect(() =>
      parse(`
      scene Main {
        function foo() {}
      }
    `),
    ).toThrow(ParseError);
  });

  it("Pongをpart/scene構成でエンドツーエンドにパースできる（設計docのPong v1例）", () => {
    const source = `
      part Ball {
        field x = 128;
        field y = 120;
        field goingRight = 1;
        field goingDown = 1;

        behavior move(self) {
          if (self.goingRight) { self.x += 2; } else { self.x -= 2; }
          if (self.goingDown) { self.y += 2; } else { self.y -= 2; }
          drawSprite(1, self.x, self.y, 0, 0);
        }
      }

      part Paddle {
        field y = 100;
        field bottom = 108;

        behavior move(self) {
          if (btn.up) { self.y -= 2; }
          if (btn.down) { self.y += 2; }
          self.bottom = self.y;
          self.bottom += 8;
          drawSprite(0, 20, self.y, 0, 0);
        }
      }

      scene Main {
        instance ball: Ball;
        instance paddle: Paddle;

        function init() {
          setPalette(0, 1, 48, 0, 0);
        }

        function update() {
          Ball.move(ball);
          Paddle.move(paddle);

          if (ball.y < 2) { ball.goingDown = 1; }
          if (ball.x > 248) { ball.goingRight = 0; }

          if (ball.x < 28) {
            if (ball.y > paddle.y) {
              if (ball.y < paddle.bottom) {
                ball.goingRight = 1;
                playTone(0, 28, 5);
              }
            }
          }
        }
      }
    `;

    expect(() => parse(source)).not.toThrow();
    const program = parse(source);
    expect(program.parts.map((p) => p.name)).toEqual(["Ball", "Paddle"]);
    expect(program.scenes.map((s) => s.name)).toEqual(["Main"]);
  });
});
