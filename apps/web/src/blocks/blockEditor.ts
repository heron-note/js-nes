import * as Blockly from "blockly/core";
import { Theme, Themes } from "blockly";
import "blockly/blocks";
import * as Ja from "blockly/msg/ja";
import { defineFamiJsBlocks } from "./definitions.js";
import { generatePartBody, generateSceneBody, generateSource } from "./generator.js";
import { FAMIJS_TOOLBOX } from "./toolbox.js";

Blockly.setLocale(Ja as unknown as { [key: string]: string });
defineFamiJsBlocks();

/** 暗いアプリUIでもツールボックス文字が読めるダークテーマ。 */
const FAMIJS_DARK_THEME = Theme.defineTheme("famijs_dark", {
  name: "famijs_dark",
  base: Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#1a1e28",
    toolboxBackgroundColour: "#2a2e3a",
    toolboxForegroundColour: "#e8eaf0",
    flyoutBackgroundColour: "#222733",
    flyoutForegroundColour: "#e8eaf0",
    flyoutOpacity: 0.98,
    scrollbarColour: "#5a6070",
    scrollbarOpacity: 0.6,
    insertionMarkerColour: "#ffffff",
    insertionMarkerOpacity: 0.3,
  },
});

export function initBlockEditor(
  container: HTMLElement,
  toolbox: Blockly.utils.toolbox.ToolboxDefinition = FAMIJS_TOOLBOX,
): Blockly.WorkspaceSvg {
  const workspace = Blockly.inject(container, {
    toolbox,
    theme: FAMIJS_DARK_THEME,
    trashcan: true,
    zoom: { controls: true, wheel: true, startScale: 0.85 },
  });
  return workspace;
}

function stack(...blocks: Blockly.Block[]): Blockly.Block {
  for (let i = 0; i < blocks.length - 1; i++) {
    const cur = blocks[i]!;
    const next = blocks[i + 1]!;
    cur.nextConnection!.connect(next.previousConnection!);
  }
  return blocks[0]!;
}

function newBlock(workspace: Blockly.WorkspaceSvg, type: string): Blockly.Block {
  const block = workspace.newBlock(type);
  block.initSvg();
  block.render();
  return block;
}

function plugValue(parent: Blockly.Block, inputName: string, child: Blockly.Block): void {
  parent.getInput(inputName)!.connection!.connect(child.outputConnection!);
}

function plugStatement(parent: Blockly.Block, inputName: string, child: Blockly.Block): void {
  parent.getInput(inputName)!.connection!.connect(child.previousConnection!);
}

/**
 * サンプル「Player」パーツ相当のブロック（field + behavior move）。
 * createDefaultProject のコードと対になる。
 */
export function loadDefaultPlayerPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  workspace.clear();

  const fieldX = newBlock(workspace, "fjs_field_decl");
  fieldX.setFieldValue("x", "NAME");
  fieldX.setFieldValue(120, "VALUE");
  const fieldY = newBlock(workspace, "fjs_field_decl");
  fieldY.setFieldValue("y", "NAME");
  fieldY.setFieldValue(100, "VALUE");

  const behavior = newBlock(workspace, "fjs_behavior_decl");
  behavior.setFieldValue("move", "NAME");

  function ifBtnMove(btn: string, field: string, op: "fjs_self_field_add" | "fjs_self_field_sub"): Blockly.Block {
    const ifBlock = newBlock(workspace, "fjs_if");
    const btnBlock = newBlock(workspace, "fjs_btn");
    btnBlock.setFieldValue(btn, "NAME");
    btnBlock.setFieldValue("held", "MODE");
    plugValue(ifBlock, "CONDITION", btnBlock);
    const assign = newBlock(workspace, op);
    assign.setFieldValue(field, "FIELD");
    assign.setFieldValue(1, "NUM");
    plugStatement(ifBlock, "DO", assign);
    return ifBlock;
  }

  const ifRight = ifBtnMove("right", "x", "fjs_self_field_add");
  const ifLeft = ifBtnMove("left", "x", "fjs_self_field_sub");
  const ifUp = ifBtnMove("up", "y", "fjs_self_field_sub");
  const ifDown = ifBtnMove("down", "y", "fjs_self_field_add");

  const ifA = newBlock(workspace, "fjs_if");
  const btnA = newBlock(workspace, "fjs_btn");
  btnA.setFieldValue("a", "NAME");
  btnA.setFieldValue("just", "MODE");
  plugValue(ifA, "CONDITION", btnA);
  const playTone = newBlock(workspace, "fjs_call_playtone");
  playTone.setFieldValue("0", "CHANNEL");
  playTone.setFieldValue(24, "NOTE");
  playTone.setFieldValue(10, "DURATION");
  plugStatement(ifA, "DO", playTone);

  const drawSprite = newBlock(workspace, "fjs_call_drawsprite");
  drawSprite.setFieldValue(0, "ID");
  drawSprite.setFieldValue(0, "TILE");
  drawSprite.setFieldValue(0, "PALETTE");
  const xGet = newBlock(workspace, "fjs_self_field_get");
  xGet.setFieldValue("x", "FIELD");
  const yGet = newBlock(workspace, "fjs_self_field_get");
  yGet.setFieldValue("y", "FIELD");
  plugValue(drawSprite, "X", xGet);
  plugValue(drawSprite, "Y", yGet);

  stack(ifRight, ifLeft, ifUp, ifDown, ifA, drawSprite);
  plugStatement(behavior, "DO", ifRight);
  stack(fieldX, fieldY, behavior);
  fieldX.moveBy(20, 20);
}

