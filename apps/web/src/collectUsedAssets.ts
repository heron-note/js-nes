/**
 * ビルド時ツリーシェイク用: プロジェクトから「実際に参照されている」資産 ID を集める。
 */

import type { ProjectV3 } from "./projectV3.js";
import { dslIdent } from "./projectBuildV3.js";

export type UsedAssetIds = {
  bitmapIds: Set<string>;
  paletteIds: Set<string>;
  characterIds: Set<string>;
  soundIds: Set<string>;
};

const PLAY_SOUND_RE = /playSound\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

function collectPlaySoundNames(code: string, into: Set<string>): void {
  PLAY_SOUND_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLAY_SOUND_RE.exec(code)) !== null) {
    into.add(m[1]!);
  }
}

/**
 * 現状の参照経路:
 * - シーン配置 → キャラ → bitmap / palette
 * - シーン背景 → bitmap → palette
 * - シーン soundIds
 * - legacyCode / キャラコード内の playSound(名前)
 * - カタログ上の全キャラ（logicBlocks の instance 参照を落とさないため）
 */
export function collectUsedAssetIds(project: ProjectV3): UsedAssetIds {
  const bitmapIds = new Set<string>();
  const paletteIds = new Set<string>();
  const characterIds = new Set<string>();
  const soundIds = new Set<string>();
  const playSoundNames = new Set<string>();

  for (const scene of Object.values(project.scenes)) {
    for (const sid of scene.soundIds) soundIds.add(sid);
    if (scene.backgroundBitmapId) bitmapIds.add(scene.backgroundBitmapId);
    for (const pl of scene.placements) {
      characterIds.add(pl.characterId);
    }
    if (scene.legacyCode) collectPlaySoundNames(scene.legacyCode, playSoundNames);
  }

  for (const id of project.characterOrder) {
    characterIds.add(id);
    const ch = project.characters[id];
    if (ch?.legacyCode) collectPlaySoundNames(ch.legacyCode, playSoundNames);
  }

  for (const id of characterIds) {
    const ch = project.characters[id];
    if (!ch) continue;
    bitmapIds.add(ch.bitmapId);
    if (ch.paletteId) paletteIds.add(ch.paletteId);
  }

  for (const id of [...bitmapIds]) {
    const bmp = project.bitmaps[id];
    if (bmp) paletteIds.add(bmp.paletteId);
  }

  for (const soundId of project.soundOrder) {
    const s = project.sounds[soundId];
    if (!s) continue;
    const name = dslIdent(s.name, "Sound");
    if (playSoundNames.has(name) || playSoundNames.has(s.name)) {
      soundIds.add(soundId);
    }
  }

  return { bitmapIds, paletteIds, characterIds, soundIds };
}

/** CHR に載せるビットマップだけを順序付きで返す（未使用の提供フォント等は除外）。 */
export function bitmapsForRomBuild(project: ProjectV3): string[] {
  const { bitmapIds } = collectUsedAssetIds(project);
  return project.bitmapOrder.filter((id) => bitmapIds.has(id));
}
