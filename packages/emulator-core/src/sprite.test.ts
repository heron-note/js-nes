import { describe, expect, it } from "vitest";
import { Nes } from "./nes.js";
import { NES_PALETTE } from "./palette.js";
import { buildSpriteTestRom } from "./testing/sprite-rom.js";

function rgbOf(paletteIndex: number): [number, number, number] {
  const rgb = NES_PALETTE[paletteIndex] ?? 0;
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

function pixelAt(fb: Uint8ClampedArray, x: number, y: number): [number, number, number, number] {
  const idx = (y * 256 + x) * 4;
  return [fb[idx] ?? -1, fb[idx + 1] ?? -1, fb[idx + 2] ?? -1, fb[idx + 3] ?? -1];
}

describe("PPU sprite rendering (M4)", () => {
  it("draws an 8x8 sprite at its OAM position over the backdrop", () => {
    const rom = buildSpriteTestRom({
      sprites: [{ x: 100, y: 50, tile: 2, attr: 0 }],
      backdropPaletteIndex: 0x01,
      spriteColor1PaletteIndex: 0x21,
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    const [r, g, b] = rgbOf(0x21);
    expect(pixelAt(nes.ppu.framebuffer, 100, 50)).toEqual([r, g, b, 255]);
    expect(pixelAt(nes.ppu.framebuffer, 103, 53)).toEqual([r, g, b, 255]); // タイル内部

    const [br, bg, bb] = rgbOf(0x01);
    expect(pixelAt(nes.ppu.framebuffer, 0, 0)).toEqual([br, bg, bb, 255]); // 遠く離れた位置は背景色のまま
    expect(pixelAt(nes.ppu.framebuffer, 100, 60)).toEqual([br, bg, bb, 255]); // スプライトの8px範囲外
  });

  it("front sprite (attr bit5=0) is drawn over opaque background", () => {
    const rom = buildSpriteTestRom({
      sprites: [{ x: 50, y: 50, tile: 2, attr: 0x00 }],
      fillBackground: true,
      backdropPaletteIndex: 0x01,
      bgColor1PaletteIndex: 0x11,
      spriteColor1PaletteIndex: 0x21,
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    const [r, g, b] = rgbOf(0x21);
    expect(pixelAt(nes.ppu.framebuffer, 50, 50)).toEqual([r, g, b, 255]);
  });

  it("behind-background sprite (attr bit5=1) is hidden by opaque background", () => {
    const rom = buildSpriteTestRom({
      sprites: [{ x: 50, y: 50, tile: 2, attr: 0x20 }],
      fillBackground: true,
      backdropPaletteIndex: 0x01,
      bgColor1PaletteIndex: 0x11,
      spriteColor1PaletteIndex: 0x21,
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    const [r, g, b] = rgbOf(0x11); // 背景色が勝つ
    expect(pixelAt(nes.ppu.framebuffer, 50, 50)).toEqual([r, g, b, 255]);
  });

  it("sets the sprite-0 hit flag when sprite 0 overlaps opaque background", () => {
    const rom = buildSpriteTestRom({
      sprites: [{ x: 50, y: 50, tile: 2, attr: 0x00 }],
      fillBackground: true,
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    expect((nes.ppu.status & 0x40) !== 0).toBe(true);
  });

  it("only draws the first 8 sprites evaluated on a scanline (hardware limit)", () => {
    const sprites = Array.from({ length: 9 }, (_, i) => ({ x: i * 8, y: 100, tile: 2, attr: 0 }));
    const rom = buildSpriteTestRom({ sprites, backdropPaletteIndex: 0x01, spriteColor1PaletteIndex: 0x21 });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    const [sr, sg, sb] = rgbOf(0x21);
    const [br, bg, bb] = rgbOf(0x01);

    for (let i = 0; i < 8; i++) {
      expect(pixelAt(nes.ppu.framebuffer, i * 8, 100)).toEqual([sr, sg, sb, 255]);
    }
    // 9枚目（OAMインデックス8）は評価上限を超えるため描画されない
    expect(pixelAt(nes.ppu.framebuffer, 8 * 8, 100)).toEqual([br, bg, bb, 255]);
  });

  it("supports horizontal and vertical flip attributes without throwing", () => {
    const rom = buildSpriteTestRom({
      sprites: [{ x: 20, y: 20, tile: 2, attr: 0xc0 }], // flipH + flipV
    });
    const nes = new Nes();
    nes.loadRom(rom);
    expect(() => {
      for (let i = 0; i < 5; i++) nes.runFrame();
    }).not.toThrow();
    // 全ドットが均一パターンのテストタイルなので、反転しても表示位置・色は変わらない
    const [r, g, b] = rgbOf(0x21);
    expect(pixelAt(nes.ppu.framebuffer, 20, 20)).toEqual([r, g, b, 255]);
  });
});
