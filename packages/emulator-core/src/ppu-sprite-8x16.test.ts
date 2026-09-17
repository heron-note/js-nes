import { describe, expect, it } from "vitest";
import { Ppu2C02, type PpuBus } from "./ppu.js";

/**
 * PPUのドット精度化プロジェクト Phase 5（任意）: 8x16スプライトモードのデータデコード。
 * 8x16モードは8x8と異なり、パターンテーブルの選択自体がタイル番号のbit0で決まり
 * （`$2000`bit3は無視される）、上半分=タイル番号&0xFE・下半分=その次の番号を使う。
 * 垂直反転時は上下の行順だけでなく、上半分/下半分のタイル自体も入れ替わる。
 * C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md 参照。
 *
 * ppu-midframe-split.test.tsと同じ手法で、CPU/ROMを介さずPpu2C02を直接dot単位で駆動する。
 */

const TOP_TILE = 4; // 偶数タイル番号（$0000側）
const BOTTOM_TILE = 5; // TOP_TILE+1

function buildChr(): Uint8Array {
  const chr = new Uint8Array(0x2000);
  // $0000側: タイル4=pixelValue1(上半分用)、タイル5=pixelValue2(下半分用)
  for (let row = 0; row < 8; row++) {
    chr[TOP_TILE * 16 + row] = 0xff;
    chr[TOP_TILE * 16 + 8 + row] = 0x00;
    chr[BOTTOM_TILE * 16 + row] = 0x00;
    chr[BOTTOM_TILE * 16 + 8 + row] = 0xff;
  }
  // $1000側: タイル4・5とも全ドットpixelValue3の見張り役（誤って$1000を選んだら検出できるように）
  for (let row = 0; row < 8; row++) {
    chr[0x1000 + TOP_TILE * 16 + row] = 0xff;
    chr[0x1000 + TOP_TILE * 16 + 8 + row] = 0xff;
    chr[0x1000 + BOTTOM_TILE * 16 + row] = 0xff;
    chr[0x1000 + BOTTOM_TILE * 16 + 8 + row] = 0xff;
  }
  return chr;
}

function makePpu(): { ppu: Ppu2C02; chr: Uint8Array } {
  const chr = buildChr();
  const bus: PpuBus = {
    ppuRead: (addr) => chr[addr] ?? 0,
    ppuWrite: () => {},
  };
  return { ppu: new Ppu2C02(bus, () => "vertical"), chr };
}

function setPaletteEntry(ppu: Ppu2C02, index: number, value: number): void {
  ppu.cpuWrite(0x2006, (0x3f00 + index) >> 8);
  ppu.cpuWrite(0x2006, (0x3f00 + index) & 0xff);
  ppu.cpuWrite(0x2007, value);
}

function tickDots(ppu: Ppu2C02, count: number): void {
  for (let i = 0; i < count; i++) ppu.tickOne();
}

function finishPreRenderLine(ppu: Ppu2C02): void {
  tickDots(ppu, 341);
}

function pixelRgb(ppu: Ppu2C02, x: number, y: number): [number, number, number] {
  const idx = (y * 256 + x) * 4;
  const fb = ppu.framebuffer;
  return [fb[idx] ?? -1, fb[idx + 1] ?? -1, fb[idx + 2] ?? -1];
}