/**
 * サンプル「Mover」パーツ相当のブロック（自動で左右往復）。
 */
export function loadDefaultMoverPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  workspace.clear();

  const fieldX = newBlock(workspace, "fjs_field_decl");
  fieldX.setFieldValue("x", "NAME");
  fieldX.setFieldValue(200, "VALUE");
  const fieldY = newBlock(workspace, "fjs_field_decl");
  fieldY.setFieldValue("y", "NAME");
  fieldY.setFieldValue(50, "VALUE");
  const fieldGoing = newBlock(workspace, "fjs_field_decl");
  fieldGoing.setFieldValue("goingRight", "NAME");
  fieldGoing.setFieldValue(0, "VALUE");

  const behavior = newBlock(workspace, "fjs_behavior_decl");
  behavior.setFieldValue("move", "NAME");

  const ifGoing = newBlock(workspace, "fjs_if");
  const goingGet = newBlock(workspace, "fjs_self_field_get");
  goingGet.setFieldValue("goingRight", "FIELD");
  plugValue(ifGoing, "CONDITION", goingGet);
  const xAdd = newBlock(workspace, "fjs_self_field_add");
  xAdd.setFieldValue("x", "FIELD");
  xAdd.setFieldValue(1, "NUM");
  plugStatement(ifGoing, "DO", xAdd);
  const xSub = newBlock(workspace, "fjs_self_field_sub");
  xSub.setFieldValue("x", "FIELD");
  xSub.setFieldValue(1, "NUM");
  plugStatement(ifGoing, "ELSE", xSub);

  function ifBoundary(op: string, value: number, flag: number): Blockly.Block {
    const ifBlock = newBlock(workspace, "fjs_if");
    const compare = newBlock(workspace, "fjs_compare_expr");
    compare.setFieldValue(op, "OP");
    const left = newBlock(workspace, "fjs_self_field_get");
    left.setFieldValue("x", "FIELD");
    const right = newBlock(workspace, "fjs_number");
    right.setFieldValue(value, "VALUE");
    plugValue(compare, "LEFT", left);
    plugValue(compare, "RIGHT", right);
    plugValue(ifBlock, "CONDITION", compare);
    const assign = newBlock(workspace, "fjs_self_field_set");
    assign.setFieldValue("goingRight", "FIELD");
    const num = newBlock(workspace, "fjs_number");
    num.setFieldValue(flag, "VALUE");
    plugValue(assign, "VALUE", num);
    plugStatement(ifBlock, "DO", assign);
    return ifBlock;
  }

  const ifRightEdge = ifBoundary(">", 240, 0);
  const ifLeftEdge = ifBoundary("<", 16, 1);

  const drawSprite = newBlock(workspace, "fjs_call_drawsprite");
  drawSprite.setFieldValue(1, "ID");
  drawSprite.setFieldValue(1, "TILE");
  drawSprite.setFieldValue(1, "PALETTE");
  const xGet = newBlock(workspace, "fjs_self_field_get");
  xGet.setFieldValue("x", "FIELD");
  const yGet = newBlock(workspace, "fjs_self_field_get");
  yGet.setFieldValue("y", "FIELD");
  plugValue(drawSprite, "X", xGet);
  plugValue(drawSprite, "Y", yGet);

  stack(ifGoing, ifRightEdge, ifLeftEdge, drawSprite);
  plugStatement(behavior, "DO", ifGoing);
  stack(fieldX, fieldY, fieldGoing, behavior);
  fieldX.moveBy(20, 20);
}

/**
 * サンプル「Main」シーン相当のブロック。
 */
