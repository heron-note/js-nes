/**
 * ProjectV3 → 既存 dsl-compiler 向け v2 Project への変換（当面 Mapper 0 ビルド用）。
 */
import type { Project, ProjectPart, ProjectScene, ProjectSound } from "./project.js";
import type { BitmapAsset, ProjectV3 } from "./projectV3.js";
import { MAPPER_CAPABILITIES } from "./mapperCapabilities.js";

export class ProjectV3BuildError extends Error {}

/** ビットマップのタイル格子を v2 part.tiles（各 64 要素）へ。 */
export function bitmapToTiles(bitmap: BitmapAsset | undefined): number[][] {
  if (!bitmap) return [new Array(64).fill(0)];
  const tiles: number[][] = [];
  const count = bitmap.tileWidth * bitmap.tileHeight;
  for (let i = 0; i < count; i++) {
    const base = i * 64;
    const tile = bitmap.pixels.slice(base, base + 64);
    while (tile.length < 64) tile.push(0);
    tiles.push(tile);
  }
  return tiles.length > 0 ? tiles : [new Array(64).fill(0)];
}

/** DSL 識別子として使える名前に正規化。 */
export function dslIdent(name: string, fallback: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) return cleaned;
  return fallback;
}

function sceneCodeFromPlacements(v3: ProjectV3, sceneId: string): string {
  const sc = v3.scenes[sceneId];
  if (!sc || sc.placements.length === 0) return "";
  const lines: string[] = [];
  const calls: string[] = [];
  const initLines: string[] = [];

  const firstPalId = v3.paletteOrder[0];
  const firstPal = firstPalId ? v3.palettes[firstPalId] : undefined;
  if (firstPal) {
    const [c0, c1, c2, c3] = firstPal.colors;
    initLines.push(`  setPalette(0, ${c0}, ${c1}, ${c2}, ${c3});`);
    initLines.push(`  setSpritePalette(0, ${c0}, ${c1}, ${c2}, ${c3});`);
  }

  sc.placements.forEach((pl, i) => {
    const ch = v3.characters[pl.characterId];
    if (!ch) return;
    const partName = dslIdent(ch.name, `Part${i}`);
    const instName = dslIdent(`p${i}_${ch.name}`, `inst${i}`);
    lines.push(`instance ${instName}: ${partName};`);
    calls.push(`  ${partName}.move(${instName});`);
    // 配置座標を初期値として書く（field がある前提。無ければ実行時無視されうる）
    initLines.push(`  // placement ${instName} @ ${pl.x},${pl.y}`);
  });
  if (lines.length === 0) return "";
  const initBlock =
    initLines.length > 0 ? `\nfunction init() {\n${initLines.join("\n")}\n}\n` : "";
  return `${lines.join("\n")}\n${initBlock}\nupdate() {\n${calls.join("\n")}\n}\n`;
}

/**
 * v3 を v2 に落として既存ビルド経路へ渡す。
 * mapperId !== 0 はビルド未対応としてエラー。
 */
export function projectV3ToV2(v3: ProjectV3): Project {
  const cap = MAPPER_CAPABILITIES[v3.mapperId];
  if (!cap?.buildSupported) {
    throw new ProjectV3BuildError(
      `マッパー ${v3.mapperId}（${cap?.name ?? "?"}）はまだ Create ビルド未対応です。NROM(0) を選んでください。`,
    );
  }

  const parts: ProjectPart[] = v3.characterOrder.map((id, i) => {
    const ch = v3.characters[id]!;
    const bmp = v3.bitmaps[ch.bitmapId];
    const name = dslIdent(ch.name, `Part${i}`);
    const part: ProjectPart = {
      name,
      tiles: bitmapToTiles(bmp),
      code: ch.legacyCode ?? "",
    };
    if (ch.behaviorBlocks !== undefined) part.blocks = ch.behaviorBlocks;
    return part;
  });

  const totalTiles = parts.reduce((n, p) => n + p.tiles.length, 0);
  if (totalTiles > 256) {
    throw new ProjectV3BuildError(
      `CHR タイル数が ${totalTiles} 枚で NROM 上限（256）を超えています。ビットマップを減らすか小さくしてください。`,
    );
  }

  const scenes: ProjectScene[] = v3.sceneOrder.map((id, i) => {
    const sc = v3.scenes[id]!;
    const name = dslIdent(sc.name, `Scene${i}`);
    let code = sc.legacyCode ?? "";
    if (!code.trim()) {
      code = sceneCodeFromPlacements(v3, id);
    }
    const scene: ProjectScene = { name, code };
    if (sc.logicBlocks !== undefined) scene.blocks = sc.logicBlocks;
    return scene;
  });

  const sounds: ProjectSound[] = v3.soundOrder.map((id) => {
    const s = v3.sounds[id]!;
    return {
      name: dslIdent(s.name, "Sound"),
      channel: s.channel,
      note: s.note,
      duration: s.duration,
    };
  });

  return {
    version: 2,
    title: v3.title,
    author: v3.author,
    parts,
    scenes,
    sounds,
  };
}
