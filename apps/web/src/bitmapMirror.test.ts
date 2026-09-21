import { describe, expect, it } from "vitest";
import {
  createHorizontalMirrorBitmap,
  flipPixelsHorizontal,
  syncBitmapMirrors,
  unlinkMirrorsOf,
} from "./bitmapMirror.js";
import { createEmptyBitmap, createEmptyProjectV3, validateProjectV3 } from "./projectV3.js";

describe("bitmapMirror", () => {
  it("1タイルを左右反転する", () => {
    const pixels = new Array(64).fill(0);
    pixels[0] = 1; // 左上
    pixels[7] = 2; // 右上
    const flipped = flipPixelsHorizontal(pixels, 1, 1);
    expect(flipped[0]).toBe(2);
    expect(flipped[7]).toBe(1);
  });

  it("2タイル幅ではタイル列も入れ替える", () => {
    const pixels = new Array(128).fill(0);
    pixels[0] = 1; // 左タイル左上
    pixels[64] = 3; // 右タイル左上
    const flipped = flipPixelsHorizontal(pixels, 2, 1);
    expect(flipped[0]).toBe(0);
    expect(flipped[7]).toBe(3); // 右タイルが左へ、行内も反転
    expect(flipped[64 + 7]).toBe(1);
  });

  it("左右ミラーを作成し、ソース編集で同期する", () => {
    const p = createEmptyProjectV3(0);
    const palId = p.paletteOrder[0]!;
    const src = createEmptyBitmap(palId, { name: "Hero", tileWidth: 1, tileHeight: 1 });
    src.pixels[0] = 1;
    p.bitmaps[src.id] = src;
    p.bitmapOrder.push(src.id);

    const mid = createHorizontalMirrorBitmap(p, src.id);
    const mirror = p.bitmaps[mid]!;
    expect(mirror.mirrorOfId).toBe(src.id);
    expect(mirror.pixels[7]).toBe(1);

    src.pixels[0] = 0;
    src.pixels[1] = 2;
    syncBitmapMirrors(p, src.id);
    expect(p.bitmaps[mid]!.pixels[6]).toBe(2);
  });

  it("ミラー側を編集するとソースへ書き戻す", () => {
    const p = createEmptyProjectV3(0);
    const palId = p.paletteOrder[0]!;
    const src = createEmptyBitmap(palId, { name: "A", tileWidth: 1, tileHeight: 1 });
    p.bitmaps[src.id] = src;
    p.bitmapOrder.push(src.id);
    const mid = createHorizontalMirrorBitmap(p, src.id);
    const mirror = p.bitmaps[mid]!;
    mirror.pixels[0] = 3;
    syncBitmapMirrors(p, mid);
    expect(src.pixels[7]).toBe(3);
    expect(mirror.pixels[0]).toBe(3);
  });

  it("ソース削除時のリンク解除", () => {
    const p = createEmptyProjectV3(0);
    const palId = p.paletteOrder[0]!;
    const src = createEmptyBitmap(palId, { name: "A", tileWidth: 1, tileHeight: 1 });
    p.bitmaps[src.id] = src;
    p.bitmapOrder.push(src.id);
    const mid = createHorizontalMirrorBitmap(p, src.id);
    unlinkMirrorsOf(p, src.id);
    expect(p.bitmaps[mid]!.mirrorOfId).toBeUndefined();
  });

  it("validateProjectV3 が不正な mirrorOfId を拒否する", () => {
    const p = createEmptyProjectV3(0);
    const palId = p.paletteOrder[0]!;
    p.bitmaps["bmp_a"] = {
      id: "bmp_a",
      name: "a",
      tileWidth: 1,
      tileHeight: 1,
      pixels: new Array(64).fill(0),
      paletteId: palId,
      mirrorOfId: "missing",
      mirrorAxis: "horizontal",
    };
    p.bitmapOrder.push("bmp_a");
    expect(() => validateProjectV3(p)).toThrow(/mirrorOfId/);
  });
});
