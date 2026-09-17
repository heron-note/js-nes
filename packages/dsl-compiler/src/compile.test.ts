import { describe, expect, it } from "vitest";
import { BUTTON, Nes } from "@js-nes/emulator-core";
import { compile } from "./compile.js";
import { CodegenError } from "./codegen.js";
import { ParseError } from "./parser.js";

// codegen.ts のゼロページ割り当て規約（USER_VARS_START = 0x0B）に基づく。
// 1つ目に宣言したグローバル変数は $0B、2つ目は $0C に割り当てられる。
const X_ADDR = 0x0b;
const Y_ADDR = 0x0c;

const SAMPLE_SOURCE = `
let x = 120;
let y = 100;

function init() {
  setPalette(0, 1, 33, 0, 0);
  setSpritePalette(0, 1, 34, 0, 0);
}

function update() {
  if (btn.right) { x += 1; }
  if (btn.left) { x -= 1; }
  if (btn.up) { y -= 1; }
  if (btn.down) { y += 1; }

  drawSprite(0, x, y, 1, 2);
}
`;

function bootUntilRunning(nes: Nes, warmupFrames = 5): void {
  for (let i = 0; i < warmupFrames; i++) nes.runFrame();
}

/** 起動シーケンス(2vblank待ち)にかかる正確なフレーム数に依存せず、条件成立まで1フレームずつ進める。 */
function stepUntil(nes: Nes, predicate: () => boolean, maxFrames = 20): void {
  for (let i = 0; i < maxFrames; i++) {
    if (predicate()) return;
    nes.runFrame();
  }
  throw new Error("stepUntil: exceeded maxFrames without predicate becoming true");
}

