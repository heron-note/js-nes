import { describe, expect, it } from "vitest";
import {
  extractNesPaletteFromRgba,
  nearestPaletteSlot,
  rasterToBitmapPixels,
  suggestTileSize,
} from "./bitmapRaster.js";

function solidRgba(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

function halfRgba(w: number, h: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const left = x < w / 2;
      rgba[i] = left ? 200 : 255;
      rgba[i + 1] = left ? 40 : 255;
      rgba[i + 2] = left ? 40 : 255;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}
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

describe("rasterToBitmapPixels transform（fit / fill / offset / scale）", () => {
  // (200,40,40) → スロット1、白(255,255,255) → スロット2、になるパレット
  const pal: [number, number, number, number] = [0x0f, 0x16, 0x30, 0x12];

  it("fit は縦横比を保ち、余白がスロット0になる", () => {
    const rgba = solidRgba(16, 8, 200, 40, 40);
    const pixels = rasterToBitmapPixels(rgba, 16, 8, 1, 1, pal, { mode: "fit" });
    // 8x8 枠に 16x8 を fit → 描画 8x4、上下に2pxずつ余白
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const expected = y >= 2 && y <= 5 ? 1 : 0;
        expect(pixels[y * 8 + x]).toBe(expected);
      }
    }
  });

  it("fit + scale 0.5 でさらに小さく中央に収まる", () => {
    const rgba = solidRgba(16, 8, 200, 40, 40);
    const pixels = rasterToBitmapPixels(rgba, 16, 8, 1, 1, pal, { mode: "fit", scale: 0.5 });
    // 描画 4x2、原点 (2,3)
    expect(pixels[0]).toBe(0);
    expect(pixels[3 * 8 + 2]).toBe(1);
    expect(pixels[4 * 8 + 5]).toBe(1);
    expect(pixels[3 * 8 + 1]).toBe(0);
    expect(pixels[5 * 8 + 3]).toBe(0);
  });

  it("fill は枠いっぱいに拡大し、offset で切り取り位置が変わる", () => {
    const rgba = halfRgba(16, 8);
    const center = rasterToBitmapPixels(rgba, 16, 8, 1, 1, pal, { mode: "fill" });
    // fill 倍率1 → 元の x=4..11 が見える：左半分スロット1、右半分スロット2
    expect(center[0]).toBe(1);
    expect(center[7]).toBe(2);

    const left = rasterToBitmapPixels(rgba, 16, 8, 1, 1, pal, { mode: "fill", offsetX: 4 });
    expect(left.every((p) => p === 1)).toBe(true);

    const right = rasterToBitmapPixels(rgba, 16, 8, 1, 1, pal, { mode: "fill", offsetX: -4 });
    expect(right.every((p) => p === 2)).toBe(true);
  });

  it("transform 省略と stretch 明示は同じ結果", () => {
    const rgba = halfRgba(16, 16);
    const a = rasterToBitmapPixels(rgba, 16, 16, 2, 1, pal);
    const b = rasterToBitmapPixels(rgba, 16, 16, 2, 1, pal, { mode: "stretch" });
    expect(b).toEqual(a);
  });
});
