/**
 * ProjectV3 → 既存 dsl-compiler 向け v2 Project への変換。
 */
import type { Project, ProjectPart, ProjectScene, ProjectSound } from "./project.js";
import type { BitmapAsset, ProjectV3 } from "./projectV3.js";
import { MAPPER_CAPABILITIES } from "./mapperCapabilities.js";
import { buildBackgroundTilesFromV3 } from "./projectBackground.js";

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

function sceneUsesBackgroundApi(code: string): boolean {
  return /fillBackground\s*\(|setScroll\s*\(|drawBgTile\s*\(/.test(code);
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
  }

  const paletteSlots = new Map<string, number>();
  let nextSlot = 0;

  sc.placements.forEach((pl, i) => {
    const ch = v3.characters[pl.characterId];
    if (!ch) return;
    const partName = dslIdent(ch.name, `Part${i}`);
    const instName = dslIdent(`p${i}_${ch.name}`, `inst${i}`);
    lines.push(`instance ${instName}: ${partName};`);
    calls.push(`  ${partName}.move(${instName});`);

    const palId = ch.paletteId || firstPalId;
    if (palId && v3.palettes[palId]) {
      let slot = paletteSlots.get(palId);
      if (slot === undefined && nextSlot < 4) {
        slot = nextSlot++;
        paletteSlots.set(palId, slot);
        const [c0, c1, c2, c3] = v3.palettes[palId]!.colors;
        initLines.push(`  setSpritePalette(${slot}, ${c0}, ${c1}, ${c2}, ${c3});`);
      }
    }

    // 配置座標をフィールドへ（x/y がある前提）
    initLines.push(`  ${instName}.x = ${pl.x & 0xff};`);
    initLines.push(`  ${instName}.y = ${pl.y & 0xff};`);
  });

  if (sc.backgroundBitmapId) {
    initLines.push("  fillBackground(1);");
    initLines.push("  setScroll(0, 0);");
  }

  if (lines.length === 0) return "";
  const initBlock =
    initLines.length > 0 ? `\nfunction init() {\n${initLines.join("\n")}\n}\n` : "";
  return `${lines.join("\n")}\n${initBlock}\nfunction update() {\n${calls.join("\n")}\n}\n`;
}

/**
 * v3 を v2 に落として既存ビルド経路へ渡す。
 * マッパーは compile() 側へ別途渡す（v2 Project には mapperId を持たない）。
 */
export function projectV3ToV2(v3: ProjectV3): Project {
  const cap = MAPPER_CAPABILITIES[v3.mapperId];
  if (!cap) {
    throw new ProjectV3BuildError(`未知のマッパー ${v3.mapperId} です`);
  }
  if (!cap.buildSupported) {
    throw new ProjectV3BuildError(
      `マッパー ${v3.mapperId}（${cap.name}）はまだ Create ビルド未対応です。`,
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

  const bgTiles = buildBackgroundTilesFromV3(v3);
  const codeMentionsBg = v3.sceneOrder.some((id) =>
    sceneUsesBackgroundApi(v3.scenes[id]?.legacyCode ?? ""),
  );
  const hasBgBitmap = v3.sceneOrder.some((id) => !!v3.scenes[id]?.backgroundBitmapId);
  const bgOverhead = hasBgBitmap || codeMentionsBg || bgTiles.length > 0 ? 1 + bgTiles.length : 0;
  const totalTiles = parts.reduce((n, p) => n + p.tiles.length, 0) + bgOverhead;
  if (totalTiles > 256) {
    throw new ProjectV3BuildError(
      `CHR タイル数が ${totalTiles} 枚で NROM 上限（256）を超えています（背景 ${bgOverhead} + パーツ ${totalTiles - bgOverhead}）。ビットマップを減らすか小さくしてください。`,
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
    const out: ProjectSound & {
      events?: typeof s.events;
      lengthFrames?: number;
      kind?: "bgm" | "se";
    } = {
      name: dslIdent(s.name, "Sound"),
      channel: s.channel,
      note: s.note,
      duration: s.duration,
    };
    if (s.events) out.events = s.events;
    if (s.lengthFrames !== undefined) out.lengthFrames = s.lengthFrames;
    if (s.kind === "bgm" || s.kind === "se") out.kind = s.kind;
    return out;
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
