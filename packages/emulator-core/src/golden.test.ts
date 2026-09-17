import { describe, expect, it } from "vitest";
import { Nes } from "./nes.js";
import { buildSpriteTestRom } from "./testing/sprite-rom.js";
import { Asm } from "./testing/mini-asm.js";

/**
 * フル機能化（PPUスクロール・マッパー拡張・APU書き換え）の各フェーズ実施前に採取した
 * 回帰確認用フィクスチャ。Mapper 0・スクロール未使用の既存コンテンツが、今後のフェーズを
 * 経ても画面・音とも変わらないことをここで機械的に確認する（実行計画のPhase -1）。
 * 値が変わった場合、意図した変更でなければ regression。意図した変更（例:
 * ノイズをLFSRベースに置き換えた等）であれば、このスナップショットを更新してよい。
 */

function fnv1aHash(bytes: Uint8ClampedArray | Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

describe("golden regression fixture（Mapper 0・スクロール未使用の既存コンテンツ用）", () => {
  it("背景+スプライト合成フレームバッファのハッシュが変わらない", () => {
    const rom = buildSpriteTestRom({
      sprites: [
        { x: 100, y: 50, tile: 2, attr: 0 },
        { x: 20, y: 20, tile: 2, attr: 0x40 },
        { x: 200, y: 180, tile: 2, attr: 0x20 },
      ],
      fillBackground: true,
      backdropPaletteIndex: 0x01,
      bgColor1PaletteIndex: 0x11,
      spriteColor1PaletteIndex: 0x21,
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 10; i++) nes.runFrame();

    expect({
      hash: fnv1aHash(nes.ppu.framebuffer),
      samplePixels: [
        Array.from(nes.ppu.framebuffer.slice((50 * 256 + 100) * 4, (50 * 256 + 100) * 4 + 4)),
        Array.from(nes.ppu.framebuffer.slice((0 * 256 + 0) * 4, (0 * 256 + 0) * 4 + 4)),
      ],
    }).toMatchSnapshot();
  });

  it("APUレジスタ書き込みから導出されるチャンネルスナップショットが変わらない", () => {
    // DSLランタイム(codegen.ts)が実際に書き込むのと同じビットパターン
    // （halt=1 + constant-volume=1）でPulse1/Triangle/Noiseを鳴らす最小ROM。
    const asm = new Asm(0x8000);
    asm
      .label("reset")
      .SEI()
      .CLD()
      .LDX_IMM(0xff)
      .TXS()
      .LDA_IMM(0x00)
      .STA_ABS(0x2000)
      .STA_ABS(0x2001)
      .label("vblankwait1")
      .BIT_ABS(0x2002)
      .BPL("vblankwait1")
      .label("vblankwait2")
      .BIT_ABS(0x2002)
      .BPL("vblankwait2")
      .LDA_IMM(0b0000_1111)
      .STA_ABS(0x4015)
      // Pulse1: duty=10, halt=1, constant-volume=1, volume=15
      .LDA_IMM(0b1011_1111)
      .STA_ABS(0x4000)
      .LDA_IMM(0x00)
      .STA_ABS(0x4002)
      .LDA_IMM(0x01)
      .STA_ABS(0x4003)
      // Triangle: halt=1
      .LDA_IMM(0b1111_1111)
      .STA_ABS(0x4008)
      .LDA_IMM(0x00)
      .STA_ABS(0x400a)
      .LDA_IMM(0x01)
      .STA_ABS(0x400b)
      // Noise: halt=1, constant-volume=1, volume=15, period index=5
      .LDA_IMM(0b0011_1111)
      .STA_ABS(0x400c)
      .LDA_IMM(0x05)
      .STA_ABS(0x400e)
      .STA_ABS(0x400f) // レングスカウンタをロード（$4003/$4007/$400B等と共通の仕様。実機で必須）
      .label("forever")
      .JMP("forever");

    const { bytes } = asm.assemble();
    const prgRom = new Uint8Array(0x4000);
    prgRom.set(bytes, 0);
    prgRom[0x3ffc] = 0x00;
    prgRom[0x3ffd] = 0x80;
    prgRom[0x3ffe] = 0x00;
    prgRom[0x3fff] = 0x80;

    const header = new Uint8Array(16);
    header.set([0x4e, 0x45, 0x53, 0x1a], 0);
    header[4] = 1;
    header[5] = 1;
    const rom = new Uint8Array(16 + prgRom.length + 0x2000);
    rom.set(header, 0);
    rom.set(prgRom, 16);

    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    expect([0, 1, 2, 3].map((c) => nes.apu.getChannelState(c as 0 | 1 | 2 | 3))).toMatchSnapshot();
  });
});
