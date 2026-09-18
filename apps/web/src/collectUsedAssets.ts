/**
 * ビルド時ツリーシェイク用: プロジェクトから「実際に参照されている」資産 ID を集める。
 * 提供フォントを全部取り込んでも、キャラ／背景／（将来のテキスト）から辿れない CHR はバイナリに入れない。
 */

import type { ProjectV3 } from "./projectV3.js";

export type UsedAssetIds = {
  bitmapIds: Set<string>;
  paletteIds: Set<string>;
  characterIds: Set<string>;
  soundIds: Set<string>;
};

/**
 * 現状の参照経路:
 * - シーン配置 → キャラ → bitmap / palette
 * - シーン背景 → bitmap → palette
 * - シーン soundIds
 * （将来: テキストラン → providedSource の字ビットマップ）
 */
export function collectUsedAssetIds(project: ProjectV3): UsedAssetIds {
  const bitmapIds = new Set<string>();
  const paletteIds = new Set<string>();
  const characterIds = new Set<string>();
  const soundIds = new Set<string>();

  for (const scene of Object.values(project.scenes)) {
    for (const sid of scene.soundIds) soundIds.add(sid);
    if (scene.backgroundBitmapId) bitmapIds.add(scene.backgroundBitmapId);
    for (const pl of scene.placements) {
      characterIds.add(pl.characterId);
      const ch = project.characters[pl.characterId];
      if (!ch) continue;
      bitmapIds.add(ch.bitmapId);
      paletteIds.add(ch.paletteId);
    }
  }

  // 配置されていないが「編集中の正」として残す場合もあるので、
  // キャラ一覧そのものはビルド対象にしない（配置されたものだけ）。
  // 背景ビットマップのパレットも拾う。
  for (const id of [...bitmapIds]) {
    const bmp = project.bitmaps[id];
    if (bmp) paletteIds.add(bmp.paletteId);
  }

  return { bitmapIds, paletteIds, characterIds, soundIds };
}

/** CHR に載せるビットマップだけを順序付きで返す（未使用の提供フォント等は除外）。 */
export function bitmapsForRomBuild(project: ProjectV3): string[] {
  const { bitmapIds } = collectUsedAssetIds(project);
  return project.bitmapOrder.filter((id) => bitmapIds.has(id));
}
