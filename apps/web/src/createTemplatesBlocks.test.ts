// @vitest-environment jsdom
/**
 * Phase C: platformer テンプレのブロック種の等価性テスト。
 * capture（Blockly の一時ワークスペース生成）は DOM が要るため、このファイルだけ jsdom で回す。
 * ブロックから生成されるコードが、従来の手書き legacyCode と（空白を除いて）一致することを固定する。
 * テンプレ側のコードを変えたら、ここも合わせて直すこと（ドリフト検出が目的）。
 */
import { compile } from "@js-nes/dsl-compiler";
import { describe, expect, it } from "vitest";
import {
  capturePartBlockState,
  isEmptyBlockState,
  loadPlatformerCoinPartBlocks,
} from "./blocks/blockEditor.js";
import { PART_TOOLBOX } from "./blocks/toolbox.js";
import { buildTemplateProjectV3 } from "./createTemplates.js";
import { dslHeroPlatformerMove, dslHitBox } from "./gameKit.js";
import { buildProjectAssets, buildProjectSequences, buildProjectSource } from "./projectBuild.js";
import { buildBackgroundTilesFromV3 } from "./projectBackground.js";
import { projectV3ToV2 } from "./projectBuildV3.js";
import type { ProjectV3 } from "./projectV3.js";

const norm = (s: string): string => s.replace(/\s+/g, "");

function charByName(p: ProjectV3, name: string) {
  const id = p.characterOrder.find((cid) => p.characters[cid]?.name === name);
  return p.characters[id!]!;
}

function sceneByName(p: ProjectV3, name: string) {
  const id = p.sceneOrder.find((sid) => p.scenes[sid]?.name === name);
  return p.scenes[id!]!;
}

const GOOMBA_CODE = [
  "field x = 160;",
  "field y = 180;",
  "field goingRight = 0;",
  "field hx = 0;",
  "field hy = 0;",
  "",
  "behavior move(self) {",
  "  if (self.goingRight) { self.x += 1; } else { self.x -= 1; }",
  "  if (self.x > 220) { self.goingRight = 0; }",
  "  if (self.x < 80) { self.goingRight = 1; }",
  "  drawSprite(1, self.x, self.y, 0, 1);",
  "}",
].join("\n");

const COIN_CODE = [
  "field x = 100;",
  "field y = 140;",
  "field taken = 0;",
  "field hx = 0;",
  "field hy = 0;",
  "",
  "behavior move(self) {",
  "  if (self.taken) { } else { drawSprite(2, self.x, self.y, 0, 0); }",
  "}",
].join("\n");

const GROUND_CODE = [
  "field x = 0;",
  "field y = 188;",
  "",
  "behavior move(self) {",
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `  drawSprite(${10 + i}, ${16 + i * 32}, self.y, 0, 1);`),
  "}",
].join("\n");

const TITLE_CODE = [
  "instance titleHero: Hero;",
  "",
  "function init() {",
  "  setPalette(0, 1, 33, 0, 0);",
  "  setSpritePalette(0, 1, 34, 0, 0);",
  "  fillBackground(0);",
  "  titleHero.x = 120;",
  "  titleHero.y = 140;",
  "}",
  "",
  "function update() {",
  "  Hero.move(titleHero);",
  "  if (btn.start_just_pressed) { gotoScene(Main); }",
  "}",
].join("\n");

function mainCode(hurtFrames: number): string {
  return [
    "instance hero: Hero;",
    "instance goomba: Goomba;",
    "instance coin: Coin;",
    "instance ground: Ground;",
    "",
    "function init() {",
    "  setPalette(0, 1, 33, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 22, 0, 0);",
    "  fillBackground(1);",
    "  setScroll(0, 0);",
    "  hero.x = 40;",
    "  hero.y = 180;",
    "  hero.hurt = 0;",
    "  coin.taken = 0;",
    "  playSound(StageBgm);",
    "}",
    "",
    "function update() {",
    "  Hero.move(hero);",
    "  Goomba.move(goomba);",
    "  Coin.move(coin);",
    "  Ground.move(ground);",
    "  setScroll(hero.x, 0);",
    "  if (coin.taken) { } else {",
    dslHitBox("hero", "coin", 16, ["coin.taken = 1;", "playSound(CoinGet);"]),
    "  }",
    "  if (hero.hurt) { } else {",
    dslHitBox("hero", "goomba", 16, [
      `hero.hurt = ${hurtFrames};`,
      "hero.x = 40;",
      "playSound(Hurt);",
    ]),
    "  }",
    "  if (coin.taken) {",
    "    if (btn.start_just_pressed) { gotoScene(Clear); }",
    "  }",
    "}",
  ].join("\n");
}

