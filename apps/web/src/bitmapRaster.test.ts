import { describe, expect, it } from "vitest";
import {
  extractNesPaletteFromRgba,
  nearestPaletteSlot,
  rasterToBitmapPixels,
  suggestTileSize,
} from "./bitmapRaster.js";
import {
  createEmptyProjectV3,
  findIdenticalPalette,
  findOrCreatePalette,
  migrateProjectV2toV3,
} from "./projectV3.js";
import { createEmptyProject, type Project } from "./project.js";

describe("bitmapRaster", () => {
  it("suggestTileSize は 8px 単位で切り上げる", () => {
    expect(suggestTileSize(8, 8)).toEqual({ tileWidth: 1, tileHeight: 1 });
    expect(suggestTileSize(9, 16)).toEqual({ tileWidth: 2, tileHeight: 2 });
    expect(suggestTileSize(1, 1)).toEqual({ tileWidth: 1, tileHeight: 1 });
  });

  it("nearestPaletteSlot は近い色を選ぶ", () => {
    const pal: [number, number, number, number] = [0x0f, 0x30, 0x16, 0x12];
    expect(nearestPaletteSlot(255, 255, 255, pal)).toBe(1);
  });

  it("rasterToBitmapPixels はタイル順に埋める", () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i++) {
      rgba[i * 4] = 200;
      rgba[i * 4 + 1] = 40;
      rgba[i * 4 + 2] = 40;
      rgba[i * 4 + 3] = 255;
    }
    const pal: [number, number, number, number] = [0x0f, 0x16, 0x30, 0x12];
    const pixels = rasterToBitmapPixels(rgba, 8, 8, 1, 1, pal);
    expect(pixels.length).toBe(64);
    expect(pixels.every((p) => p === 1)).toBe(true);
  });

  it("透明はスロット0", () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    const pal: [number, number, number, number] = [0x0f, 0x30, 0x16, 0x12];
    const pixels = rasterToBitmapPixels(rgba, 8, 8, 1, 1, pal);
    expect(pixels.every((p) => p === 0)).toBe(true);
  });

  it("extractNesPaletteFromRgba は4色を返す", () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }
    const colors = extractNesPaletteFromRgba(rgba, 8, 8);
    expect(colors).toHaveLength(4);
  });
});

describe("findOrCreatePalette", () => {
  it("同一色なら再利用する", () => {
    const p = createEmptyProjectV3(0);
    const colors: [number, number, number, number] = [0x0f, 0x16, 0x21, 0x30];
    const a = findOrCreatePalette(p, colors, "A");
    const before = p.paletteOrder.length;
    const b = findOrCreatePalette(p, colors, "B");
    expect(b.id).toBe(a.id);
    expect(p.paletteOrder.length).toBe(before);
    expect(findIdenticalPalette(p, colors)?.id).toBe(a.id);
  });

  it("違う色なら新規作成する", () => {
    const p = createEmptyProjectV3(0);
    const a = findOrCreatePalette(p, [0x0f, 0x01, 0x02, 0x03], "A");
    const b = findOrCreatePalette(p, [0x0f, 0x10, 0x20, 0x30], "B");
    expect(b.id).not.toBe(a.id);
  });

  it("v2移行キャラは paletteId を持つ", () => {
    const v2: Project = createEmptyProject();
    v2.parts.push({ name: "P", tiles: [new Array(64).fill(0)], code: "" });
    v2.scenes.push({ name: "S", code: "" });
    const v3 = migrateProjectV2toV3(v2);
    const ch = v3.characters[v3.characterOrder[0]!]!;
    expect(ch.paletteId).toBeTruthy();
    expect(v3.palettes[ch.paletteId]).toBeTruthy();
  });
});
