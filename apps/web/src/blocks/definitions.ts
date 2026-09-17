/**
 * ブロックプログラミング（Scratch風）用のカスタムBlocklyブロック定義。
 * docs/03_DSL_SPEC.md のv0文法をそのままブロック化したもの。
 * ブロックの組み立て結果は generator.ts でDSLテキストに変換され、
 * 既存の dsl-compiler（テキストのlexer/parser/codegen）にそのまま渡される
 * （ブロック側専用のコンパイラは持たない）。
 */
import * as Blockly from "blockly/core";

const COLOR_GLOBALS = 40;
const COLOR_EVENTS = 210;
const COLOR_VARS = 330;
const COLOR_CONTROL = 260;
const COLOR_CONDITION = 20;
const COLOR_CALLS = 160;
const COLOR_VALUES = 0;

const BTN_OPTIONS: [string, string][] = [
  ["右 (right)", "right"],
  ["左 (left)", "left"],
  ["上 (up)", "up"],
  ["下 (down)", "down"],
  ["Aボタン (a)", "a"],
  ["Bボタン (b)", "b"],
  ["START", "start"],
  ["SELECT", "select"],
];

const COMPARE_OPTIONS: [string, string][] = [
  ["=", "=="],
  ["≠", "!="],
  ["<", "<"],
  [">", ">"],
  ["<=", "<="],
  [">=", ">="],
];

export function defineFamiJsBlocks(): void {
  Blockly.common.defineBlocks({
    fjs_let: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("グローバル変数")
          .appendField(new Blockly.FieldTextInput("x"), "NAME")
          .appendField("の初期値 =")
          .appendField(new Blockly.FieldNumber(0, 0, 255, 1), "VALUE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_GLOBALS);
        this.setTooltip("let x = 値; グローバル変数を宣言する（プログラムの一番上に配置すること）");
      },
    },

    fjs_event_init: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("🚩 ゲーム開始時 (init)");
        this.appendStatementInput("DO");
        this.setColour(COLOR_EVENTS);
        this.setTooltip("function init() { ... } に対応。最初に1回だけ実行される");
      },
    },

    fjs_event_update: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("🔁 毎フレーム (update)");
        this.appendStatementInput("DO");
        this.setColour(COLOR_EVENTS);
        this.setTooltip("function update() { ... } に対応。毎フレーム(1/60秒ごと)実行される");
      },
    },

    fjs_assign: {
      init(this: Blockly.Block) {
        this.appendValueInput("VALUE")
          .appendField(new Blockly.FieldTextInput("x"), "NAME")
          .appendField("＝");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_VARS);
        this.setTooltip("変数に値を代入する");
      },
    },

    fjs_assign_add: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput("x"), "NAME")
          .appendField("を")
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), "NUM")
          .appendField("増やす (+=)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_VARS);
        this.setTooltip("x += 数値;");
      },
    },

    fjs_assign_sub: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput("x"), "NAME")
          .appendField("を")
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), "NUM")
          .appendField("減らす (-=)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_VARS);
        this.setTooltip("x -= 数値;");
      },
    },

    fjs_if: {
      init(this: Blockly.Block) {
        this.appendValueInput("CONDITION").appendField("もし");
        this.appendDummyInput().appendField("なら");
        this.appendStatementInput("DO");
        this.appendDummyInput().appendField("そうでなければ");
        this.appendStatementInput("ELSE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CONTROL);
        this.setTooltip("if (条件) { ... } else { ... }（elseの中身は空でもよい）");
      },
    },

    fjs_btn: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("ボタン")
          .appendField(new Blockly.FieldDropdown(BTN_OPTIONS), "NAME")
          .appendField(new Blockly.FieldDropdown([
            ["が押されている", "held"],
            ["が押された瞬間", "just"],
          ]), "MODE");
        this.setOutput(true, null);
        this.setColour(COLOR_CONDITION);
        this.setTooltip("btn.right のような条件式");
      },
    },

    fjs_compare: {
      init(this: Blockly.Block) {
        this.appendValueInput("RIGHT")
          .appendField(new Blockly.FieldTextInput("x"), "NAME")
          .appendField(new Blockly.FieldDropdown(COMPARE_OPTIONS), "OP");
        this.setOutput(true, null);
        this.setColour(COLOR_CONDITION);
        this.setTooltip("変数 op (変数|数値) の比較条件");
      },
    },

    fjs_var_truthy: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(new Blockly.FieldTextInput("x"), "NAME").appendField("が0でない");
        this.setOutput(true, null);
        this.setColour(COLOR_CONDITION);
        this.setTooltip("変数の値が0でなければ真");
      },
    },

    fjs_call_setpalette: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("背景パレット setPalette 枠")
          .appendField(new Blockly.FieldNumber(0, 0, 3, 1), "SLOT")
          .appendField("色0")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C0")
          .appendField("色1")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C1")
          .appendField("色2")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C2")
          .appendField("色3")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C3");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("setPalette(slot, c0, c1, c2, c3);");
      },
    },

    fjs_call_setspritepalette: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("スプライトパレット setSpritePalette 枠")
          .appendField(new Blockly.FieldNumber(0, 0, 3, 1), "SLOT")
          .appendField("色0")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C0")
          .appendField("色1")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C1")
          .appendField("色2")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C2")
          .appendField("色3")
          .appendField(new Blockly.FieldNumber(0, 0, 63, 1), "C3");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("setSpritePalette(slot, c0, c1, c2, c3);");
      },
    },

    fjs_call_drawsprite: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("スプライト表示 drawSprite ID").appendField(new Blockly.FieldNumber(0, 0, 63, 1), "ID");
        this.appendValueInput("X").appendField("X座標");
        this.appendValueInput("Y").appendField("Y座標");
        this.appendDummyInput().appendField("タイル番号").appendField(new Blockly.FieldNumber(0, 0, 255, 1), "TILE");
        this.appendDummyInput()
          .appendField("パレット番号(0-3、setSpritePaletteで設定した枠)")
          .appendField(new Blockly.FieldNumber(0, 0, 3, 1), "PALETTE");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("drawSprite(id, x, y, tile, palette); paletteはsetSpritePalette(0-3, ...)で設定した4種類のパレットから選ぶ");
      },
    },

    fjs_call_playtone: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("音を鳴らす playTone チャンネル")
          .appendField(new Blockly.FieldDropdown([
            ["0: Pulse1", "0"],
            ["1: Pulse2", "1"],
            ["2: Triangle", "2"],
            ["3: Noise", "3"],
          ]), "CHANNEL")
          .appendField("音階")
          .appendField(new Blockly.FieldNumber(24, 0, 35, 1), "NOTE")
          .appendField("長さ(フレーム)")
          .appendField(new Blockly.FieldNumber(10, 1, 255, 1), "DURATION");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("playTone(channel, noteIndex, duration);");
      },
    },

    fjs_number: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(new Blockly.FieldNumber(0, 0, 255, 1), "VALUE");
        this.setOutput(true, null);
        this.setColour(COLOR_VALUES);
        this.setTooltip("数値（0〜255）");
      },
    },

    fjs_variable_get: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(new Blockly.FieldTextInput("x"), "NAME");
        this.setOutput(true, null);
        this.setColour(COLOR_VALUES);
        this.setTooltip("変数の値を参照する");
      },
    },
  });
}
