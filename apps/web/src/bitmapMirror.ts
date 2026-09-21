/**
 * ビットマップの左右ミラー（ツール側）。
 * 実行時 flip ではなく、左右向き用の別資産をリンク同期する。
 */

import { createEmptyBitmap, newAssetId, type ProjectV3 } from "./projectV3.js";

/** タイル格子を画面として左右反転した pixels を返す。 */
export function flipPixelsHorizontal(
  pixels: number[],
  tileWidth: number,
  tileHeight: number,
): number[] {
  const expected = tileWidth * tileHeight * 64;
  const out = new Array(expected).fill(0);
  for (let ty = 0; ty < tileHeight; ty++) {
    for (let tx = 0; tx < tileWidth; tx++) {
      const srcBase = (ty * tileWidth + tx) * 64;
      const dstTx = tileWidth - 1 - tx;
      const dstBase = (ty * tileWidth + dstTx) * 64;
      for (let ly = 0; ly < 8; ly++) {
        for (let lx = 0; lx < 8; lx++) {
          out[dstBase + ly * 8 + (7 - lx)] = (pixels[srcBase + ly * 8 + lx] ?? 0) & 3;
        }
      }
    }
  }
  return out;
}

/** ミラー関係のソース側 ID（自分がソースなら自身）。 */
export function mirrorSourceId(project: ProjectV3, bitmapId: string): string {
  const bmp = project.bitmaps[bitmapId];
  if (!bmp) return bitmapId;
  return bmp.mirrorOfId ?? bitmapId;
}

/**
 * 編集したビットマップを正として、リンク先へ左右反転を同期する。
 * ミラー側を編集した場合はソースへ書き戻し、そのソースの全ミラーを更新する。
 */
export function syncBitmapMirrors(project: ProjectV3, editedId: string): void {
  const edited = project.bitmaps[editedId];
  if (!edited) return;

  const sourceId = edited.mirrorOfId ?? editedId;
  const source = project.bitmaps[sourceId];
  if (!source) return;

  if (edited.mirrorOfId) {
    if (edited.mirrorOfId !== sourceId) return;
    source.tileWidth = edited.tileWidth;
    source.tileHeight = edited.tileHeight;
    source.pixels = flipPixelsHorizontal(edited.pixels, edited.tileWidth, edited.tileHeight);
    source.paletteId = edited.paletteId;
  }

  for (const id of project.bitmapOrder) {
    if (id === sourceId) continue;
    const bmp = project.bitmaps[id];
    if (!bmp || bmp.mirrorOfId !== sourceId) continue;
    bmp.tileWidth = source.tileWidth;
    bmp.tileHeight = source.tileHeight;
    bmp.paletteId = source.paletteId;
    bmp.pixels = flipPixelsHorizontal(source.pixels, source.tileWidth, source.tileHeight);
  }
}

/** ソースの左右ミラー資産を新規作成して返す（作成した id）。 */
export function createHorizontalMirrorBitmap(project: ProjectV3, sourceId: string): string {
  const source = project.bitmaps[sourceId];
  if (!source) throw new Error("ミラー元のビットマップが見つかりません");
  if (source.mirrorOfId) {
    throw new Error("ミラー資産からさらにミラーは作れません。元のビットマップ側から作成してください");
  }

  const existing = project.bitmapOrder.find((id) => project.bitmaps[id]?.mirrorOfId === sourceId);
  if (existing) return existing;

  const mirror = createEmptyBitmap(source.paletteId, {
    id: newAssetId("bmp"),
    name: `${source.name}（左右）`,
    tileWidth: source.tileWidth,
    tileHeight: source.tileHeight,
  });
  mirror.mirrorOfId = source.id;
  mirror.mirrorAxis = "horizontal";
  mirror.pixels = flipPixelsHorizontal(source.pixels, source.tileWidth, source.tileHeight);
  project.bitmaps[mirror.id] = mirror;
  const srcIdx = project.bitmapOrder.indexOf(sourceId);
  if (srcIdx >= 0) project.bitmapOrder.splice(srcIdx + 1, 0, mirror.id);
  else project.bitmapOrder.push(mirror.id);
  return mirror.id;
}

/** ソース削除時などに、当該 ID を参照するミラーリンクを外す。 */
export function unlinkMirrorsOf(project: ProjectV3, sourceId: string): void {
  for (const id of project.bitmapOrder) {
    const bmp = project.bitmaps[id];
    if (!bmp || bmp.mirrorOfId !== sourceId) continue;
    delete bmp.mirrorOfId;
    delete bmp.mirrorAxis;
  }
}