describe("compile", () => {
  it("compiles docs/03_DSL_SPEC.md 相当のサンプルコードを実行可能なROMにする", () => {
    const { rom } = compile(SAMPLE_SOURCE);
    const nes = new Nes();
    nes.loadRom(rom);
    bootUntilRunning(nes);

    // init()のsetPalette(0, 1, 33, 0, 0)がパレットRAMに反映されている
    expect(nes.ppu.getPaletteEntry(0)).toBe(1);
    expect(nes.ppu.getPaletteEntry(1)).toBe(33);

    // init()のsetSpritePalette(0, 1, 34, 0, 0)がスプライトパレット($3F10起点)に反映されている
    expect(nes.ppu.getPaletteEntry(0x11)).toBe(34);

    // drawSprite(0, x, y, 1, 2) の結果がOAM(DMA経由)に反映されている
    // OAM形式: byte0=Y, byte1=tile, byte2=attr(下位2bit=パレット番号), byte3=X
    expect(nes.ppu.oam[0]).toBe(100); // y
    expect(nes.ppu.oam[1]).toBe(1); // tile
    expect(nes.ppu.oam[2]).toBe(2); // palette
    expect(nes.ppu.oam[3]).toBe(120); // x

    expect(nes.readCpuMemory(X_ADDR)).toBe(120);
    expect(nes.readCpuMemory(Y_ADDR)).toBe(100);
  });

  it("btn.right を押すとxがインクリメントされ、OAM/変数に反映される", () => {
    const { rom } = compile(SAMPLE_SOURCE);
    const nes = new Nes();
    nes.loadRom(rom);
    bootUntilRunning(nes);

    nes.controller1.setButton(BUTTON.RIGHT, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.RIGHT, false);

    expect(nes.readCpuMemory(X_ADDR)).toBe(121);
    expect(nes.ppu.oam[3]).toBe(121);
  });

  it("btn.left / btn.up / btn.down で座標が正しく増減する", () => {
    const { rom } = compile(SAMPLE_SOURCE);
    const nes = new Nes();
    nes.loadRom(rom);
    bootUntilRunning(nes);

    nes.controller1.setButton(BUTTON.LEFT, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.LEFT, false);
    expect(nes.readCpuMemory(X_ADDR)).toBe(119);

    nes.controller1.setButton(BUTTON.UP, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.UP, false);
    expect(nes.readCpuMemory(Y_ADDR)).toBe(99);

    nes.controller1.setButton(BUTTON.DOWN, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.DOWN, false);
    expect(nes.readCpuMemory(Y_ADDR)).toBe(100);
  });

  it("== 比較による分岐（if/elseの両方の枝）が正しく動く", () => {
    const source = `
      let counter = 0;
      let flag = 0;

      function init() {}

      function update() {
        counter += 1;
        if (counter == 3) {
          flag = 1;
        } else {
          flag = 0;
        }
      }
    `;
    const { rom } = compile(source);
    const nes = new Nes();
    nes.loadRom(rom);

    const counterAddr = 0x0b;
    const flagAddr = 0x0c;

    // 起動シーケンス(2vblank待ち)完了直後、update()が初めて呼ばれてcounterが1になるまで進める
    stepUntil(nes, () => nes.readCpuMemory(counterAddr) > 0);
    expect(nes.readCpuMemory(counterAddr)).toBe(1);
    expect(nes.readCpuMemory(flagAddr)).toBe(0);

    nes.runFrame(); // counter=2
    expect(nes.readCpuMemory(counterAddr)).toBe(2);
    expect(nes.readCpuMemory(flagAddr)).toBe(0);

    nes.runFrame(); // counter=3 → if分岐が成立
    expect(nes.readCpuMemory(counterAddr)).toBe(3);
    expect(nes.readCpuMemory(flagAddr)).toBe(1);

    nes.runFrame(); // counter=4 → else分岐
    expect(nes.readCpuMemory(counterAddr)).toBe(4);
    expect(nes.readCpuMemory(flagAddr)).toBe(0);
  });

  it("playTone()でAPUチャンネルが鳴り、durationフレーム経過後に自動で無音化する", () => {
    const source = `
      function init() {}
      function update() {
        if (btn.a_just_pressed) {
          playTone(0, 0, 2);
        }
      }
    `;
    const { rom } = compile(source);
    const nes = new Nes();
    nes.loadRom(rom);
    bootUntilRunning(nes);
    expect(nes.apu.getChannelState(0).enabled).toBe(false);

    nes.controller1.setButton(BUTTON.A, true);
    nes.runFrame(); // このフレームでbtn.a_just_pressedが成立しplayToneが呼ばれる
    nes.controller1.setButton(BUTTON.A, false);

    const state = nes.apu.getChannelState(0);
    expect(state.enabled).toBe(true);
    expect(state.volume).toBe(15);

    nes.runFrame(); // sound_tickがdurationを2→1に減らす（まだ鳴っている）
    expect(nes.apu.getChannelState(0).enabled).toBe(true);

    nes.runFrame(); // durationが1→0になり自動的に無音化する
    expect(nes.apu.getChannelState(0).enabled).toBe(false);
  });

  it("btn.a_just_pressed は押しっぱなしの間は再発火しない（エッジ検出）", () => {
    const source = `
      let count = 0;
      function init() {}
      function update() {
        if (btn.a_just_pressed) {
          count += 1;
        }
      }
    `;
    const { rom } = compile(source);
    const nes = new Nes();
    nes.loadRom(rom);
    bootUntilRunning(nes);

    const countAddr = 0x0b;
    nes.controller1.setButton(BUTTON.A, true);
    nes.runFrame();
    nes.runFrame();
    nes.runFrame();
    nes.controller1.setButton(BUTTON.A, false);
    nes.runFrame();

    expect(nes.readCpuMemory(countAddr)).toBe(1); // 押し続けても1回だけカウントされる
  });

  it("未宣言の変数を参照するとCodegenErrorを投げる", () => {
    const source = `
      function init() {}
      function update() {
        y += 1;
      }
    `;
    expect(() => compile(source)).toThrow(CodegenError);
  });

  it("init/updateのいずれかが欠けているとCodegenErrorを投げる", () => {
    expect(() => compile("function init() {}")).toThrow(CodegenError);
  });

  it("構文エラーはParseErrorとして報告される", () => {
    expect(() => compile("let x = ;")).toThrow(ParseError);
  });
});
