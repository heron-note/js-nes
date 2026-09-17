import { describe, expect, it, beforeAll } from "vitest";
import * as Blockly from "blockly/core";
import { BUTTON, Nes } from "@js-nes/emulator-core";
import { compile } from "@js-nes/dsl-compiler";
import { defineFamiJsBlocks } from "./definitions.js";
import { generateSource } from "./generator.js";

/**
 * DSL v1（シーン/パーツ構成モデル）Phase 4のゲート。
 * part/scene用の新規ブロックだけでPong相当のゲームを組み立て、生成されたDSLテキストが
 * 実際にコンパイル・実行できる（Phase 2の手書き出力と同等に動作する）ことを検証する。
 * ヘッドレスの Blockly.Workspace（SVG/DOM不使用）でブロックを組み立てる。
 * C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md のPhase 4参照。
 */

beforeAll(() => {
  defineFamiJsBlocks();
});

// RAM(SoA)アロケーション順（part宣言順→フィールド宣言順、$0300起点）に基づく。
// part Ball { field x; field goingRight; } → x=$0300, goingRight=$0301
// part Paddle { field y; } → y=$0302
const BALL_X = 0x0300;
const BALL_GOING_RIGHT = 0x0301;
const PADDLE_Y = 0x0302;

function block(workspace: Blockly.Workspace, type: string): Blockly.Block {
  return workspace.newBlock(type);
}

function stack(...blocks: Blockly.Block[]): Blockly.Block {
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i]!.nextConnection!.connect(blocks[i + 1]!.previousConnection!);
  }
  return blocks[0]!;
}

function plug(parent: Blockly.Block, inputName: string, child: Blockly.Block, useOutput = true): void {
  const parentConn = parent.getInput(inputName)!.connection!;
  const childConn = useOutput ? child.outputConnection! : child.previousConnection!;
  parentConn.connect(childConn);
}

/**
 * 起動シーケンス(2vblank待ち)にかかる正確なフレーム数に依存せず、
 * フィールドのinit値がRAMに反映される（BALL_Xが非0になる）まで1フレームずつ進める
 * （packages/dsl-compiler/src/games.test.ts の stepUntil と同じ考え方）。
 */
function stepUntil(nes: Nes, predicate: () => boolean, maxFrames = 20): void {
  for (let i = 0; i < maxFrames; i++) {
    if (predicate()) return;
    nes.runFrame();
  }
  throw new Error("stepUntil: exceeded maxFrames without predicate becoming true");
}

function bootedNes(source: string): Nes {
  const { rom } = compile(source);
  const nes = new Nes();
  nes.loadRom(rom);
  stepUntil(nes, () => nes.readCpuMemory(BALL_X) !== 0);
  return nes;
}