const CLEAR_CODE = [
  "instance clearHero: Hero;",
  "",
  "function init() {",
  "  setPalette(0, 1, 33, 0, 0);",
  "  setSpritePalette(0, 1, 34, 0, 0);",
  "  fillBackground(0);",
  "  clearHero.x = 120;",
  "  clearHero.y = 120;",
  "  playTone(0, 35, 20);",
  "}",
  "",
  "function update() {",
  "  Hero.move(clearHero);",
  "  if (btn.start_just_pressed) { gotoScene(Title); }",
  "}",
].join("\n");

describe("isEmptyBlockState（保存形式の判定）", () => {
  it(
    "capture した実形式の state を「空でない」と判定し、空ワークスペースを「空」と判定する",
    () => {
      const filled = capturePartBlockState(loadPlatformerCoinPartBlocks, PART_TOOLBOX);
      expect(isEmptyBlockState(filled.blocks)).toBe(false);
      const empty = capturePartBlockState((ws) => ws.clear(), PART_TOOLBOX);
      expect(isEmptyBlockState(empty.blocks)).toBe(true);
      expect(isEmptyBlockState(undefined)).toBe(true);
      expect(isEmptyBlockState(null)).toBe(true);
    },
    120_000,
  );
});

describe("platformer のブロック種（Phase C）", () => {
  it(
    "全キャラ・全シーンにブロックが埋め込まれ、生成コードが従来コードと一致する",
    () => {
      const p = buildTemplateProjectV3("platformer", { mapperId: 0 });

      for (const id of p.characterOrder) {
        expect(isEmptyBlockState(p.characters[id]!.behaviorBlocks)).toBe(false);
      }
      for (const id of p.sceneOrder) {
        expect(isEmptyBlockState(p.scenes[id]!.logicBlocks)).toBe(false);
      }

      expect(norm(charByName(p, "Hero").legacyCode ?? "")).toBe(
        norm(dslHeroPlatformerMove({ groundY: 180, spriteId: 0 })),
      );
      expect(norm(charByName(p, "Goomba").legacyCode ?? "")).toBe(norm(GOOMBA_CODE));
      expect(norm(charByName(p, "Coin").legacyCode ?? "")).toBe(norm(COIN_CODE));
      expect(norm(charByName(p, "Ground").legacyCode ?? "")).toBe(norm(GROUND_CODE));
      expect(norm(sceneByName(p, "Title").legacyCode ?? "")).toBe(norm(TITLE_CODE));
      expect(norm(sceneByName(p, "Main").legacyCode ?? "")).toBe(norm(mainCode(45)));
      expect(norm(sceneByName(p, "Clear").legacyCode ?? "")).toBe(norm(CLEAR_CODE));
    },
    120_000,
  );

  it(
    "調整（tuning）もブロック生成コードに反映される",
    () => {
      const p = buildTemplateProjectV3("platformer", {
        mapperId: 0,
        tuning: { speed: "fast", jump: "high", hurt: "long" },
      });
      expect(norm(charByName(p, "Hero").legacyCode ?? "")).toBe(
        norm(
          dslHeroPlatformerMove({
            groundY: 180,
            spriteId: 0,
            walkSpeed: 3,
            dashSpeed: 5,
            jumpFrames: 14,
          }),
        ),
      );
      expect(norm(sceneByName(p, "Main").legacyCode ?? "")).toBe(norm(mainCode(75)));
    },
    120_000,
  );

  it(
    "ブロック種入りの platformer が NROM ビルド＆コンパイルできる",
    () => {
      const v3 = buildTemplateProjectV3("platformer", { title: "t", mapperId: 0 });
      const v2 = projectV3ToV2(v3);
      const source = buildProjectSource(v2);
      const assets = buildProjectAssets(v2);
      const { sequences } = buildProjectSequences(v2);
      const backgroundTiles = buildBackgroundTilesFromV3(v3);
      const { rom } = compile(source, { ...assets, sequences, mapperId: 0, backgroundTiles });
      expect(rom.byteLength).toBeGreaterThan(16);
    },
    120_000,
  );
});

const SS_BLOCK_CODE = [
  "field x = 120;",
  "field y = 180;",
  "",
  "behavior move(self) {",
  "  drawSprite(2, self.x, self.y, 0, 1);",
  "}",
].join("\n");

const SS_FLAG_CODE = [
  "field x = 220;",
  "field y = 160;",
  "field hx = 0;",
  "field hy = 0;",
  "",
  "behavior move(self) {",
  "  drawSprite(3, self.x, self.y, 0, 0);",
  "}",
].join("\n");

