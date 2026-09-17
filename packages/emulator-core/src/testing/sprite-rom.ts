import { Asm } from "./mini-asm.js";

/**
 * PPUスプライト描画（M4）の動作確認用に手組みする最小の.nes ROM。
 * smoke-rom.ts と同様、実際のゲームではなくテスト専用。
 */

export interface SpriteDef {
  x: number;
  y: number;
  tile: number;
  attr: number;
}

export interface SpriteRomOptions {
  sprites: SpriteDef[];
  /** trueなら背景全面をタイル1(不透明パターン)で塗りつぶす。スプライトの優先度テスト用。 */
  fillBackground?: boolean;
  backdropPaletteIndex?: number;
  bgColor1PaletteIndex?: number;
  spriteColor1PaletteIndex?: number;
}

const BG_TILE_INDEX = 1;
const SPRITE_TILE_INDEX = 2;

export function buildSpriteTestRom(opts: SpriteRomOptions): Uint8Array {
  const backdrop = opts.backdropPaletteIndex ?? 0x01;
  const bgColor1 = opts.bgColor1PaletteIndex ?? 0x11;
  const spriteColor1 = opts.spriteColor1PaletteIndex ?? 0x21;

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
    .BPL("vblankwait2");

  if (opts.fillBackground) {
    asm
      .LDA_IMM(0x20)
      .STA_ABS(0x2006)
      .LDA_IMM(0x00)
      .STA_ABS(0x2006)
      .LDA_IMM(BG_TILE_INDEX)
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
      .BNE("attr_loop");
  }

  // OAM書き込み（OAMADDR=0から連続書き込み）
  asm.LDA_IMM(0x00).STA_ABS(0x2003);
  for (const s of opts.sprites) {
    asm
      .LDA_IMM((s.y - 1) & 0xff)
      .STA_ABS(0x2004)
      .LDA_IMM(s.tile)
      .STA_ABS(0x2004)
      .LDA_IMM(s.attr)
      .STA_ABS(0x2004)
      .LDA_IMM(s.x)
      .STA_ABS(0x2004);
  }

  // パレット: 背景backdrop+色1、スプライトパレット0の色1
  asm
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x00)
    .STA_ABS(0x2006)
    .LDA_IMM(backdrop)
    .STA_ABS(0x2007)
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x01)
    .STA_ABS(0x2006)
    .LDA_IMM(bgColor1)
    .STA_ABS(0x2007)
    .LDA_IMM(0x3f)
    .STA_ABS(0x2006)
    .LDA_IMM(0x11)
    .STA_ABS(0x2006)
    .LDA_IMM(spriteColor1)
    .STA_ABS(0x2007);

  const mask = 0b0001_0000 | (opts.fillBackground ? 0b0000_1000 : 0);
  asm
    .LDA_IMM(mask)
    .STA_ABS(0x2001)
    .label("forever")
    .JMP("forever");

  const { bytes } = asm.assemble();
  if (bytes.length > 0x3ffa) {
    throw new Error("sprite test ROM program too large (would overlap interrupt vectors)");
  }

  const prgRom = new Uint8Array(0x4000);
  prgRom.set(bytes, 0);
  const resetAddr = 0x8000;
  prgRom[0x3ffa] = 0x00;
  prgRom[0x3ffb] = 0x80;
  prgRom[0x3ffc] = resetAddr & 0xff;
  prgRom[0x3ffd] = (resetAddr >> 8) & 0xff;
  prgRom[0x3ffe] = 0x00;
  prgRom[0x3fff] = 0x80;

  const chrRom = new Uint8Array(0x2000);
  // BG_TILE_INDEX: 全ドット pixelValue=1（不透明）
  for (let row = 0; row < 8; row++) {
    chrRom[BG_TILE_INDEX * 16 + row] = 0xff;
    chrRom[BG_TILE_INDEX * 16 + 8 + row] = 0x00;
  }
  // SPRITE_TILE_INDEX: 全ドット pixelValue=1（不透明）。スプライト用に別タイル番号を使う。
  for (let row = 0; row < 8; row++) {
    chrRom[SPRITE_TILE_INDEX * 16 + row] = 0xff;
    chrRom[SPRITE_TILE_INDEX * 16 + 8 + row] = 0x00;
  }

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0);
  header[4] = 1;
  header[5] = 1;
  header[6] = 0;
  header[7] = 0;

  const rom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, header.length);
  rom.set(chrRom, header.length + prgRom.length);
  return rom;
}

export { BG_TILE_INDEX, SPRITE_TILE_INDEX };
