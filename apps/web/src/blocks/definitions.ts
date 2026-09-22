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
const COLOR_PARTS = 290;
const COLOR_SCENES = 130;

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

    fjs_call_playsound: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("サウンド再生 playSound")
          .appendField(new Blockly.FieldTextInput("Jump"), "NAME");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("playSound(名前); ビルド時に playTone / playSequence へ解決。BGM はループ");
      },
    },

    fjs_call_stopsound: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("シーケンス停止 stopSequence");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("stopSequence(); 再生中の BGM/シーケンスを止める");
      },
    },

    fjs_call_drawspriteflip: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("スプライト(反転) drawSpriteFlip ID").appendField(new Blockly.FieldNumber(0, 0, 63, 1), "ID");
        this.appendValueInput("X").appendField("X");
        this.appendValueInput("Y").appendField("Y");
        this.appendDummyInput().appendField("タイル").appendField(new Blockly.FieldNumber(0, 0, 255, 1), "TILE");
        this.appendDummyInput().appendField("パレット").appendField(new Blockly.FieldNumber(0, 0, 3, 1), "PALETTE");
        this.appendDummyInput()
          .appendField("反転")
          .appendField(
            new Blockly.FieldDropdown([
              ["なし", "0"],
              ["左右", "1"],
              ["上下", "2"],
              ["両方", "3"],
            ]),
            "FLIP",
          );
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("drawSpriteFlip(id, x, y, tile, flags); flags=palette+(flip*4)");
      },
    },

    fjs_call_gotoscene: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("シーンへ移動 gotoScene")
          .appendField(new Blockly.FieldTextInput("Main"), "NAME");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("gotoScene(シーン名); 指定シーンの init を呼び、以降その update が毎フレーム動く");
      },
    },

    fjs_call_fillbackground: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("背景をタイルで埋める fillBackground")
          .appendField(new Blockly.FieldNumber(0, 0, 255, 1), "TILE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("fillBackground(tile); ネームテーブル全体を同じタイルで埋める（init 向け）");
      },
    },

    fjs_call_setscroll: {
      init(this: Blockly.Block) {
        this.appendValueInput("X").appendField("スクロール setScroll X");
        this.appendValueInput("Y").appendField("Y");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("setScroll(x, y); 背景のスクロール位置（値ブロック可）");
      },
    },

    fjs_call_drawbgtile: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("背景タイル drawBgTile 列")
          .appendField(new Blockly.FieldNumber(0, 0, 31, 1), "TX")
          .appendField("行")
          .appendField(new Blockly.FieldNumber(0, 0, 29, 1), "TY")
          .appendField("タイル")
          .appendField(new Blockly.FieldNumber(0, 0, 255, 1), "TILE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CALLS);
        this.setTooltip("drawBgTile(tx, ty, tile); ネームテーブルの1マスを書く");
      },
    },

    fjs_on_overlap: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("重なったら")
          .appendField(new Blockly.FieldTextInput("hero"), "A")
          .appendField("と")
          .appendField(new Blockly.FieldTextInput("enemy"), "B")
          .appendField("（判定サイズ")
          .appendField(new Blockly.FieldNumber(16, 1, 64, 1), "SIZE")
          .appendField("）");
        this.appendStatementInput("DO").appendField("する");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_CONTROL);
        this.setTooltip(
          "矩形近接判定。両インスタンスに x/y と作業用 hx/hy、A 側に hit フィールドが必要",
        );
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

    // --- DSL v1（シーン/パーツ構成モデル）専用のブロック ---
    // docs/03_DSL_SPEC.md のv0構文と同じく、part/scene構文をそのままブロック化したもの。
    // 既存のv0ブロック（fjs_if/fjs_compare/fjs_btn/fjs_call_*等）はここでも無改造のまま再利用する。

    fjs_part_decl: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("🧩 パーツ (part)").appendField(new Blockly.FieldTextInput("Ball"), "NAME");
        this.appendStatementInput("BODY");
        this.setColour(COLOR_PARTS);
        this.setTooltip("part Name { ... } に対応。fieldとbehaviorをこの中に並べる");
      },
    },

    fjs_field_decl: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("フィールド (field)")
          .appendField(new Blockly.FieldTextInput("x"), "NAME")
          .appendField("の初期値 =")
          .appendField(new Blockly.FieldNumber(0, 0, 255, 1), "VALUE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("field x = 値; パーツのインスタンスごとの状態を宣言する");
      },
    },

    fjs_behavior_decl: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("▶ 振る舞い (behavior)").appendField(new Blockly.FieldTextInput("move"), "NAME");
        this.appendStatementInput("DO");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("behavior name(self) { ... } に対応。このパーツの1インスタンス分の振る舞いを書く");
      },
    },

    fjs_self_field_get: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("self.").appendField(new Blockly.FieldTextInput("x"), "FIELD");
        this.setOutput(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("self.field（このインスタンス自身のフィールドを参照する）。behavior内でのみ使用可");
      },
    },

    fjs_self_field_offset: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("self.")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD")
          .appendField("+")
          .appendField(new Blockly.FieldNumber(0, 0, 255, 1), "OFFSET");
        this.setOutput(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("self.field + 数値（複数タイルの位置ずらし）");
      },
    },

    fjs_self_field_set: {
      init(this: Blockly.Block) {
        this.appendValueInput("VALUE").appendField("self.").appendField(new Blockly.FieldTextInput("x"), "FIELD").appendField("＝");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("self.field = 値; behavior内でのみ使用可");
      },
    },

    fjs_self_field_add: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("self.")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD")
          .appendField("を")
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), "NUM")
          .appendField("増やす (+=)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("self.field += 数値; behavior内でのみ使用可");
      },
    },

    fjs_self_field_sub: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("self.")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD")
          .appendField("を")
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), "NUM")
          .appendField("減らす (-=)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_PARTS);
        this.setTooltip("self.field -= 数値; behavior内でのみ使用可");
      },
    },

    fjs_scene_decl: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("🎬 シーン (scene)").appendField(new Blockly.FieldTextInput("Main"), "NAME");
        this.appendStatementInput("BODY");
        this.setColour(COLOR_SCENES);
        this.setTooltip("scene Name { ... } に対応。instance宣言と、このシーン専用のinit/updateを並べる");
      },
    },

    fjs_instance_decl: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("配置 (instance)")
          .appendField(new Blockly.FieldTextInput("ball"), "NAME")
          .appendField(": パーツ種別")
          .appendField(new Blockly.FieldTextInput("Ball"), "PARTTYPE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("instance ball: Ball; このシーンにパーツのインスタンスを配置する");
      },
    },

    fjs_scene_event_init: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("🚩 シーン開始時 (init)");
        this.appendStatementInput("DO");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("scene内のfunction init() { ... }。sceneのBODYの中に置く");
      },
    },

    fjs_scene_event_update: {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField("🔁 シーン毎フレーム (update)");
        this.appendStatementInput("DO");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("scene内のfunction update() { ... }。sceneのBODYの中に置く");
      },
    },

    fjs_instance_field_get: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput("ball"), "INSTANCE")
          .appendField(".")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD");
        this.setOutput(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("instanceName.field（他パーツのインスタンスのフィールドを参照する）。scene内でのみ使用可");
      },
    },

    fjs_instance_field_set: {
      init(this: Blockly.Block) {
        this.appendValueInput("VALUE")
          .appendField(new Blockly.FieldTextInput("ball"), "INSTANCE")
          .appendField(".")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD")
          .appendField("＝");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("instanceName.field = 値; scene内でのみ使用可");
      },
    },

    fjs_instance_field_add: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput("ball"), "INSTANCE")
          .appendField(".")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD")
          .appendField("を")
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), "NUM")
          .appendField("増やす (+=)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("instanceName.field += 数値; scene内でのみ使用可");
      },
    },

    fjs_instance_field_sub: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput("ball"), "INSTANCE")
          .appendField(".")
          .appendField(new Blockly.FieldTextInput("x"), "FIELD")
          .appendField("を")
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), "NUM")
          .appendField("減らす (-=)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("instanceName.field -= 数値; scene内でのみ使用可");
      },
    },

    fjs_call_behavior: {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("実行:")
          .appendField(new Blockly.FieldTextInput("Ball"), "PARTTYPE")
          .appendField(".")
          .appendField(new Blockly.FieldTextInput("move"), "BEHAVIOR")
          .appendField("(")
          .appendField(new Blockly.FieldTextInput("ball"), "INSTANCE")
          .appendField(")");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(COLOR_SCENES);
        this.setTooltip("PartType.behaviorName(instanceName); 指定したインスタンスの振る舞いを実行する。scene内でのみ使用可");
      },
    },

    fjs_compare_expr: {
      init(this: Blockly.Block) {
        this.appendValueInput("LEFT").appendField("比較:");
        this.appendValueInput("RIGHT").appendField(new Blockly.FieldDropdown(COMPARE_OPTIONS), "OP");
        this.setInputsInline(true);
        this.setOutput(true, null);
        this.setColour(COLOR_CONDITION);
        this.setTooltip(
          "値 op 値 の比較条件（fjs_compareと違い両辺とも値ブロックを差し込める。self.field/instanceName.fieldにも使える）",
        );
      },
    },
  });
}
