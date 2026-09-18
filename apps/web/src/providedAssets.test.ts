import { describe, expect, it } from "vitest";
import { bitmapsForRomBuild, collectUsedAssetIds } from "./collectUsedAssets.js";
import {
  FONT_JP_BASIC_PACK_ID,
  fontJpBasicCharset,
  providedSourceKey,
} from "./providedAssets.js";
import {
  createEmptyBitmap,
  createEmptyProjectV3,
  findOrCreatePalette,
  newAssetId,
} from "./projectV3.js";

describe("provided font catalog", () => {
  it("英数とかなが含まれる", () => {
    const set = fontJpBasicCharset();
    expect(set.includes("A")).toBe(true);
    expect(set.includes("0")).toBe(true);
    expect(set.includes("あ")).toBe(true);
    expect(set.includes("ア")).toBe(true);
    expect(set.length).toBeGreaterThan(100);
  });

  it("providedSourceKey が安定", () => {
    expect(providedSourceKey(FONT_JP_BASIC_PACK_ID, "あ")).toBe("builtin:font-jp-basic:U+3042");
  });
});

describe("collectUsedAssetIds", () => {
  it("配置されたキャラのビットマップだけ CHR 候補になる", () => {
    const p = createEmptyProjectV3(0);
    const pal = findOrCreatePalette(p, [0x0f, 0x30, 0x16, 0x12], "p");
    const usedBmp = createEmptyBitmap(pal.id, { name: "used", tileWidth: 1, tileHeight: 1 });
    const unusedBmp = createEmptyBitmap(pal.id, { name: "unused font", tileWidth: 1, tileHeight: 1 });
    unusedBmp.providedSource = providedSourceKey(FONT_JP_BASIC_PACK_ID, "Z");
    p.bitmaps[usedBmp.id] = usedBmp;
    p.bitmaps[unusedBmp.id] = unusedBmp;
    p.bitmapOrder.push(usedBmp.id, unusedBmp.id);

    const chId = newAssetId("chr");
    p.characters[chId] = {
      id: chId,
      name: "Hero",
      bitmapId: usedBmp.id,
      paletteId: pal.id,
    };
    p.characterOrder.push(chId);

    const sceneId = p.sceneOrder[0]!;
    p.scenes[sceneId]!.placements.push({
      id: newAssetId("plc"),
      characterId: chId,
      x: 10,
      y: 10,
    });

    const used = collectUsedAssetIds(p);
    expect(used.bitmapIds.has(usedBmp.id)).toBe(true);
    expect(used.bitmapIds.has(unusedBmp.id)).toBe(false);
    expect(bitmapsForRomBuild(p)).toEqual([usedBmp.id]);
  });
});