export function loadDefaultMainSceneBlocks(workspace: Blockly.WorkspaceSvg): void {
  workspace.clear();

  const instPlayer = newBlock(workspace, "fjs_instance_decl");
  instPlayer.setFieldValue("player", "NAME");
  instPlayer.setFieldValue("Player", "PARTTYPE");
  const instMover = newBlock(workspace, "fjs_instance_decl");
  instMover.setFieldValue("mover", "NAME");
  instMover.setFieldValue("Mover", "PARTTYPE");

  const init = newBlock(workspace, "fjs_scene_event_init");
  const setPal = newBlock(workspace, "fjs_call_setpalette");
  setPal.setFieldValue(0, "SLOT");
  setPal.setFieldValue(1, "C0");
  setPal.setFieldValue(33, "C1");
  const setSp0 = newBlock(workspace, "fjs_call_setspritepalette");
  setSp0.setFieldValue(0, "SLOT");
  setSp0.setFieldValue(1, "C0");
  setSp0.setFieldValue(34, "C1");
  const setSp1 = newBlock(workspace, "fjs_call_setspritepalette");
  setSp1.setFieldValue(1, "SLOT");
  setSp1.setFieldValue(1, "C0");
  setSp1.setFieldValue(22, "C1");
  stack(setPal, setSp0, setSp1);
  plugStatement(init, "DO", setPal);

  const update = newBlock(workspace, "fjs_scene_event_update");
  const callPlayer = newBlock(workspace, "fjs_call_behavior");
  callPlayer.setFieldValue("Player", "PARTTYPE");
  callPlayer.setFieldValue("move", "BEHAVIOR");
  callPlayer.setFieldValue("player", "INSTANCE");
  const callMover = newBlock(workspace, "fjs_call_behavior");
  callMover.setFieldValue("Mover", "PARTTYPE");
  callMover.setFieldValue("move", "BEHAVIOR");
  callMover.setFieldValue("mover", "INSTANCE");
  stack(callPlayer, callMover);
  plugStatement(update, "DO", callPlayer);

  stack(instPlayer, instMover);
  instPlayer.moveBy(20, 20);
  init.moveBy(20, 120);
  update.moveBy(20, 280);
}

/** @deprecated Phase 6 以前のフラット構成用。パーツ/シーン用シードを使うこと。 */
export function loadDefaultWorkspace(workspace: Blockly.WorkspaceSvg): void {
  loadDefaultPlayerPartBlocks(workspace);
}

// --- テンプレート用シード（platformer）のための小さな組み立てヘルパー ---

function fieldDecl(ws: Blockly.WorkspaceSvg, name: string, value: number): Blockly.Block {
  const b = newBlock(ws, "fjs_field_decl");
  b.setFieldValue(name, "NAME");
  b.setFieldValue(value, "VALUE");
  return b;
}

function numBlock(ws: Blockly.WorkspaceSvg, value: number): Blockly.Block {
  const b = newBlock(ws, "fjs_number");
  b.setFieldValue(value, "VALUE");
  return b;
}

function selfGet(ws: Blockly.WorkspaceSvg, field: string): Blockly.Block {
  const b = newBlock(ws, "fjs_self_field_get");
  b.setFieldValue(field, "FIELD");
  return b;
}

function selfSet(ws: Blockly.WorkspaceSvg, field: string, value: number): Blockly.Block {
  const b = newBlock(ws, "fjs_self_field_set");
  b.setFieldValue(field, "FIELD");
  plugValue(b, "VALUE", numBlock(ws, value));
  return b;
}

function selfAdd(ws: Blockly.WorkspaceSvg, field: string, num: number): Blockly.Block {
  const b = newBlock(ws, "fjs_self_field_add");
  b.setFieldValue(field, "FIELD");
  b.setFieldValue(num, "NUM");
  return b;
}

function selfSub(ws: Blockly.WorkspaceSvg, field: string, num: number): Blockly.Block {
  const b = newBlock(ws, "fjs_self_field_sub");
  b.setFieldValue(field, "FIELD");
  b.setFieldValue(num, "NUM");
  return b;
}

function btnCond(ws: Blockly.WorkspaceSvg, name: string, mode: "held" | "just"): Blockly.Block {
  const b = newBlock(ws, "fjs_btn");
  b.setFieldValue(name, "NAME");
  b.setFieldValue(mode, "MODE");
  return b;
}

function selfCompare(ws: Blockly.WorkspaceSvg, field: string, op: string, value: number): Blockly.Block {
  const b = newBlock(ws, "fjs_compare_expr");
  b.setFieldValue(op, "OP");
  plugValue(b, "LEFT", selfGet(ws, field));
  plugValue(b, "RIGHT", numBlock(ws, value));
  return b;
}

function ifStmt(
  ws: Blockly.WorkspaceSvg,
  cond: Blockly.Block,
  doBlocks: Blockly.Block[],
  elseBlocks?: Blockly.Block[],
): Blockly.Block {
  const b = newBlock(ws, "fjs_if");
  plugValue(b, "CONDITION", cond);
  if (doBlocks.length > 0) plugStatement(b, "DO", stack(...doBlocks));
  if (elseBlocks && elseBlocks.length > 0) plugStatement(b, "ELSE", stack(...elseBlocks));
  return b;
}

