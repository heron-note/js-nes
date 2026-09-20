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
  const state = blocks as { blocks?: unknown[] };
  return !Array.isArray(state.blocks) || state.blocks.length === 0;
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
