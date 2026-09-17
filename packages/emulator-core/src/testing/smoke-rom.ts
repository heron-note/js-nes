import { Asm } from "./mini-asm.js";

export const SMOKE_ROM_BACKDROP_PALETTE_INDEX = 0x01;
export const SMOKE_ROM_FILL_PALETTE_INDEX = 0x21;
export const SMOKE_ROM_FILL_TILE_INDEX = 0x01;

/**
 * emulator-core の動作確認用に手組みする最小の.nes ROM（Mapper 0 / NROM）。
 * 実際のゲームではなく、CPU→PPU→Canvasの描画パイプラインが機能することを示すための
 * スモークテスト専用ROM（画面全体を単色パターンで塗りつぶすだけ）。
 * 生成には dev/test 専用の mini-asm.ts を用いる（DSLコンパイラの前身ではない）。
 */
export function buildSmokeRom(): Uint8Array {
  const asm = new Asm(0x8000);
  asm
    .label("reset")
    .SEI()
    .CLD()
    .LDX_IMM(0xff)
    .TXS()
    .LDA_IMM(0x00)
    .STA_ABS(0x2000) // NMI無効
    .STA_ABS(0x2001) // 描画無効（初期化中）
    .label("vblankwait1")
    .BIT_ABS(0x2002)
    .BPL("vblankwait1")
    .label("vblankwait2")
    .BIT_ABS(0x2002)
    .BPL("vblankwait2")
    // ネームテーブル+属性テーブル(合計1024バイト, $2000-$23FF)をタイル#1で埋める
    .LDA_IMM(0x20)
    .STA_ABS(0x2006)
    .LDA_IMM(0x00)
    .STA_ABS(0x2006)
    .LDA_IMM(SMOKE_ROM_FILL_TILE_INDEX)
    .LDX_IMM(0x00)
    .label("outer_loop")
    .LDY_IMM(0x00)
    .label("inner_loop")
    .STA_ABS(0x2007)
    .DEY()
    .BNE("inner_loop")
    .INX()
    .CPX_IMM(0x04)
    .BNE("outer_loop")
    // 属性テーブル($23C0-$23FF, 64バイト)を0で上書き（全象限をパレットグループ0に統一）
    .LDA_IMM(0x23)
    .STA_ABS(0x2006)
    .LDA_IMM(0xc0)
    .STA_ABS(0x2006)
    .LDA_IMM(0x00)
    .LDX_IMM(0x00)
    .label("attr_loop")
    .STA_ABS(0x2007)
    .INX()
    .CPX_IMM(0x40)
    .BNE("attr_loop")
    // パレット設定（背景色 + パレット0の色1）
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x00)
    .STA_ABS(0x2006)
    .LDA_IMM(SMOKE_ROM_BACKDROP_PALETTE_INDEX)
    .STA_ABS(0x2007)
    .LDA_IMM(SMOKE_ROM_FILL_PALETTE_INDEX)
    .STA_ABS(0x2007)
    // $2006/$2007でのVRAM書き込みはPPUのv/tレジスタ（スクロール位置と共有）を
    // 書き換えてしまうため、実機の作法どおり描画有効化の直前に$2000/$2005で
    // スクロール位置を(ネームテーブル0, 0, 0)へ明示的にリセットする。
    .LDA_IMM(0x00)
    .STA_ABS(0x2000)
    .STA_ABS(0x2005)
    .STA_ABS(0x2005)
    // 背景描画を有効化
    .LDA_IMM(0b0000_1000)
    .STA_ABS(0x2001)
    .label("forever")
    .JMP("forever");

  const { bytes } = asm.assemble();
  if (bytes.length > 0x3ffa) {
    throw new Error("smoke ROM program too large (would overlap interrupt vectors)");
  }

  const prgRom = new Uint8Array(0x4000);
  prgRom.set(bytes, 0);
  const resetAddr = 0x8000;
  prgRom[0x3ffa] = 0x00; // NMIベクタ（未使用）
  prgRom[0x3ffb] = 0x80;
  prgRom[0x3ffc] = resetAddr & 0xff; // Resetベクタ
  prgRom[0x3ffd] = (resetAddr >> 8) & 0xff;
  prgRom[0x3ffe] = 0x00; // IRQ/BRKベクタ（未使用）
  prgRom[0x3fff] = 0x80;

  const chrRom = new Uint8Array(0x2000);
  const tileOffset = SMOKE_ROM_FILL_TILE_INDEX * 16;
  for (let row = 0; row < 8; row++) {
    chrRom[tileOffset + row] = 0xff; // plane0（下位ビット）: 全ドット1
    chrRom[tileOffset + 8 + row] = 0x00; // plane1（上位ビット）: 全ドット0
  }

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0); // "NES\x1A"
  header[4] = 1; // PRG-ROM: 16KB x1
  header[5] = 1; // CHR-ROM: 8KB x1
  header[6] = 0; // flags6: horizontal mirroring, no trainer/battery, mapper low nibble 0
  header[7] = 0; // flags7: mapper high nibble 0

  const rom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, header.length);
  rom.set(chrRom, header.length + prgRom.length);
  return rom;
}