function drawSpriteStmt(
  ws: Blockly.WorkspaceSvg,
  id: number,
  x: Blockly.Block,
  y: Blockly.Block,
  tile: number,
  palette: number,
): Blockly.Block {
  const b = newBlock(ws, "fjs_call_drawsprite");
  b.setFieldValue(id, "ID");
  b.setFieldValue(tile, "TILE");
  b.setFieldValue(palette, "PALETTE");
  plugValue(b, "X", x);
  plugValue(b, "Y", y);
  return b;
}

function drawSpriteFlipStmt(
  ws: Blockly.WorkspaceSvg,
  id: number,
  x: Blockly.Block,
  y: Blockly.Block,
  tile: number,
  palette: number,
  flip: number,
): Blockly.Block {
  const b = newBlock(ws, "fjs_call_drawspriteflip");
  b.setFieldValue(id, "ID");
  b.setFieldValue(tile, "TILE");
  b.setFieldValue(palette, "PALETTE");
  b.setFieldValue(String(flip), "FLIP");
  plugValue(b, "X", x);
  plugValue(b, "Y", y);
  return b;
}

function playToneStmt(ws: Blockly.WorkspaceSvg, channel: number, note: number, duration: number): Blockly.Block {
  const b = newBlock(ws, "fjs_call_playtone");
  b.setFieldValue(String(channel), "CHANNEL");
  b.setFieldValue(note, "NOTE");
  b.setFieldValue(duration, "DURATION");
  return b;
}

function playSoundStmt(ws: Blockly.WorkspaceSvg, name: string): Blockly.Block {
  const b = newBlock(ws, "fjs_call_playsound");
  b.setFieldValue(name, "NAME");
  return b;
}

/** フィールド群＋behavior move を1パーツ分組み立てる。呼び出し側で先に workspace.clear() すること。 */
function partShell(
  ws: Blockly.WorkspaceSvg,
  fields: [string, number][],
  body: Blockly.Block[],
): void {
  const behavior = newBlock(ws, "fjs_behavior_decl");
  behavior.setFieldValue("move", "NAME");
  plugStatement(behavior, "DO", stack(...body));
  const fieldBlocks = fields.map(([n, v]) => fieldDecl(ws, n, v));
  const top = stack(...fieldBlocks, behavior);
  top.moveBy(20, 20);
}

/**
 * platformer テンプレ「Hero」相当のブロック。dslHeroPlatformerMove の生成コードと対になる。
 */
export function loadPlatformerHeroPartBlocks(
  workspace: Blockly.WorkspaceSvg,
  opts: { groundY: number; spriteId: number; walkSpeed: number; dashSpeed: number; jumpFrames: number },
): void {
  const ws = workspace;
  ws.clear();
  const groundY = opts.groundY;
  const sid = opts.spriteId;

  const moveRight = ifStmt(ws, btnCond(ws, "right", "held"), [
    ifStmt(ws, btnCond(ws, "b", "held"), [selfAdd(ws, "x", opts.dashSpeed)], [selfAdd(ws, "x", opts.walkSpeed)]),
    selfSet(ws, "facing", 0),
    selfSet(ws, "moving", 1),
  ]);
  const moveLeft = ifStmt(ws, btnCond(ws, "left", "held"), [
    ifStmt(ws, btnCond(ws, "b", "held"), [selfSub(ws, "x", opts.dashSpeed)], [selfSub(ws, "x", opts.walkSpeed)]),
    selfSet(ws, "facing", 1),
    selfSet(ws, "moving", 1),
  ]);
  const jumpStart = ifStmt(ws, btnCond(ws, "a", "just"), [
    ifStmt(ws, selfGet(ws, "onGround"), [
      selfSet(ws, "jumpLeft", opts.jumpFrames),
      selfSet(ws, "onGround", 0),
      playToneStmt(ws, 0, 28, 6),
    ]),
  ]);
  const riseFall = ifStmt(
    ws,
    selfCompare(ws, "jumpLeft", ">", 0),
    [selfSub(ws, "y", 3), selfSub(ws, "jumpLeft", 1)],
    [selfAdd(ws, "y", 2)],
  );
  const land = ifStmt(ws, selfCompare(ws, "y", ">", groundY), [
    selfSet(ws, "y", groundY),
    selfSet(ws, "onGround", 1),
  ]);
  const clampLeft = ifStmt(ws, selfCompare(ws, "x", "<", 8), [selfSet(ws, "x", 8)]);
  const clampRight = ifStmt(ws, selfCompare(ws, "x", ">", 240), [selfSet(ws, "x", 240)]);
  const hurtTick = ifStmt(ws, selfCompare(ws, "hurt", ">", 0), [selfSub(ws, "hurt", 1)]);
  const walkTick = ifStmt(ws, selfGet(ws, "moving"), [selfAdd(ws, "walk", 1)], [selfSet(ws, "walk", 0)]);
  const walkReset = ifStmt(ws, selfCompare(ws, "walk", ">", 15), [selfSet(ws, "walk", 0)]);
  const draw = ifStmt(
    ws,
    selfGet(ws, "facing"),
    [
      ifStmt(
        ws,
        selfCompare(ws, "walk", ">", 7),
        [drawSpriteFlipStmt(ws, sid, selfGet(ws, "x"), selfGet(ws, "y"), 1, 0, 1)],
        [drawSpriteFlipStmt(ws, sid, selfGet(ws, "x"), selfGet(ws, "y"), 0, 0, 1)],
      ),
    ],
    [
      ifStmt(
        ws,
        selfCompare(ws, "walk", ">", 7),
        [drawSpriteStmt(ws, sid, selfGet(ws, "x"), selfGet(ws, "y"), 1, 0)],
        [drawSpriteStmt(ws, sid, selfGet(ws, "x"), selfGet(ws, "y"), 0, 0)],
      ),
    ],
  );

  partShell(
    ws,
    [
      ["x", 40],
      ["y", groundY],
      ["onGround", 1],
      ["jumpLeft", 0],
      ["facing", 0],
      ["walk", 0],
      ["moving", 0],
      ["hx", 0],
      ["hy", 0],
      ["hit", 0],
      ["hurt", 0],
    ],
    [
      selfSet(ws, "moving", 0),
      moveRight,
      moveLeft,
      jumpStart,
      riseFall,
      land,
      clampLeft,
      clampRight,
      hurtTick,
      walkTick,
      walkReset,
      draw,
    ],
  );
}

