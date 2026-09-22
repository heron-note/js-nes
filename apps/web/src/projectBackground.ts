/**
 * Create v3 のシーン背景ビットマップ → compile() 用 backgroundTiles。
 * CHR 先頭の空白タイル（index 0）の直後に連結されるため、最初の背景タイルは常に 1。
 */
import { bitmapToTiles } from "./projectBuildV3.js";
import type { ProjectV3 } from "./projectV3.js";

export const BACKGROUND_TILE_BASE = 1;

/** シーンが参照する背景ビットマップを、重複なし・bitmapOrder 順でタイル化する。 */
export function buildBackgroundTilesFromV3(v3: ProjectV3): number[][] {
  const seen = new Set<string>();
  const tiles: number[][] = [];
  for (const sceneId of v3.sceneOrder) {
    const sc = v3.scenes[sceneId];
    const bmpId = sc?.backgroundBitmapId;
    if (!bmpId || seen.has(bmpId)) continue;
    seen.add(bmpId);
    const bmp = v3.bitmaps[bmpId];
    if (!bmp) continue;
    tiles.push(...bitmapToTiles(bmp));
  }
  return tiles;
}