describe("PPUのドット精度化 Phase 5: 8x16スプライトモードのデータデコード", () => {
  it("タイル番号のbit0でパターンテーブルを選択し($2000bit3は無視)、上半分/下半分に連続する2タイルを使う", () => {
    const { ppu } = makePpu();
    setPaletteEntry(ppu, 0, 0x01); // backdrop
    setPaletteEntry(ppu, 0x11, 0x21); // スプライトパレット群0・色1(pixelValue1用)
    setPaletteEntry(ppu, 0x12, 0x30); // スプライトパレット群0・色2(pixelValue2用)

    // $2000: bit5=1(8x16モード)、bit3=1(8x8ならスプライトテーブル$1000選択…だが8x16では無視されるはず)
    ppu.cpuWrite(0x2000, 0b0010_1000);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2001, 0b0001_0000); // スプライトのみ有効（背景は無効のまま）

    // Y=9 (OAM上のY値) => spriteTop = 10、スプライトは scanline 10-25 の16行分
    ppu.oam.set([9, TOP_TILE, 0x00, 20], 0);

    finishPreRenderLine(ppu);
    tickDots(ppu, 26 * 341); // scanline25(スプライト最終行)まで描画

    const topHalf = pixelRgb(ppu, 23, 10); // row0(タイル4の1行目)
    const bottomHalf = pixelRgb(ppu, 23, 18); // row8(タイル5の1行目)
    const backdrop = pixelRgb(ppu, 23, 30);

    expect(topHalf).not.toEqual(backdrop);
    expect(bottomHalf).not.toEqual(backdrop);
    expect(topHalf).not.toEqual(bottomHalf); // 上下で異なるタイル(4→pixelValue1, 5→pixelValue2)
  });

  it("垂直反転時は行順だけでなく上半分/下半分のタイル自体も入れ替わる", () => {
    const { ppu } = makePpu();
    setPaletteEntry(ppu, 0, 0x01);
    setPaletteEntry(ppu, 0x11, 0x21);
    setPaletteEntry(ppu, 0x12, 0x30);

    ppu.cpuWrite(0x2000, 0b0010_0000); // 8x16モード、ctrl bit3=0
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2001, 0b0001_0000);

    ppu.oam.set([9, TOP_TILE, 0x80, 20], 0); // attr bit7=垂直反転

    finishPreRenderLine(ppu);
    tickDots(ppu, 26 * 341);

    const screenRow0 = pixelRgb(ppu, 23, 10); // 反転前ならタイル4の色だが、反転で最下行=タイル5の色になるはず
    const screenRow15 = pixelRgb(ppu, 23, 25); // 反転で最上行=タイル4の色になるはず

    const unflipped = (() => {
      const { ppu: ppu2 } = makePpu();
      setPaletteEntry(ppu2, 0, 0x01);
      setPaletteEntry(ppu2, 0x11, 0x21);
      setPaletteEntry(ppu2, 0x12, 0x30);
      ppu2.cpuWrite(0x2000, 0b0010_0000);
      ppu2.cpuWrite(0x2005, 0x00);
      ppu2.cpuWrite(0x2005, 0x00);
      ppu2.cpuWrite(0x2001, 0b0001_0000);
      ppu2.oam.set([9, TOP_TILE, 0x00, 20], 0);
      finishPreRenderLine(ppu2);
      tickDots(ppu2, 26 * 341);
      return { top: pixelRgb(ppu2, 23, 10), bottom: pixelRgb(ppu2, 23, 25) };
    })();

    // 反転時のrow0(画面上端)は非反転時のrow15(画面下端、タイル5)と同じ色になるはず
    expect(screenRow0).toEqual(unflipped.bottom);
    // 反転時のrow15(画面下端)は非反転時のrow0(画面上端、タイル4)と同じ色になるはず
    expect(screenRow15).toEqual(unflipped.top);
  });

  it("奇数タイル番号を指定すると$1000側のパターンテーブルが選択される", () => {
    const { ppu } = makePpu();
    setPaletteEntry(ppu, 0, 0x01);
    setPaletteEntry(ppu, 0x13, 0x2a); // スプライトパレット群0・色3(pixelValue3用、$1000見張り役)

    ppu.cpuWrite(0x2000, 0b0010_0000); // 8x16モード
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2001, 0b0001_0000);

    // タイル番号5(奇数)を指定 => bit0=1 => $1000側、tileBase=5&0xFE=4を使用
    ppu.oam.set([9, BOTTOM_TILE, 0x00, 20], 0);

    finishPreRenderLine(ppu);
    tickDots(ppu, 26 * 341);

    const topHalf = pixelRgb(ppu, 23, 10);
    const backdrop = pixelRgb(ppu, 23, 30);
    // $1000側はタイル4・5とも全面pixelValue3の見張り役として塗ってある
    expect(topHalf).not.toEqual(backdrop);
  });
});