/** platformer テンプレ「Goomba」相当のブロック（左右往復）。 */
export function loadPlatformerGoombaPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  partShell(
    ws,
    [
      ["x", 160],
      ["y", 180],
      ["goingRight", 0],
      ["hx", 0],
      ["hy", 0],
    ],
    [
      ifStmt(ws, selfGet(ws, "goingRight"), [selfAdd(ws, "x", 1)], [selfSub(ws, "x", 1)]),
      ifStmt(ws, selfCompare(ws, "x", ">", 220), [selfSet(ws, "goingRight", 0)]),
      ifStmt(ws, selfCompare(ws, "x", "<", 80), [selfSet(ws, "goingRight", 1)]),
      drawSpriteStmt(ws, 1, selfGet(ws, "x"), selfGet(ws, "y"), 0, 1),
    ],
  );
}

/** platformer テンプレ「Coin」相当のブロック（取られたら消える）。 */
export function loadPlatformerCoinPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  partShell(
    ws,
    [
      ["x", 100],
      ["y", 140],
      ["taken", 0],
      ["hx", 0],
      ["hy", 0],
    ],
    [
      ifStmt(ws, selfGet(ws, "taken"), [], [
        drawSpriteStmt(ws, 2, selfGet(ws, "x"), selfGet(ws, "y"), 0, 0),
      ]),
    ],
  );
}

// --- テンプレート用シード（platformer シーン）のための組み立てヘルパー ---

function instDecl(ws: Blockly.WorkspaceSvg, name: string, partType: string): Blockly.Block {
  const b = newBlock(ws, "fjs_instance_decl");
  b.setFieldValue(name, "NAME");
  b.setFieldValue(partType, "PARTTYPE");
  return b;
}

function instGet(ws: Blockly.WorkspaceSvg, instance: string, field: string): Blockly.Block {
  const b = newBlock(ws, "fjs_instance_field_get");
  b.setFieldValue(instance, "INSTANCE");
  b.setFieldValue(field, "FIELD");
  return b;
}

function instSet(ws: Blockly.WorkspaceSvg, instance: string, field: string, value: number): Blockly.Block {
  const b = newBlock(ws, "fjs_instance_field_set");
  b.setFieldValue(instance, "INSTANCE");
  b.setFieldValue(field, "FIELD");
  plugValue(b, "VALUE", numBlock(ws, value));
  return b;
}

function behaviorCall(ws: Blockly.WorkspaceSvg, partType: string, instance: string): Blockly.Block {
  const b = newBlock(ws, "fjs_call_behavior");
  b.setFieldValue(partType, "PARTTYPE");
  b.setFieldValue("move", "BEHAVIOR");
  b.setFieldValue(instance, "INSTANCE");
  return b;
}

function paletteStmt(
  ws: Blockly.WorkspaceSvg,
  sprite: boolean,
  slot: number,
  c0: number,
  c1: number,
): Blockly.Block {
  const b = newBlock(ws, sprite ? "fjs_call_setspritepalette" : "fjs_call_setpalette");
  b.setFieldValue(slot, "SLOT");
  b.setFieldValue(c0, "C0");
  b.setFieldValue(c1, "C1");
  b.setFieldValue(0, "C2");
  b.setFieldValue(0, "C3");
  return b;
}

function fillBgStmt(ws: Blockly.WorkspaceSvg, tile: number): Blockly.Block {
  const b = newBlock(ws, "fjs_call_fillbackground");
  b.setFieldValue(tile, "TILE");
  return b;
}

