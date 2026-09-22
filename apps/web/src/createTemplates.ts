/**
 * Create 新規プロジェクト用ゲームパターンテンプレート。
 * 複数シーン切替・BGM ループ・矩形重なり判定まで組み立てられる範囲で、各ジャンルの骨組みを渡す。
 */
import {
  capturePartBlockState,
  captureSceneBlockState,
  loadDefaultMainSceneBlocks,
  loadDefaultMoverPartBlocks,
  loadDefaultPlayerPartBlocks,
} from "./blocks/blockEditor.js";
import { PART_TOOLBOX, SCENE_TOOLBOX } from "./blocks/toolbox.js";
import {
  createEmptyBitmap,
  createEmptyProjectV3,
  newAssetId,
  type CharacterAsset,
  type CreateMapperId,
  type ProjectV3,
  type SceneAsset,
  type SoundAsset,
} from "./projectV3.js";
import { paintTile, type TilePattern } from "./templateGraphics.js";
import { dslHeroPlatformerMove, dslHitBox, paintHeroWalkSheet } from "./gameKit.js";
import { BACKGROUND_TILE_BASE } from "./projectBackground.js";

export type CreateTemplateId =
  | "empty"
  | "starter"
  | "platformer"
  | "side_scroll"
  | "shmup"
  | "fighter"
  | "rpg"
  | "chase";

export type CreateTemplateInfo = {
  id: CreateTemplateId;
  title: string;
  blurb: string;
  badge: string;
};

export const CREATE_TEMPLATES: CreateTemplateInfo[] = [
  {
    id: "empty",
    title: "空のプロジェクト",
    blurb: "パレットと空の Main シーンだけ。いちから組み立てます。",
    badge: "空",
  },
  {
    id: "starter",
    title: "はじめてのサンプル",
    blurb: "十字キーで動く Player と、左右に往復する Mover。Create の基本操作を試せます。",
    badge: "入門",
  },
  {
    id: "platformer",
    title: "プラットフォーマー（旧マリオ風）",
    blurb: "タイトル→本編→クリアの3シーン。歩行・ダッシュ・ジャンプ、敵／コイン接触、BGM ループ。",
    badge: "横アクション",
  },
  {
    id: "side_scroll",
    title: "横スクロール＋ゴール（SMB 風）",
    blurb: "背景スクロール＋ダッシュ／ジャンプ。旗でクリア。BGM ループ付き。",
    badge: "横スクロール",
  },
  {
    id: "shmup",
    title: "縦スクロールシューティング",
    blurb: "自機を動かし A で弾。敵は上から降り、弾ヒット／接触の骨組み付き。",
    badge: "シューティング",
  },
  {
    id: "fighter",
    title: "格闘ゲーム風",
    blurb: "1P 操作と 2P（簡易 AI）。接近して A で攻撃ヒット、HP 減少の骨組み。",
    badge: "格闘",
  },
  {
    id: "rpg",
    title: "初期型 RPG 風（DQ/FF）",
    blurb: "8px 単位の歩幅移動と NPC。近づくと talk フラグが立つ（会話 UI は後続）。",
    badge: "RPG",
  },
  {
    id: "chase",
    title: "追いかけっこ（パックマン風）",
    blurb: "画面内を 4 方向移動。ゴーストがプレイヤーを追尾。重なりでスタートへ戻る。",
    badge: "チェイス",
  },
];

type BuildOpts = { title?: string; mapperId?: CreateMapperId };

function mainScene(project: ProjectV3): SceneAsset {
  return project.scenes[project.sceneOrder[0]!]!;
}

function sceneByName(project: ProjectV3, name: string): SceneAsset | undefined {
  const id = project.sceneOrder.find((sid) => project.scenes[sid]?.name === name);
  return id ? project.scenes[id] : undefined;
}

