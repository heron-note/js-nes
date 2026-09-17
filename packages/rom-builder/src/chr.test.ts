import { describe, expect, it } from "vitest";
import { ChrPackError, packChrRom, packChrTile } from "./chr.js";

describe("packChrTile", () => {
  it("packs an all-zero tile into 16 zero bytes", () => {
    const pixels = new Array(64).fill(0);
    const bytes = packChrTile(pixels);
    expect(bytes).toHaveLength(16);
    expect(Array.from(bytes)).toEqual(new Array(16).fill(0));
  });

  it("packs a solid color-1 tile (plane0=0xFF, plane1=0x00 for every row)", () => {
    const pixels = new Array(64).fill(1);
    const bytes = packChrTile(pixels);
    for (let row = 0; row < 8; row++) {
      expect(bytes[row]).toBe(0xff);
      expect(bytes[row + 8]).toBe(0x00);
    }
  });

  it("packs a solid color-3 tile (plane0=0xFF, plane1=0xFF for every row)", () => {
    const pixels = new Array(64).fill(3);
    const bytes = packChrTile(pixels);
    for (let row = 0; row < 8; row++) {
      expect(bytes[row]).toBe(0xff);
      expect(bytes[row + 8]).toBe(0xff);
    }
  });

  it("packs a specific per-pixel pattern correctly (MSB=leftmost pixel)", () => {
    // 1行目: 左端(col0)のみ color2(0b10)、それ以外は0
    const pixels = new Array(64).fill(0);
    pixels[0] = 2;
    const bytes = packChrTile(pixels);
    expect(bytes[0]).toBe(0x00); // plane0 row0: ビットなし
    expect(bytes[8]).toBe(0b1000_0000); // plane1 row0: 最左ビット(bit7)が立つ
  });

  it("throws ChrPackError when pixel count is not 64", () => {
    expect(() => packChrTile(new Array(10).fill(0))).toThrow(ChrPackError);
  });

  it("throws ChrPackError when a pixel value is out of range", () => {
    const pixels = new Array(64).fill(0);
    pixels[5] = 4;
    expect(() => packChrTile(pixels)).toThrow(ChrPackError);
  });
});

describe("packChrRom", () => {
  it("places each tile at a 16-byte-aligned offset within the bank", () => {
    const tileA = new Array(64).fill(1);
    const tileB = new Array(64).fill(3);
    const rom = packChrRom([tileA, tileB]);
    expect(rom.length).toBe(0x2000);
    expect(rom[0]).toBe(0xff); // tileA row0 plane0
    expect(rom[16]).toBe(0xff); // tileB row0 plane0
    expect(rom[16 + 8]).toBe(0xff); // tileB row0 plane1
  });

  it("leaves untouched regions as zero", () => {
    const rom = packChrRom([new Array(64).fill(1)]);
    expect(rom[16]).toBe(0); // 2つ目のタイル領域は未使用のまま0
  });
});