function setScrollStmt(ws: Blockly.WorkspaceSvg, x: Blockly.Block, y: Blockly.Block): Blockly.Block {
  const b = newBlock(ws, "fjs_call_setscroll");
  plugValue(b, "X", x);
  plugValue(b, "Y", y);
  return b;
}

function gotoSceneStmt(ws: Blockly.WorkspaceSvg, name: string): Blockly.Block {
  const b = newBlock(ws, "fjs_call_gotoscene");
  b.setFieldValue(name, "NAME");
  return b;
}

function overlapStmt(
  ws: Blockly.WorkspaceSvg,
  a: string,
  bName: string,
  size: number,
  body: Blockly.Block[],
): Blockly.Block {
  const b = newBlock(ws, "fjs_on_overlap");
  b.setFieldValue(a, "A");
  b.setFieldValue(bName, "B");
  b.setFieldValue(size, "SIZE");
  if (body.length > 0) plugStatement(b, "DO", stack(...body));
  return b;
}

/** インスタンス群＋init/update を1シーン分組み立てる。呼び出し側で先に workspace.clear() すること。 */
function sceneShell(
  ws: Blockly.WorkspaceSvg,
  instances: [string, string][],
  initBody: Blockly.Block[],
  updateBody: Blockly.Block[],
): void {
  const instBlocks = instances.map(([n, t]) => instDecl(ws, n, t));
  const init = newBlock(ws, "fjs_scene_event_init");
  if (initBody.length > 0) plugStatement(init, "DO", stack(...initBody));
  const update = newBlock(ws, "fjs_scene_event_update");
  if (updateBody.length > 0) plugStatement(update, "DO", stack(...updateBody));
  if (instBlocks.length > 0) stack(...instBlocks).moveBy(20, 20);
  init.moveBy(20, 120);
  update.moveBy(20, 280);
}

/** platformer テンプレ「Title」シーン相当のブロック。 */
export function loadPlatformerTitleSceneBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  sceneShell(
    ws,
    [["titleHero", "Hero"]],
    [
      paletteStmt(ws, false, 0, 1, 33),
      paletteStmt(ws, true, 0, 1, 34),
      fillBgStmt(ws, 0),
      instSet(ws, "titleHero", "x", 120),
      instSet(ws, "titleHero", "y", 140),
    ],
    [
      behaviorCall(ws, "Hero", "titleHero"),
      ifStmt(ws, btnCond(ws, "start", "just"), [gotoSceneStmt(ws, "Main")]),
    ],
  );
}

/** platformer テンプレ「Main」シーン相当のブロック。 */
export function loadPlatformerMainSceneBlocks(
  workspace: Blockly.WorkspaceSvg,
  opts: { hurtFrames: number },
): void {
  const ws = workspace;
  ws.clear();
  sceneShell(
    ws,
    [
      ["hero", "Hero"],
      ["goomba", "Goomba"],
      ["coin", "Coin"],
      ["ground", "Ground"],
    ],
    [
      paletteStmt(ws, false, 0, 1, 33),
      paletteStmt(ws, true, 0, 1, 34),
      paletteStmt(ws, true, 1, 1, 22),
      fillBgStmt(ws, 1),
      setScrollStmt(ws, numBlock(ws, 0), numBlock(ws, 0)),
      instSet(ws, "hero", "x", 40),
      instSet(ws, "hero", "y", 180),
      instSet(ws, "hero", "hurt", 0),
      instSet(ws, "coin", "taken", 0),
      playSoundStmt(ws, "StageBgm"),
    ],
    [
      behaviorCall(ws, "Hero", "hero"),
      behaviorCall(ws, "Goomba", "goomba"),
      behaviorCall(ws, "Coin", "coin"),
      behaviorCall(ws, "Ground", "ground"),
      setScrollStmt(ws, instGet(ws, "hero", "x"), numBlock(ws, 0)),
      ifStmt(ws, instGet(ws, "coin", "taken"), [], [
        overlapStmt(ws, "hero", "coin", 16, [
          instSet(ws, "coin", "taken", 1),
          playSoundStmt(ws, "CoinGet"),
        ]),
      ]),
      ifStmt(ws, instGet(ws, "hero", "hurt"), [], [
        overlapStmt(ws, "hero", "goomba", 16, [
          instSet(ws, "hero", "hurt", opts.hurtFrames),
          instSet(ws, "hero", "x", 40),
          playSoundStmt(ws, "Hurt"),
        ]),
      ]),
      ifStmt(ws, instGet(ws, "coin", "taken"), [
        ifStmt(ws, btnCond(ws, "start", "just"), [gotoSceneStmt(ws, "Clear")]),
      ]),
    ],
  );
}

