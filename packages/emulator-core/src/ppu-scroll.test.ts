import { describe, expect, it } from "vitest";
import { Nes } from "./nes.js";
import { Asm } from "./testing/mini-asm.js";

/**
 * PPUSCROLL（$2005）のスクロール実装（Phase 1）の検証用。
 * タイル1番=色1（不透明）、タイル2番=色2（不透明）、それ以外(タイル0番)=透明(背景色)
 * になるようネームテーブルの一部だけを明示的に書き込んだ最小ROMを使う。
 */

const TILE1_COLOR_INDEX = 1;
const TILE2_COLOR_INDEX = 2;

function buildScrollTestRom(): Uint8Array {
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
    // ネームテーブル (0,0)=タイル1, (1,0)=タイル2, (0,1)=タイル2 をそれぞれ個別に書く
    .LDA_IMM(0x20)
    .STA_ABS(0x2006)
    .LDA_IMM(0x00)
    .STA_ABS(0x2006)
    .LDA_IMM(1)
    .STA_ABS(0x2007) // (col0,row0) = tile1
    .LDA_IMM(2)
    .STA_ABS(0x2007) // (col1,row0) = tile2
    .LDA_IMM(0x20)
    .STA_ABS(0x2006)
    .LDA_IMM(0x20)
    .STA_ABS(0x2006)
    .LDA_IMM(2)
    .STA_ABS(0x2007) // (col0,row1) = tile2 ($2020 = row1*32+col0)
    // パレット: backdrop=0x01, 色1=0x21(tile1用), 色2=0x30(tile2用)
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x00)
    .STA_ABS(0x2006)
    .LDA_IMM(0x01)
    .STA_ABS(0x2007)
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x01)
    .STA_ABS(0x2006)
    .LDA_IMM(0x21)
    .STA_ABS(0x2007)
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x02)
    .STA_ABS(0x2006)
    .LDA_IMM(0x30)
    .STA_ABS(0x2007)
    // $2006/$2007でのVRAM書き込みはPPUのv/tレジスタ（スクロール位置と共有）を
    // 書き換えてしまうため、実機の作法どおり描画有効化の直前に$2000/$2005で
    // スクロール位置を(ネームテーブル0, 0, 0)へ明示的にリセットする。
    .LDA_IMM(0x00)
    .STA_ABS(0x2000)
    .STA_ABS(0x2005)
    .STA_ABS(0x2005)
    .LDA_IMM(0b0000_1000) // 背景のみ描画有効
    .STA_ABS(0x2001)
    .label("forever")
    .JMP("forever");

  const { bytes } = asm.assemble();
  const prgRom = new Uint8Array(0x4000);
  prgRom.set(bytes, 0);
  prgRom[0x3ffc] = 0x00;
  prgRom[0x3ffd] = 0x80;
  prgRom[0x3ffe] = 0x00;
  prgRom[0x3fff] = 0x80;

  const chrRom = new Uint8Array(0x2000);
  for (let row = 0; row < 8; row++) {
    chrRom[TILE1_COLOR_INDEX * 16 + row] = 0xff; // plane0 全ビット1
    chrRom[TILE1_COLOR_INDEX * 16 + 8 + row] = 0x00; // plane1 全ビット0 => pixelValue=1
    chrRom[TILE2_COLOR_INDEX * 16 + row] = 0x00;
    chrRom[TILE2_COLOR_INDEX * 16 + 8 + row] = 0xff; // pixelValue=2
  }

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0);
  header[4] = 1;
  header[5] = 1;
  const rom = new Uint8Array(16 + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, 16);
  rom.set(chrRom, 16 + prgRom.length);
  return rom;
}

function pixelAt(fb: Uint8ClampedArray, x: number, y: number): [number, number, number] {
  const idx = (y * 256 + x) * 4;
  return [fb[idx] ?? -1, fb[idx + 1] ?? -1, fb[idx + 2] ?? -1];
}

function bootedNes(): Nes {
  const nes = new Nes();
  nes.loadRom(buildScrollTestRom());
  for (let i = 0; i < 5; i++) nes.runFrame();
  return nes;
}

describe("PPU scrolling ($2005 PPUSCROLL)", () => {
  it("スクロール0のとき、タイル1/タイル2がそのままの位置に表示される", () => {
    const nes = bootedNes();
    const tile1 = pixelAt(nes.ppu.framebuffer, 4, 4);
    const tile2 = pixelAt(nes.ppu.framebuffer, 12, 4);
    const backdrop = pixelAt(nes.ppu.framebuffer, 100, 4);
    expect(tile1).not.toEqual(tile2);
    expect(tile1).not.toEqual(backdrop);
  });

  it("scrollXを8(1タイル分)にすると、画面が1タイル左にずれる（列0に元・列1の絵が出る）", () => {
    const nes = bootedNes();
    const before0 = pixelAt(nes.ppu.framebuffer, 4, 4); // tile1の色
    const before1 = pixelAt(nes.ppu.framebuffer, 12, 4); // tile2の色

    nes.writeCpuMemory(0x2005, 8); // scrollX = 8
    nes.writeCpuMemory(0x2005, 0); // scrollY = 0
    nes.runFrame();

    const after0 = pixelAt(nes.ppu.framebuffer, 4, 4);
    expect(after0).toEqual(before1); // 元々タイル2があった位置の絵が画面左端に出る
    expect(after0).not.toEqual(before0);
  });

  it("scrollYを8(1タイル分)にすると、画面が1タイル上にずれる", () => {
    const nes = bootedNes();
    const beforeRow0 = pixelAt(nes.ppu.framebuffer, 4, 4); // (col0,row0)=tile1
    const beforeRow1 = pixelAt(nes.ppu.framebuffer, 4, 12); // (col0,row1)=tile2

    nes.writeCpuMemory(0x2005, 0); // scrollX = 0
    nes.writeCpuMemory(0x2005, 8); // scrollY = 8
    nes.runFrame();

    const afterRow0 = pixelAt(nes.ppu.framebuffer, 4, 4);
    expect(afterRow0).toEqual(beforeRow1);
    expect(afterRow0).not.toEqual(beforeRow0);
  });

  it("$2005を書いた直後でも$2006/$2007(パレット書き込み等)がwriteToggle共有の影響を受けず正しく動く", () => {
    const nes = bootedNes();

    // $2005(scrollX, scrollY)を1組書いてトグルを0に戻したあと、
    // 続けて$2006(hi,lo)+$2007を書く。DSLランタイムは$2005を使わないが、
    // このwriteToggle統合が既存の$2006/$2007の挙動に副作用を与えないことを確認する。
    nes.writeCpuMemory(0x2005, 5); // scrollX = 5, toggle: 0→1
    nes.writeCpuMemory(0x2005, 0); // scrollY = 0, toggle: 1→0

    nes.writeCpuMemory(0x2006, 0x3f);
    nes.writeCpuMemory(0x2006, 0x00);
    nes.writeCpuMemory(0x2007, 0x0a); // backdropを0x0aに変更
    nes.runFrame();

    expect(nes.ppu.getPaletteEntry(0)).toBe(0x0a);
  });
});