/** ヘッドレスのworkspaceにPong相当(part Ball/Paddle + scene Main)をブロックのみで組み立てる。 */
function buildPongV1Workspace(): Blockly.Workspace {
  const workspace = new Blockly.Workspace();

  // --- part Ball { field x=128; field goingRight=0; behavior move(self) {...} } ---
  const partBall = block(workspace, "fjs_part_decl");
  partBall.setFieldValue("Ball", "NAME");

  const fieldX = block(workspace, "fjs_field_decl");
  fieldX.setFieldValue("x", "NAME");
  fieldX.setFieldValue(128, "VALUE");
  const fieldGoingRight = block(workspace, "fjs_field_decl");
  fieldGoingRight.setFieldValue("goingRight", "NAME");
  fieldGoingRight.setFieldValue(0, "VALUE");

  const behaviorMove = block(workspace, "fjs_behavior_decl");
  behaviorMove.setFieldValue("move", "NAME");

  const ifGoingRight = block(workspace, "fjs_if");
  const selfGoingRightGet = block(workspace, "fjs_self_field_get");
  selfGoingRightGet.setFieldValue("goingRight", "FIELD");
  plug(ifGoingRight, "CONDITION", selfGoingRightGet);
  const selfXAdd = block(workspace, "fjs_self_field_add");
  selfXAdd.setFieldValue("x", "FIELD");
  selfXAdd.setFieldValue(2, "NUM");
  plug(ifGoingRight, "DO", selfXAdd, false);
  const selfXSub = block(workspace, "fjs_self_field_sub");
  selfXSub.setFieldValue("x", "FIELD");
  selfXSub.setFieldValue(2, "NUM");
  plug(ifGoingRight, "ELSE", selfXSub, false);

  const drawBall = block(workspace, "fjs_call_drawsprite");
  drawBall.setFieldValue(1, "ID");
  drawBall.setFieldValue(0, "TILE");
  drawBall.setFieldValue(0, "PALETTE");
  const selfXGet = block(workspace, "fjs_self_field_get");
  selfXGet.setFieldValue("x", "FIELD");
  plug(drawBall, "X", selfXGet);
  const num120 = block(workspace, "fjs_number");
  num120.setFieldValue(120, "VALUE");
  plug(drawBall, "Y", num120);

  stack(ifGoingRight, drawBall);
  plug(behaviorMove, "DO", ifGoingRight, false);
  stack(fieldX, fieldGoingRight, behaviorMove);
  plug(partBall, "BODY", fieldX, false);

  // --- part Paddle { field y=100; behavior move(self) {...} } ---
  const partPaddle = block(workspace, "fjs_part_decl");
  partPaddle.setFieldValue("Paddle", "NAME");

  const fieldY = block(workspace, "fjs_field_decl");
  fieldY.setFieldValue("y", "NAME");
  fieldY.setFieldValue(100, "VALUE");

  const behaviorPaddleMove = block(workspace, "fjs_behavior_decl");
  behaviorPaddleMove.setFieldValue("move", "NAME");

  const ifBtnUp = block(workspace, "fjs_if");
  const btnUp = block(workspace, "fjs_btn");
  btnUp.setFieldValue("up", "NAME");
  btnUp.setFieldValue("held", "MODE");
  plug(ifBtnUp, "CONDITION", btnUp);
  const selfYSub = block(workspace, "fjs_self_field_sub");
  selfYSub.setFieldValue("y", "FIELD");
  selfYSub.setFieldValue(2, "NUM");
  plug(ifBtnUp, "DO", selfYSub, false);

  const drawPaddle = block(workspace, "fjs_call_drawsprite");
  drawPaddle.setFieldValue(0, "ID");
  drawPaddle.setFieldValue(0, "TILE");
  drawPaddle.setFieldValue(0, "PALETTE");
  const num20 = block(workspace, "fjs_number");
  num20.setFieldValue(20, "VALUE");
  plug(drawPaddle, "X", num20);
  const selfYGet = block(workspace, "fjs_self_field_get");
  selfYGet.setFieldValue("y", "FIELD");
  plug(drawPaddle, "Y", selfYGet);

  stack(ifBtnUp, drawPaddle);
  plug(behaviorPaddleMove, "DO", ifBtnUp, false);
  stack(fieldY, behaviorPaddleMove);
  plug(partPaddle, "BODY", fieldY, false);

  // --- scene Main { instance ball: Ball; instance paddle: Paddle; function init(){} function update(){...} } ---
  const scene = block(workspace, "fjs_scene_decl");
  scene.setFieldValue("Main", "NAME");

  const instBall = block(workspace, "fjs_instance_decl");
  instBall.setFieldValue("ball", "NAME");
  instBall.setFieldValue("Ball", "PARTTYPE");
  const instPaddle = block(workspace, "fjs_instance_decl");
  instPaddle.setFieldValue("paddle", "NAME");
  instPaddle.setFieldValue("Paddle", "PARTTYPE");

  const sceneInit = block(workspace, "fjs_scene_event_init");

  const sceneUpdate = block(workspace, "fjs_scene_event_update");
  const callPaddleMove = block(workspace, "fjs_call_behavior");
  callPaddleMove.setFieldValue("Paddle", "PARTTYPE");
  callPaddleMove.setFieldValue("move", "BEHAVIOR");
  callPaddleMove.setFieldValue("paddle", "INSTANCE");
  const callBallMove = block(workspace, "fjs_call_behavior");
  callBallMove.setFieldValue("Ball", "PARTTYPE");
  callBallMove.setFieldValue("move", "BEHAVIOR");
  callBallMove.setFieldValue("ball", "INSTANCE");

  // if (ball.x > paddle.y) { ball.goingRight = 0; } else { ball.goingRight = 1; }
  // ball.x/paddle.y という「パーツ横断」の比較を、両辺とも値ブロック(fjs_instance_field_get)を
  // 差し込めるfjs_compare_exprで組み立てる。
  const ifCross = block(workspace, "fjs_if");
  const compareExpr = block(workspace, "fjs_compare_expr");
  compareExpr.setFieldValue(">", "OP");
  const ballXGet = block(workspace, "fjs_instance_field_get");
  ballXGet.setFieldValue("ball", "INSTANCE");
  ballXGet.setFieldValue("x", "FIELD");
  plug(compareExpr, "LEFT", ballXGet);
  const paddleYGet = block(workspace, "fjs_instance_field_get");
  paddleYGet.setFieldValue("paddle", "INSTANCE");
  paddleYGet.setFieldValue("y", "FIELD");
  plug(compareExpr, "RIGHT", paddleYGet);
  plug(ifCross, "CONDITION", compareExpr);

  const setGoingRight0 = block(workspace, "fjs_instance_field_set");
  setGoingRight0.setFieldValue("ball", "INSTANCE");
  setGoingRight0.setFieldValue("goingRight", "FIELD");
  const num0 = block(workspace, "fjs_number");
  num0.setFieldValue(0, "VALUE");
  plug(setGoingRight0, "VALUE", num0);
  plug(ifCross, "DO", setGoingRight0, false);

  const setGoingRight1 = block(workspace, "fjs_instance_field_set");
  setGoingRight1.setFieldValue("ball", "INSTANCE");
  setGoingRight1.setFieldValue("goingRight", "FIELD");
  const num1 = block(workspace, "fjs_number");
  num1.setFieldValue(1, "VALUE");
  plug(setGoingRight1, "VALUE", num1);
  plug(ifCross, "ELSE", setGoingRight1, false);

  stack(callPaddleMove, callBallMove, ifCross);
  plug(sceneUpdate, "DO", callPaddleMove, false);

  stack(instBall, instPaddle, sceneInit, sceneUpdate);
  plug(scene, "BODY", instBall, false);

  return workspace;
}