/** platformer テンプレ「Clear」シーン相当のブロック。 */
export function loadPlatformerClearSceneBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  sceneShell(
    ws,
    [["clearHero", "Hero"]],
    [
      paletteStmt(ws, false, 0, 1, 33),
      paletteStmt(ws, true, 0, 1, 34),
      fillBgStmt(ws, 0),
      instSet(ws, "clearHero", "x", 120),
      instSet(ws, "clearHero", "y", 120),
      playToneStmt(ws, 0, 36, 20),
    ],
    [
      behaviorCall(ws, "Hero", "clearHero"),
      ifStmt(ws, btnCond(ws, "start", "just"), [gotoSceneStmt(ws, "Title")]),
    ],
  );
}

/** platformer テンプレ「Ground」相当のブロック（地面タイルを8枚並べる）。 */
export function loadPlatformerGroundPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  const draws: Blockly.Block[] = [];
  for (let i = 0; i < 8; i++) {
    draws.push(drawSpriteStmt(ws, 10 + i, numBlock(ws, 16 + i * 32), selfGet(ws, "y"), 0, 1));
  }
  partShell(
    ws,
    [
      ["x", 0],
      ["y", 188],
    ],
    draws,
  );
}

// --- テンプレート用シード（side_scroll） ---

/**
 * side_scroll テンプレ「Mario」相当のブロック。
 * 主人公の動きは platformer の Hero と同一（dslHeroPlatformerMove）なのでローダーを共用する。
 */
export function loadSideScrollMarioPartBlocks(
  workspace: Blockly.WorkspaceSvg,
  opts: { groundY: number; spriteId: number; walkSpeed: number; dashSpeed: number; jumpFrames: number },
): void {
  loadPlatformerHeroPartBlocks(workspace, opts);
}

/** side_scroll テンプレ「Block」相当のブロック（足場ブロックを描くだけ）。 */
export function loadSideScrollBlockPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  partShell(
    ws,
    [
      ["x", 120],
      ["y", 180],
    ],
    [drawSpriteStmt(ws, 2, selfGet(ws, "x"), selfGet(ws, "y"), 0, 1)],
  );
}

/** side_scroll テンプレ「Flag」相当のブロック（ゴールの旗を描くだけ）。 */
export function loadSideScrollFlagPartBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  partShell(
    ws,
    [
      ["x", 220],
      ["y", 160],
      ["hx", 0],
      ["hy", 0],
    ],
    [drawSpriteStmt(ws, 3, selfGet(ws, "x"), selfGet(ws, "y"), 0, 0)],
  );
}

/** side_scroll テンプレ「Title」シーン相当のブロック。 */
export function loadSideScrollTitleSceneBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  sceneShell(
    ws,
    [["titleMario", "Mario"]],
    [
      paletteStmt(ws, false, 0, 1, 33),
      paletteStmt(ws, true, 0, 1, 34),
      fillBgStmt(ws, 0),
      instSet(ws, "titleMario", "x", 120),
      instSet(ws, "titleMario", "y", 140),
    ],
    [
      behaviorCall(ws, "Mario", "titleMario"),
      ifStmt(ws, btnCond(ws, "start", "just"), [gotoSceneStmt(ws, "Main")]),
    ],
  );
}

/** side_scroll テンプレ「Main」シーン相当のブロック。 */
export function loadSideScrollMainSceneBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  sceneShell(
    ws,
    [
      ["mario", "Mario"],
      ["block", "Block"],
      ["flag", "Flag"],
    ],
    [
      paletteStmt(ws, false, 0, 1, 33),
      paletteStmt(ws, true, 0, 1, 34),
      paletteStmt(ws, true, 1, 1, 16),
      fillBgStmt(ws, 1),
      setScrollStmt(ws, numBlock(ws, 0), numBlock(ws, 0)),
      instSet(ws, "mario", "x", 40),
      instSet(ws, "mario", "y", 180),
      playSoundStmt(ws, "StageBgm"),
    ],
    [
      behaviorCall(ws, "Mario", "mario"),
      behaviorCall(ws, "Block", "block"),
      behaviorCall(ws, "Flag", "flag"),
      setScrollStmt(ws, instGet(ws, "mario", "x"), numBlock(ws, 0)),
      overlapStmt(ws, "mario", "flag", 16, [
        playSoundStmt(ws, "Goal"),
        gotoSceneStmt(ws, "Clear"),
      ]),
    ],
  );
}

/** side_scroll テンプレ「Clear」シーン相当のブロック。 */
export function loadSideScrollClearSceneBlocks(workspace: Blockly.WorkspaceSvg): void {
  const ws = workspace;
  ws.clear();
  sceneShell(
    ws,
    [["clearMario", "Mario"]],
    [
      paletteStmt(ws, false, 0, 1, 33),
      paletteStmt(ws, true, 0, 1, 34),
      fillBgStmt(ws, 0),
      instSet(ws, "clearMario", "x", 120),
      instSet(ws, "clearMario", "y", 120),
    ],
    [
      behaviorCall(ws, "Mario", "clearMario"),
      ifStmt(ws, btnCond(ws, "start", "just"), [gotoSceneStmt(ws, "Title")]),
    ],
  );
}