function addScene(project: ProjectV3, name: string): SceneAsset {
  const id = newAssetId("scn");
  const sc: SceneAsset = { id, name, placements: [], soundIds: [] };
  project.scenes[id] = sc;
  project.sceneOrder.push(id);
  return sc;
}

function addBitmap(project: ProjectV3, name: string, pattern: TilePattern): string {
  const palId = project.paletteOrder[0]!;
  const bmp = createEmptyBitmap(palId, { name, tileWidth: 1, tileHeight: 1 });
  paintTile(bmp.pixels, pattern);
  project.bitmaps[bmp.id] = bmp;
  project.bitmapOrder.push(bmp.id);
  return bmp.id;
}

function addHeroBitmap(project: ProjectV3, name: string): string {
  const palId = project.paletteOrder[0]!;
  const bmp = createEmptyBitmap(palId, { name, tileWidth: 4, tileHeight: 1 });
  paintHeroWalkSheet(bmp.pixels);
  project.bitmaps[bmp.id] = bmp;
  project.bitmapOrder.push(bmp.id);
  return bmp.id;
}

function addCharacter(project: ProjectV3, name: string, bitmapId: string, code: string): CharacterAsset {
  const palId = project.paletteOrder[0]!;
  const id = newAssetId("chr");
  const ch: CharacterAsset = { id, name, bitmapId, paletteId: palId, legacyCode: code };
  project.characters[id] = ch;
  project.characterOrder.push(id);
  return ch;
}

function addSound(
  project: ProjectV3,
  name: string,
  channel: 0 | 1 | 2 | 3,
  note: number,
  duration: number,
  kind: "bgm" | "se" = "se",
): SoundAsset {
  const id = newAssetId("snd");
  const s: SoundAsset = { id, name, channel, note, duration, kind };
  project.sounds[id] = s;
  project.soundOrder.push(id);
  return s;
}

/** 短いループ旋律を events 付き BGM として登録する。 */
function addLoopBgm(project: ProjectV3, name: string): SoundAsset {
  const s = addSound(project, name, 2, 24, 8, "bgm");
  s.events = [
    { t: 0, channel: 2, note: 24, duration: 6 },
    { t: 8, channel: 2, note: 26, duration: 6 },
    { t: 16, channel: 2, note: 28, duration: 6 },
    { t: 24, channel: 2, note: 26, duration: 6 },
  ];
  s.lengthFrames = 32;
  return s;
}

function place(project: ProjectV3, characterName: string, x: number, y: number, sceneName = "Main"): void {
  const chId = project.characterOrder.find((id) => project.characters[id]?.name === characterName);
  if (!chId) return;
  const sc = sceneByName(project, sceneName) ?? mainScene(project);
  sc.placements.push({ id: newAssetId("plc"), characterId: chId, x, y });
}

function seedStarterBlocks(project: ProjectV3): void {
  // Blockly の capture は DOM が必要（ブラウザの Create ウィザード／リセット時）。
  if (typeof document === "undefined") return;
  try {
    for (const id of project.characterOrder) {
      const ch = project.characters[id]!;
      if (ch.name === "Player") {
        const c = capturePartBlockState(loadDefaultPlayerPartBlocks, PART_TOOLBOX);
        ch.behaviorBlocks = c.blocks;
        ch.legacyCode = c.code;
      } else if (ch.name === "Mover") {
        const c = capturePartBlockState(loadDefaultMoverPartBlocks, PART_TOOLBOX);
        ch.behaviorBlocks = c.blocks;
        ch.legacyCode = c.code;
      }
    }
    const sc = mainScene(project);
    const c = captureSceneBlockState(loadDefaultMainSceneBlocks, SCENE_TOOLBOX);
    sc.logicBlocks = c.blocks;
    sc.legacyCode = c.code;
  } catch {
    // テスト環境など DOM 不完全時は legacyCode のままにする
  }
}

/**
 * 粗い X 近接（幅 16）。分岐が長いシーン向け。
 * a に hit/hx、b に hx が必要。
 */