describe("DSL v1（part/scene）Phase 4: ブロックのみでPong相当を組み立てる", () => {
  it("part/sceneブロックから生成したDSLソースがエラーなくコンパイルできる", () => {
    const workspace = buildPongV1Workspace();
    const source = generateSource(workspace);
    expect(() => compile(source)).not.toThrow();
  });

  it("初期化直後、各パーツのフィールドがinit値でRAMに反映されている", () => {
    const source = generateSource(buildPongV1Workspace());
    const nes = bootedNes(source);
    expect(nes.readCpuMemory(BALL_X)).toBe(128);
    expect(nes.readCpuMemory(PADDLE_Y)).toBe(100);
  });

  it("既存のfjs_btnブロックがbehavior内でも動く: btn.upでパドルが2px上に動く", () => {
    const source = generateSource(buildPongV1Workspace());
    const nes = bootedNes(source);
    const before = nes.readCpuMemory(PADDLE_Y);
    nes.controller1.setButton(BUTTON.UP, true);
    nes.runFrame();
    expect(nes.readCpuMemory(PADDLE_Y)).toBe(before - 2);
  });

  it("【最重要】fjs_compare_expr + fjs_instance_field_getによるパーツ横断比較が正しく動く", () => {
    const source = generateSource(buildPongV1Workspace());
    const nes = bootedNes(source);

    // ball.x=50, paddle.y=100, goingRight=1 → Ball.move()でx+=2して52。
    // scene側の比較(ball.x > paddle.y)は 52 > 100 = false → else節でgoingRight=1のまま。
    nes.writeCpuMemory(BALL_X, 50);
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(BALL_GOING_RIGHT, 1);
    nes.runFrame();
    expect(nes.readCpuMemory(BALL_X)).toBe(52);
    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(1);

    // ball.x=150, paddle.y=100, goingRight=0 → Ball.move()でx-=2して148。
    // 比較(148 > 100) = true → if節でgoingRight=0。
    nes.writeCpuMemory(BALL_X, 150);
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.runFrame();
    expect(nes.readCpuMemory(BALL_X)).toBe(148);
    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(0);
  });

  it("part/sceneブロックを使わない従来のワークスペースはv0のソースを生成する（後方互換）", () => {
    const workspace = new Blockly.Workspace();
    const letX = block(workspace, "fjs_let");
    letX.setFieldValue("x", "NAME");
    letX.setFieldValue(120, "VALUE");
    const initEvent = block(workspace, "fjs_event_init");
    const updateEvent = block(workspace, "fjs_event_update");

    const source = generateSource(workspace);
    expect(source).toContain("let x = 120;");
    expect(source).toContain("function init()");
    expect(source).toContain("function update()");
    expect(source).not.toContain("part ");
    expect(source).not.toContain("scene ");
    expect(() => compile(source)).not.toThrow();
  });
});
