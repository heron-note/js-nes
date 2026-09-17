import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as Ja from "blockly/msg/ja";
import { defineFamiJsBlocks } from "./definitions.js";
import { generateSource } from "./generator.js";
import { FAMIJS_TOOLBOX } from "./toolbox.js";

Blockly.setLocale(Ja as unknown as { [key: string]: string });
defineFamiJsBlocks();

export function initBlockEditor(container: HTMLElement): Blockly.WorkspaceSvg {
  const workspace = Blockly.inject(container, {
    toolbox: FAMIJS_TOOLBOX,
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

/**
 * 初回表示用のサンプル：apps/web/src/main.ts の SAMPLE_SOURCE と同等の動きをするブロック構成。
 * タイル0番＝自機（キー操作）、タイル1番＝もう1体（自動で左右に動く）の2体を表示し、
 * 「複数のタイル番号を使えば複数のキャラクターを同時に出せる」ことを最初から示す。
 */
export function loadDefaultWorkspace(workspace: Blockly.WorkspaceSvg): void {
  workspace.clear();

  const letX = newBlock(workspace, "fjs_let");
  letX.setFieldValue("x", "NAME");
  letX.setFieldValue(120, "VALUE");
  const letY = newBlock(workspace, "fjs_let");
  letY.setFieldValue("y", "NAME");
  letY.setFieldValue(100, "VALUE");
  const letEx = newBlock(workspace, "fjs_let");
  letEx.setFieldValue("ex", "NAME");
  letEx.setFieldValue(200, "VALUE");
  const letEy = newBlock(workspace, "fjs_let");
  letEy.setFieldValue("ey", "NAME");
  letEy.setFieldValue(50, "VALUE");
  const letExGoingRight = newBlock(workspace, "fjs_let");
  letExGoingRight.setFieldValue("exGoingRight", "NAME");
  letExGoingRight.setFieldValue(0, "VALUE");
  stack(letX, letY, letEx, letEy, letExGoingRight);
  letX.moveBy(20, 20);

  const initEvent = newBlock(workspace, "fjs_event_init");
  initEvent.moveBy(20, 160);
  const setPal = newBlock(workspace, "fjs_call_setpalette");
  setPal.setFieldValue(0, "SLOT");
  setPal.setFieldValue(1, "C0");
  setPal.setFieldValue(33, "C1");
  const setSpritePal = newBlock(workspace, "fjs_call_setspritepalette");
  setSpritePal.setFieldValue(0, "SLOT");
  setSpritePal.setFieldValue(1, "C0");
  setSpritePal.setFieldValue(34, "C1");
  const setSpritePal2 = newBlock(workspace, "fjs_call_setspritepalette");
  setSpritePal2.setFieldValue(1, "SLOT");
  setSpritePal2.setFieldValue(1, "C0");
  setSpritePal2.setFieldValue(22, "C1");
  stack(setPal, setSpritePal, setSpritePal2);
  initEvent.getInput("DO")!.connection!.connect(setPal.previousConnection!);

  const updateEvent = newBlock(workspace, "fjs_event_update");
  updateEvent.moveBy(20, 300);

  function ifBtnMove(name: string, varName: string, addBlockType: "fjs_assign_add" | "fjs_assign_sub"): Blockly.Block {
    const ifBlock = newBlock(workspace, "fjs_if");
    const btnBlock = newBlock(workspace, "fjs_btn");
    btnBlock.setFieldValue(name, "NAME");
    btnBlock.setFieldValue("held", "MODE");
    ifBlock.getInput("CONDITION")!.connection!.connect(btnBlock.outputConnection!);

    const assignBlock = newBlock(workspace, addBlockType);
    assignBlock.setFieldValue(varName, "NAME");
    assignBlock.setFieldValue(1, "NUM");
    ifBlock.getInput("DO")!.connection!.connect(assignBlock.previousConnection!);
    return ifBlock;
  }

  const ifRight = ifBtnMove("right", "x", "fjs_assign_add");
  const ifLeft = ifBtnMove("left", "x", "fjs_assign_sub");
  const ifUp = ifBtnMove("up", "y", "fjs_assign_sub");
  const ifDown = ifBtnMove("down", "y", "fjs_assign_add");

  const ifA = newBlock(workspace, "fjs_if");
  const btnA = newBlock(workspace, "fjs_btn");
  btnA.setFieldValue("a", "NAME");
  btnA.setFieldValue("just", "MODE");
  ifA.getInput("CONDITION")!.connection!.connect(btnA.outputConnection!);
  const playTone = newBlock(workspace, "fjs_call_playtone");
  playTone.setFieldValue("0", "CHANNEL");
  playTone.setFieldValue(24, "NOTE");
  playTone.setFieldValue(10, "DURATION");
  ifA.getInput("DO")!.connection!.connect(playTone.previousConnection!);

  // もう1体（tile1）を自動で左右に往復させる（Pongのボールと同じ「フラグで方向管理」パターン）
  const ifExGoingRight = newBlock(workspace, "fjs_if");
  const exGoingRightGet = newBlock(workspace, "fjs_var_truthy");
  exGoingRightGet.setFieldValue("exGoingRight", "NAME");
  ifExGoingRight.getInput("CONDITION")!.connection!.connect(exGoingRightGet.outputConnection!);
  const exAdd = newBlock(workspace, "fjs_assign_add");
  exAdd.setFieldValue("ex", "NAME");
  exAdd.setFieldValue(1, "NUM");
  ifExGoingRight.getInput("DO")!.connection!.connect(exAdd.previousConnection!);
  const exSub = newBlock(workspace, "fjs_assign_sub");
  exSub.setFieldValue("ex", "NAME");
  exSub.setFieldValue(1, "NUM");
  ifExGoingRight.getInput("ELSE")!.connection!.connect(exSub.previousConnection!);

  function ifExBoundary(op: string, compareValue: number, newFlagValue: number): Blockly.Block {
    const ifBlock = newBlock(workspace, "fjs_if");
    const compare = newBlock(workspace, "fjs_compare");
    compare.setFieldValue("ex", "NAME");
    compare.setFieldValue(op, "OP");
    const rightNum = newBlock(workspace, "fjs_number");
    rightNum.setFieldValue(compareValue, "VALUE");
    compare.getInput("RIGHT")!.connection!.connect(rightNum.outputConnection!);
    ifBlock.getInput("CONDITION")!.connection!.connect(compare.outputConnection!);

    const assign = newBlock(workspace, "fjs_assign");
    assign.setFieldValue("exGoingRight", "NAME");
    const valueNum = newBlock(workspace, "fjs_number");
    valueNum.setFieldValue(newFlagValue, "VALUE");
    assign.getInput("VALUE")!.connection!.connect(valueNum.outputConnection!);
    ifBlock.getInput("DO")!.connection!.connect(assign.previousConnection!);
    return ifBlock;
  }

  const ifExTooFarRight = ifExBoundary(">", 240, 0);
  const ifExTooFarLeft = ifExBoundary("<", 16, 1);

  const drawSprite = newBlock(workspace, "fjs_call_drawsprite");
  drawSprite.setFieldValue(0, "ID");
  drawSprite.setFieldValue(0, "TILE");
  drawSprite.setFieldValue(0, "PALETTE");
  const xGet = newBlock(workspace, "fjs_variable_get");
  xGet.setFieldValue("x", "NAME");
  const yGet = newBlock(workspace, "fjs_variable_get");
  yGet.setFieldValue("y", "NAME");
  drawSprite.getInput("X")!.connection!.connect(xGet.outputConnection!);
  drawSprite.getInput("Y")!.connection!.connect(yGet.outputConnection!);

  const drawSprite2 = newBlock(workspace, "fjs_call_drawsprite");
  drawSprite2.setFieldValue(1, "ID");
  drawSprite2.setFieldValue(1, "TILE");
  drawSprite2.setFieldValue(1, "PALETTE");
  const exGet = newBlock(workspace, "fjs_variable_get");
  exGet.setFieldValue("ex", "NAME");
  const eyGet = newBlock(workspace, "fjs_variable_get");
  eyGet.setFieldValue("ey", "NAME");
  drawSprite2.getInput("X")!.connection!.connect(exGet.outputConnection!);
  drawSprite2.getInput("Y")!.connection!.connect(eyGet.outputConnection!);

  stack(
    ifRight,
    ifLeft,
    ifUp,
    ifDown,
    ifA,
    ifExGoingRight,
    ifExTooFarRight,
    ifExTooFarLeft,
    drawSprite,
    drawSprite2,
  );
  updateEvent.getInput("DO")!.connection!.connect(ifRight.previousConnection!);
}

export { generateSource };
