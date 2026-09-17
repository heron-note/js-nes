import { describe, expect, it } from "vitest";
import { Nes } from "@js-nes/emulator-core";
import { compile } from "@js-nes/dsl-compiler";
import { createEmptyProject } from "./project.js";
import { ProjectBuildError, buildProjectAssets, buildProjectSource } from "./projectBuild.js";

/**
 * DSL v1（シーン/パーツ構成）Phase 6のゲート。
 * プロジェクト（パーツ/シーン/サウンド）から実際にコンパイル・実行可能な.nesが
 * 組み立てられること、そして音も名前付きアセットとして参照できることを検証する。
 */

const TILE_A = new Array(64).fill(1);
const TILE_B = new Array(64).fill(2);

function pongLikeProject() {
  const project = createEmptyProject();
  project.parts.push({
    name: "Ball",
    tiles: [TILE_A],
    code: [
      "field x = 128;",
      "field goingRight = 1;",
      "",
      "behavior move(self) {",
      "  if (self.goingRight) { self.x += 2; } else { self.x -= 2; }",
      "  drawSprite(1, self.x, 120, 0, 0);",
      "  playSound(Jump);",
      "}",
    ].join("\n"),
  });
  project.parts.push({
    name: "Paddle",
    tiles: [TILE_B],
    code: [
      "field y = 100;",
      "",
      "behavior move(self) {",
      "  if (btn.up) { self.y -= 2; }",
      "  drawSprite(0, 20, self.y, 0, 0);",
      "}",
    ].join("\n"),
  });
  project.scenes.push({
    name: "Main",
    code: [
      "instance ball: Ball;",
      "instance paddle: Paddle;",
      "",
      "function init() {}",
      "function update() {",
      "  Paddle.move(paddle);",
      "  Ball.move(ball);",
      "}",
    ].join("\n"),
  });
  project.sounds.push({ name: "Jump", channel: 0, note: 28, duration: 5 });
  return project;
}

describe("buildProjectSource", () => {
  it("空のプロジェクトは空文字列になる", () => {
    expect(buildProjectSource(createEmptyProject())).toBe("");
  });

  it("パーツ・シーンを宣言順にpart{}/scene{}として結合する", () => {
    const source = buildProjectSource(pongLikeProject());
    expect(source).toContain("part Ball {");
    expect(source).toContain("part Paddle {");
    expect(source).toContain("scene Main {");
    expect(source.indexOf("part Ball")).toBeLessThan(source.indexOf("part Paddle"));
    expect(source.indexOf("part Paddle")).toBeLessThan(source.indexOf("scene Main"));
  });

  it("playSound(名前)をsoundsアセットから解決してplayTone(...)に置き換える", () => {
    const source = buildProjectSource(pongLikeProject());
    expect(source).not.toContain("playSound");
    expect(source).toContain("playTone(0, 28, 5)");
  });

  it("未知のサウンド名を参照するとProjectBuildErrorを投げる", () => {
    const project = pongLikeProject();
    project.parts[0]!.code += "\nbehavior boom(self) { playSound(NotDefined); }";
    expect(() => buildProjectSource(project)).toThrow(ProjectBuildError);
  });
});

describe("buildProjectAssets", () => {
  it("パーツ名をキーにタイル配列をまとめる", () => {
    const assets = buildProjectAssets(pongLikeProject());
    expect(assets.partTiles["Ball"]).toEqual([TILE_A]);
    expect(assets.partTiles["Paddle"]).toEqual([TILE_B]);
  });
});

describe("プロジェクト全体のエンドツーエンドコンパイル・実行", () => {
  it("パーツ/シーン/サウンドから組み立てたROMが実際に動く（サウンド参照込み）", () => {
    const project = pongLikeProject();
    const source = buildProjectSource(project);
    const assets = buildProjectAssets(project);
    const { rom } = compile(source, assets);

    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 20; i++) nes.runFrame();

    // Ball.move()のplaySound(Jump)がplayTone(0,28,5)として実行され、Pulse1が鳴っている
    expect(nes.apu.getChannelState(0).enabled).toBe(true);
  });
});