function hitNearX(a: string, b: string, thenLines: string[]): string {
  const body = thenLines.map((l) => `    ${l}`).join("\n");
  return [
    `  ${b}.hx = ${b}.x;`,
    `  ${b}.hx += 16;`,
    `  ${a}.hit = 0;`,
    `  if (${a}.x > ${b}.x) {`,
    `    if (${a}.x < ${b}.hx) { ${a}.hit = 1; }`,
    `  } else {`,
    `    if (${a}.x < ${b}.x) {`,
    `      ${a}.hx = ${a}.x;`,
    `      ${a}.hx += 16;`,
    `      if (${b}.x < ${a}.hx) { ${a}.hit = 1; }`,
    `    } else {`,
    `      ${a}.hit = 1;`,
    `    }`,
    `  }`,
    `  if (${a}.hit) {`,
    body,
    `  }`,
  ].join("\n");
}

function buildEmpty(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "新規プロジェクト";
  return project;
}

function buildStarter(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "はじめてのサンプル";
  addCharacter(
    project,
    "Player",
    addBitmap(project, "Player グラフィック", "player"),
    [
      "field x = 120;",
      "field y = 100;",
      "",
      "behavior move(self) {",
      "  if (btn.right) { self.x += 1; }",
      "  if (btn.left) { self.x -= 1; }",
      "  if (btn.up) { self.y -= 1; }",
      "  if (btn.down) { self.y += 1; }",
      "  if (btn.a_just_pressed) { playTone(0, 24, 10); }",
      "  drawSprite(0, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Mover",
    addBitmap(project, "Mover グラフィック", "enemy"),
    [
      "field x = 200;",
      "field y = 50;",
      "field goingRight = 0;",
      "",
      "behavior move(self) {",
      "  if (self.goingRight) { self.x += 1; } else { self.x -= 1; }",
      "  if (self.x > 240) { self.goingRight = 0; }",
      "  if (self.x < 16) { self.goingRight = 1; }",
      "  drawSprite(1, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addSound(project, "Jump", 0, 24, 10);
  place(project, "Player", 120, 100);
  place(project, "Mover", 200, 50);
  mainScene(project).legacyCode = [
    "instance player: Player;",
    "instance mover: Mover;",
    "",
    "function init() {",
    "  setPalette(0, 1, 33, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 22, 0, 0);",
    "}",
    "",
    "function update() {",
    "  Player.move(player);",
    "  Mover.move(mover);",
    "}",
  ].join("\n");
  seedStarterBlocks(project);
  return project;
}

function buildPlatformer(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "プラットフォーマー";
  addCharacter(project, "Hero", addHeroBitmap(project, "Hero"), dslHeroPlatformerMove({ groundY: 180, spriteId: 0 }));
  addCharacter(
    project,
    "Goomba",
    addBitmap(project, "Goomba", "enemy"),
    [
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
    ].join("\n"),
  );
  addCharacter(
    project,
    "Coin",
    addBitmap(project, "Coin", "coin"),
    [
      "field x = 100;",
      "field y = 140;",
      "field taken = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "",
      "behavior move(self) {",
      "  if (self.taken) { } else { drawSprite(2, self.x, self.y, 0, 0); }",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Ground",
    addBitmap(project, "Ground", "ground"),
    [
      "field x = 0;",
      "field y = 188;",
      "",
      "behavior move(self) {",
      "  drawSprite(10, 16, self.y, 0, 1);",
      "  drawSprite(11, 48, self.y, 0, 1);",
      "  drawSprite(12, 80, self.y, 0, 1);",
      "  drawSprite(13, 112, self.y, 0, 1);",
      "  drawSprite(14, 144, self.y, 0, 1);",
      "  drawSprite(15, 176, self.y, 0, 1);",
      "  drawSprite(16, 208, self.y, 0, 1);",
      "  drawSprite(17, 240, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addSound(project, "Jump", 0, 28, 6, "se");
  addSound(project, "CoinGet", 0, 36, 8, "se");
  addSound(project, "Hurt", 1, 12, 10, "se");
  addLoopBgm(project, "StageBgm");
  const skyId = addBitmap(project, "Sky", "sky");

  // 先頭シーンを Title に改名し、Main / Clear を追加
  const title = mainScene(project);
  title.name = "Title";
  title.legacyCode = [
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

  const main = addScene(project, "Main");
  main.backgroundBitmapId = skyId;
  main.legacyCode = [
    "instance hero: Hero;",
    "instance goomba: Goomba;",
    "instance coin: Coin;",
    "instance ground: Ground;",
    "",
    "function init() {",
    "  setPalette(0, 1, 33, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 22, 0, 0);",
    `  fillBackground(${BACKGROUND_TILE_BASE});`,
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
      "hero.hurt = 45;",
      "hero.x = 40;",
      "playSound(Hurt);",
    ]),
    "  }",
    "  if (coin.taken) {",
    "    if (btn.start_just_pressed) { gotoScene(Clear); }",
    "  }",
    "}",
  ].join("\n");

  const clear = addScene(project, "Clear");
  clear.legacyCode = [
    "instance clearHero: Hero;",
    "",
    "function init() {",
    "  setPalette(0, 1, 33, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  fillBackground(0);",
    "  clearHero.x = 120;",
    "  clearHero.y = 120;",
    "  playTone(0, 36, 20);",
    "}",
    "",
    "function update() {",
    "  Hero.move(clearHero);",
    "  if (btn.start_just_pressed) { gotoScene(Title); }",
    "}",
  ].join("\n");

  place(project, "Hero", 40, 180, "Main");
  place(project, "Goomba", 160, 180, "Main");
  place(project, "Coin", 100, 140, "Main");
  place(project, "Ground", 0, 188, "Main");
  return project;
}

function buildSideScroll(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "横スクロール＋ゴール";
  addCharacter(project, "Mario", addHeroBitmap(project, "Mario"), dslHeroPlatformerMove({ groundY: 180, spriteId: 0 }));
  addCharacter(
    project,
    "Block",
    addBitmap(project, "Block", "ground"),
    [
      "field x = 120;",
      "field y = 180;",
      "",
      "behavior move(self) {",
      "  drawSprite(2, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Flag",
    addBitmap(project, "Flag", "goal"),
    [
      "field x = 220;",
      "field y = 160;",
      "field hx = 0;",
      "field hy = 0;",
      "",
      "behavior move(self) {",
      "  drawSprite(3, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  );
  addSound(project, "Jump", 0, 30, 5, "se");
  addSound(project, "Goal", 0, 40, 20, "se");
  addLoopBgm(project, "StageBgm");
  const skyId = addBitmap(project, "Sky", "sky");

  const title = mainScene(project);
  title.name = "Title";
  title.legacyCode = [
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

  const main = addScene(project, "Main");
  main.backgroundBitmapId = skyId;
  main.legacyCode = [
    "instance mario: Mario;",
    "instance block: Block;",
    "instance flag: Flag;",
    "",
    "function init() {",
    "  setPalette(0, 1, 33, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 16, 0, 0);",
    `  fillBackground(${BACKGROUND_TILE_BASE});`,
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

  const clear = addScene(project, "Clear");
  clear.legacyCode = [
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

  place(project, "Mario", 40, 180, "Main");
  place(project, "Block", 120, 180, "Main");
  place(project, "Flag", 220, 160, "Main");
  return project;
}

function buildShmup(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "縦スクロールシューティング";
  addCharacter(
    project,
    "Ship",
    addBitmap(project, "Ship", "player"),
    [
      "field x = 120;",
      "field y = 200;",
      "field hx = 0;",
      "field hy = 0;",
      "field hit = 0;",
      "",
      "behavior move(self) {",
      "  if (btn.left) { self.x -= 2; }",
      "  if (btn.right) { self.x += 2; }",
      "  if (btn.up) { self.y -= 2; }",
      "  if (btn.down) { self.y += 2; }",
      "  if (self.x < 8) { self.x = 8; }",
      "  if (self.x > 240) { self.x = 240; }",
      "  if (self.y < 16) { self.y = 16; }",
      "  if (self.y > 220) { self.y = 220; }",
      "  drawSprite(0, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Bullet",
    addBitmap(project, "Bullet", "bullet"),
    [
      "field x = 0;",
      "field y = 0;",
      "field active = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "field hit = 0;",
      "",
      "behavior move(self) {",
      "  if (self.active) {",
      "    self.y -= 4;",
      "    if (self.y < 8) { self.active = 0; }",
      "    drawSprite(1, self.x, self.y, 0, 0);",
      "  }",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Alien",
    addBitmap(project, "Alien", "enemy"),
    [
      "field x = 80;",
      "field y = 20;",
      "field goingRight = 1;",
      "field hx = 0;",
      "field hy = 0;",
      "",
      "behavior move(self) {",
      "  self.y += 1;",
      "  if (self.goingRight) { self.x += 1; } else { self.x -= 1; }",
      "  if (self.x > 200) { self.goingRight = 0; }",
      "  if (self.x < 40) { self.goingRight = 1; }",
      "  if (self.y > 220) { self.y = 10; self.x = 80; }",
      "  drawSprite(2, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addSound(project, "Shot", 0, 40, 4);
  addSound(project, "Hit", 1, 12, 8);

  mainScene(project).legacyCode = [
    "instance ship: Ship;",
    "instance bullet: Bullet;",
    "instance alien: Alien;",
    "",
    "function init() {",
    "  setPalette(0, 1, 12, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 22, 0, 0);",
    "}",
    "",
    "function update() {",
    "  Ship.move(ship);",
    "  if (btn.a_just_pressed) {",
    "    if (bullet.active) { } else {",
    "      bullet.active = 1;",
    "      bullet.x = ship.x;",
    "      bullet.y = ship.y;",
    "      playTone(0, 40, 4);",
    "    }",
    "  }",
    "  Bullet.move(bullet);",
    "  Alien.move(alien);",
    "  if (bullet.active) {",
    hitNearX("bullet", "alien", [
      "alien.y = 10;",
      "alien.x = 160;",
      "bullet.active = 0;",
      "playTone(1, 12, 8);",
    ]),
    "  }",
    hitNearX("ship", "alien", ["ship.x = 120;", "ship.y = 200;", "alien.y = 20;"]),
    "}",
  ].join("\n");

  place(project, "Ship", 120, 200);
  place(project, "Bullet", 0, 0);
  place(project, "Alien", 80, 20);
  return project;
}

function buildFighter(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "格闘ゲーム風";
  addCharacter(
    project,
    "Fighter1",
    addBitmap(project, "Fighter1", "fighter"),
    [
      "field x = 60;",
      "field y = 180;",
      "field hp = 5;",
      "field punch = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "field hit = 0;",
      "",
      "behavior move(self) {",
      "  if (btn.right) { self.x += 2; }",
      "  if (btn.left) { self.x -= 2; }",
      "  if (btn.a_just_pressed) { self.punch = 8; playTone(0, 20, 4); }",
      "  if (self.punch > 0) { self.punch -= 1; }",
      "  if (self.x < 16) { self.x = 16; }",
      "  if (self.x > 200) { self.x = 200; }",
      "  drawSprite(0, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Fighter2",
    addBitmap(project, "Fighter2", "fighter"),
    [
      "field x = 180;",
      "field y = 180;",
      "field hp = 5;",
      "field punch = 0;",
      "field cool = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "field hit = 0;",
      "",
      "behavior move(self) {",
      "  if (self.cool > 0) { self.cool -= 1; }",
      "  if (self.punch > 0) { self.punch -= 1; }",
      "  drawSprite(1, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addSound(project, "Punch", 0, 20, 4);
  addSound(project, "Hit", 1, 10, 6);

  mainScene(project).legacyCode = [
    "instance p1: Fighter1;",
    "instance p2: Fighter2;",
    "",
    "function init() {",
    "  setPalette(0, 1, 33, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 22, 0, 0);",
    "}",
    "",
    "function update() {",
    "  Fighter1.move(p1);",
    "  if (p2.x > p1.x) { p2.x -= 1; } else { p2.x += 1; }",
    "  if (p2.cool) { } else {",
    "    p1.hx = p1.x;",
    "    p1.hx += 20;",
    "    p2.hx = p2.x;",
    "    p2.hx += 20;",
    "    if (p2.x > p1.x) {",
    "      if (p2.x < p1.hx) { p2.punch = 8; p2.cool = 40; }",
    "    } else {",
    "      if (p1.x < p2.hx) { p2.punch = 8; p2.cool = 40; }",
    "    }",
    "  }",
    "  Fighter2.move(p2);",
    "  if (p1.punch > 0) {",
    hitNearX("p1", "p2", ["p2.hp -= 1;", "p1.punch = 0;", "playTone(1, 10, 6);"]),
    "  }",
    "  if (p2.punch > 0) {",
    hitNearX("p2", "p1", ["p1.hp -= 1;", "p2.punch = 0;", "playTone(1, 10, 6);"]),
    "  }",
    "  if (p1.hp < 1) { p1.x = 60; p1.hp = 5; p2.x = 180; p2.hp = 5; }",
    "  if (p2.hp < 1) { p1.x = 60; p1.hp = 5; p2.x = 180; p2.hp = 5; }",
    "}",
  ].join("\n");

  place(project, "Fighter1", 60, 180);
  place(project, "Fighter2", 180, 180);
  return project;
}

function buildRpg(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "初期型 RPG 風";
  addCharacter(
    project,
    "Hero",
    addBitmap(project, "Hero", "player"),
    [
      "field x = 64;",
      "field y = 64;",
      "field cool = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "field hit = 0;",
      "",
      "behavior move(self) {",
      "  if (self.cool > 0) { self.cool -= 1; } else {",
      "    if (btn.right) { self.x += 8; self.cool = 8; }",
      "    if (btn.left) { self.x -= 8; self.cool = 8; }",
      "    if (btn.up) { self.y -= 8; self.cool = 8; }",
      "    if (btn.down) { self.y += 8; self.cool = 8; }",
      "  }",
      "  if (self.x < 16) { self.x = 16; }",
      "  if (self.x > 232) { self.x = 232; }",
      "  if (self.y < 16) { self.y = 16; }",
      "  if (self.y > 200) { self.y = 200; }",
      "  drawSprite(0, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Npc",
    addBitmap(project, "Npc", "npc"),
    [
      "field x = 160;",
      "field y = 96;",
      "field talk = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "",
      "behavior move(self) {",
      "  drawSprite(1, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addSound(project, "Step", 0, 16, 3);
  addSound(project, "Talk", 0, 32, 10);

  mainScene(project).legacyCode = [
    "instance hero: Hero;",
    "instance npc: Npc;",
    "",
    "function init() {",
    "  setPalette(0, 1, 17, 0, 0);",
    "  setSpritePalette(0, 1, 34, 0, 0);",
    "  setSpritePalette(1, 1, 39, 0, 0);",
    "}",
    "",
    "function update() {",
    "  Hero.move(hero);",
    "  Npc.move(npc);",
    "  npc.talk = 0;",
    hitNearX("hero", "npc", ["npc.talk = 1;", "playTone(0, 32, 10);"]),
    "}",
  ].join("\n");

  place(project, "Hero", 64, 64);
  place(project, "Npc", 160, 96);
  return project;
}

function buildChase(opts: BuildOpts): ProjectV3 {
  const project = createEmptyProjectV3(opts.mapperId ?? 0);
  project.title = opts.title ?? "追いかけっこ";
  addCharacter(
    project,
    "Pac",
    addBitmap(project, "Pac", "player"),
    [
      "field x = 120;",
      "field y = 120;",
      "field hx = 0;",
      "field hy = 0;",
      "field hit = 0;",
      "",
      "behavior move(self) {",
      "  if (btn.right) { self.x += 2; }",
      "  if (btn.left) { self.x -= 2; }",
      "  if (btn.up) { self.y -= 2; }",
      "  if (btn.down) { self.y += 2; }",
      "  if (self.x < 24) { self.x = 24; }",
      "  if (self.x > 224) { self.x = 224; }",
      "  if (self.y < 24) { self.y = 24; }",
      "  if (self.y > 200) { self.y = 200; }",
      "  drawSprite(0, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Ghost",
    addBitmap(project, "Ghost", "ghost"),
    [
      "field x = 40;",
      "field y = 40;",
      "field hx = 0;",
      "field hy = 0;",
      "",
      "behavior move(self) {",
      "  drawSprite(1, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  );
  addCharacter(
    project,
    "Pellet",
    addBitmap(project, "Pellet", "dot"),
    [
      "field x = 200;",
      "field y = 40;",
      "field taken = 0;",
      "field hx = 0;",
      "field hy = 0;",
      "",
      "behavior move(self) {",
      "  if (self.taken) { } else { drawSprite(2, self.x, self.y, 0, 0); }",
      "}",
    ].join("\n"),
  );
  addSound(project, "Chomp", 0, 24, 4);
  addSound(project, "Caught", 1, 8, 12);

  mainScene(project).legacyCode = [
    "instance pac: Pac;",
    "instance ghost: Ghost;",
    "instance pellet: Pellet;",
    "",
    "function init() {",
    "  setPalette(0, 1, 15, 0, 0);",
    "  setSpritePalette(0, 1, 40, 0, 0);",
    "  setSpritePalette(1, 1, 22, 0, 0);",
    "}",
    "",
    "function update() {",
    "  Pac.move(pac);",
    "  // ゴースト追尾",
    "  if (ghost.x > pac.x) { ghost.x -= 1; } else { ghost.x += 1; }",
    "  if (ghost.y > pac.y) { ghost.y -= 1; } else { ghost.y += 1; }",
    "  Ghost.move(ghost);",
    "  Pellet.move(pellet);",
    "  if (pellet.taken) { } else {",
    hitNearX("pac", "pellet", ["pellet.taken = 1;", "playTone(0, 24, 4);"]),
    "  }",
    hitNearX("pac", "ghost", [
      "pac.x = 120;",
      "pac.y = 120;",
      "ghost.x = 40;",
      "ghost.y = 40;",
      "playTone(1, 8, 12);",
    ]),
    "}",
  ].join("\n");

  place(project, "Pac", 120, 120);
  place(project, "Ghost", 40, 40);
  place(project, "Pellet", 200, 40);
  return project;
}

/** テンプレート ID から ProjectV3 を生成する。 */
export function buildTemplateProjectV3(id: CreateTemplateId, opts: BuildOpts = {}): ProjectV3 {
  switch (id) {
    case "empty":
      return buildEmpty(opts);
    case "starter":
      return buildStarter(opts);
    case "platformer":
      return buildPlatformer(opts);
    case "side_scroll":
      return buildSideScroll(opts);
    case "shmup":
      return buildShmup(opts);
    case "fighter":
      return buildFighter(opts);
    case "rpg":
      return buildRpg(opts);
    case "chase":
      return buildChase(opts);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function isCreateTemplateId(value: string): value is CreateTemplateId {
  return CREATE_TEMPLATES.some((t) => t.id === value);
}