const SS_TITLE_CODE = [
  "instance titleMario: Mario;",
  "",
  "function init() {",
  "  setPalette(0, 1, 33, 0, 0);",
  "  setSpritePalette(0, 1, 34, 0, 0);",
  "  fillBackground(0);",
  "  titleMario.x = 120;",
  "  titleMario.y = 140;",
  "}",
  "",
  "function update() {",
  "  Mario.move(titleMario);",
  "  if (btn.start_just_pressed) { gotoScene(Main); }",
  "}",
].join("\n");

const SS_MAIN_CODE = [
  "instance mario: Mario;",
  "instance block: Block;",
  "instance flag: Flag;",
  "",
  "function init() {",
  "  setPalette(0, 1, 33, 0, 0);",
  "  setSpritePalette(0, 1, 34, 0, 0);",
  "  setSpritePalette(1, 1, 16, 0, 0);",
  "  fillBackground(1);",
  "  setScroll(0, 0);",
  "  mario.x = 40;",
  "  mario.y = 180;",
  "  playSound(StageBgm);",
  "}",
  "",
  "function update() {",
  "  Mario.move(mario);",
  "  Block.move(block);",
  "  Flag.move(flag);",
  "  setScroll(mario.x, 0);",
  dslHitBox("mario", "flag", 16, ["playSound(Goal);", "gotoScene(Clear);"]),
  "}",
].join("\n");

const SS_CLEAR_CODE = [
  "instance clearMario: Mario;",
  "",
  "function init() {",
  "  setPalette(0, 1, 33, 0, 0);",
  "  setSpritePalette(0, 1, 34, 0, 0);",
  "  fillBackground(0);",
  "  clearMario.x = 120;",
  "  clearMario.y = 120;",
  "}",
  "",
  "function update() {",
  "  Mario.move(clearMario);",
  "  if (btn.start_just_pressed) { gotoScene(Title); }",
  "}",
].join("\n");

describe("side_scroll のブロック種（Phase C）", () => {
  it(
    "全キャラ・全シーンにブロックが埋め込まれ、生成コードが従来コードと一致する",
    () => {
      const p = buildTemplateProjectV3("side_scroll", { mapperId: 0 });

      for (const id of p.characterOrder) {
        expect(isEmptyBlockState(p.characters[id]!.behaviorBlocks)).toBe(false);
      }
      for (const id of p.sceneOrder) {
        expect(isEmptyBlockState(p.scenes[id]!.logicBlocks)).toBe(false);
      }

      expect(norm(charByName(p, "Mario").legacyCode ?? "")).toBe(
        norm(dslHeroPlatformerMove({ groundY: 180, spriteId: 0 })),
      );
      expect(norm(charByName(p, "Block").legacyCode ?? "")).toBe(norm(SS_BLOCK_CODE));
      expect(norm(charByName(p, "Flag").legacyCode ?? "")).toBe(norm(SS_FLAG_CODE));
      expect(norm(sceneByName(p, "Title").legacyCode ?? "")).toBe(norm(SS_TITLE_CODE));
      expect(norm(sceneByName(p, "Main").legacyCode ?? "")).toBe(norm(SS_MAIN_CODE));
      expect(norm(sceneByName(p, "Clear").legacyCode ?? "")).toBe(norm(SS_CLEAR_CODE));
    },
    120_000,
  );

  it(
    "調整（tuning）もブロック生成コードに反映される",
    () => {
      const p = buildTemplateProjectV3("side_scroll", {
        mapperId: 0,
        tuning: { speed: "fast", jump: "high" },
      });
      expect(norm(charByName(p, "Mario").legacyCode ?? "")).toBe(
        norm(
          dslHeroPlatformerMove({
            groundY: 180,
            spriteId: 0,
            walkSpeed: 3,
            dashSpeed: 5,
            jumpFrames: 14,
          }),
        ),
      );
    },
    120_000,
  );

  it(
    "ブロック種入りの side_scroll が NROM ビルド＆コンパイルできる",
    () => {
      const v3 = buildTemplateProjectV3("side_scroll", { title: "t", mapperId: 0 });
      const v2 = projectV3ToV2(v3);
      const source = buildProjectSource(v2);
      const assets = buildProjectAssets(v2);
      const { sequences } = buildProjectSequences(v2);
      const backgroundTiles = buildBackgroundTilesFromV3(v3);
      const { rom } = compile(source, { ...assets, sequences, mapperId: 0, backgroundTiles });
      expect(rom.byteLength).toBeGreaterThan(16);
    },
    120_000,
  );
});