/**
 * ビットマップのタイル格子ぶん drawSprite をワークスペース末尾へ追加する。
 * 最大 4×4。X/Y は self.x+tx*8 / self.y+ty*8。
 */
export function appendMultiTileDrawSprites(
  workspace: Blockly.WorkspaceSvg,
  tileWidth: number,
  tileHeight: number,
  options: { spriteIdStart?: number; palette?: number } = {},
): number {
  const w = Math.max(1, Math.min(4, tileWidth | 0));
  const h = Math.max(1, Math.min(4, tileHeight | 0));
  const count = Math.min(16, w * h);
  const spriteIdStart = options.spriteIdStart ?? 0;
  const palette = options.palette ?? 0;

  const draws: Blockly.Block[] = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const tile = ty * w + tx;
      if (tile >= count) break;
      const draw = newBlock(workspace, "fjs_call_drawsprite");
      draw.setFieldValue(spriteIdStart + tile, "ID");
      draw.setFieldValue(tile, "TILE");
      draw.setFieldValue(palette, "PALETTE");
      const xOff = tx * 8;
      const yOff = ty * 8;
      if (xOff === 0) {
        const xGet = newBlock(workspace, "fjs_self_field_get");
        xGet.setFieldValue("x", "FIELD");
        plugValue(draw, "X", xGet);
      } else {
        const xGet = newBlock(workspace, "fjs_self_field_offset");
        xGet.setFieldValue("x", "FIELD");
        xGet.setFieldValue(xOff, "OFFSET");
        plugValue(draw, "X", xGet);
      }
      if (yOff === 0) {
        const yGet = newBlock(workspace, "fjs_self_field_get");
        yGet.setFieldValue("y", "FIELD");
        plugValue(draw, "Y", yGet);
      } else {
        const yGet = newBlock(workspace, "fjs_self_field_offset");
        yGet.setFieldValue("y", "FIELD");
        yGet.setFieldValue(yOff, "OFFSET");
        plugValue(draw, "Y", yGet);
      }
      draws.push(draw);
    }
  }

  const tops = workspace.getTopBlocks(true);
  let anchor: Blockly.Block | null = null;
  for (const top of tops) {
    let cur: Blockly.Block | null = top;
    while (cur?.getNextBlock()) cur = cur.getNextBlock();
    if (cur?.nextConnection) {
      anchor = cur;
      break;
    }
  }
  if (draws.length === 0) return 0;
  stack(...draws);
  if (anchor) {
    anchor.nextConnection!.connect(draws[0]!.previousConnection!);
  } else {
    draws[0]!.moveBy(20, 200);
  }
  return draws.length;
}

export function isEmptyBlockState(blocks: unknown): boolean {
  if (!blocks || typeof blocks !== "object") return true;
  // Blockly.serialization.workspaces.save の実形式は { blocks: { languageVersion, blocks: [...] } }。
  // 配列が直接入っている形（旧形式）も受け付ける。
  const state = blocks as { blocks?: { blocks?: unknown[] } | unknown[] };
  const list = Array.isArray(state.blocks) ? state.blocks : state.blocks?.blocks;
  return !Array.isArray(list) || list.length === 0;
}

/**
 * 画面外に一時ワークスペースを作ってシードし、シリアライズ結果を返す。
 * v3 サンプルに blocks を埋め込む／空資産の初期化に使う。
 */
export function capturePartBlockState(
  load: (workspace: Blockly.WorkspaceSvg) => void,
  toolbox: Blockly.utils.toolbox.ToolboxDefinition,
): { blocks: unknown; code: string } {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:640px;height:480px;opacity:0;pointer-events:none;";
  document.body.appendChild(host);
  const workspace = initBlockEditor(host, toolbox);
  try {
    load(workspace);
    return {
      blocks: Blockly.serialization.workspaces.save(workspace),
      code: generatePartBody(workspace),
    };
  } finally {
    workspace.dispose();
    host.remove();
  }
}

export function captureSceneBlockState(
  load: (workspace: Blockly.WorkspaceSvg) => void,
  toolbox: Blockly.utils.toolbox.ToolboxDefinition,
): { blocks: unknown; code: string } {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:640px;height:480px;opacity:0;pointer-events:none;";
  document.body.appendChild(host);
  const workspace = initBlockEditor(host, toolbox);
  try {
    load(workspace);
    return {
      blocks: Blockly.serialization.workspaces.save(workspace),
      code: generateSceneBody(workspace),
    };
  } finally {
    workspace.dispose();
    host.remove();
  }
}

export { generateSource, generatePartBody, generateSceneBody };
