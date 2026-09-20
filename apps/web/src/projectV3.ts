/**
 * Create プロジェクトモデル v3（正本）。
 * 仕様: docs/09_CREATE_PROJECT_MODEL.md
 *
 * v2（parts/scenes 並列）からの移行は migrateProjectV2toV3。
 * ビルド接続・資産エディタ本体は後続。本モジュールは型と JSON 往復を固定する。
 */

import {
  parseProject,
  type Project as ProjectV2,
} from "./project.js";
import { validateToneEvent, type ToneEvent } from "./soundSequence.js";

export const PROJECT_V3_VERSION = 3 as const;

/** エミュ対応済みマッパー（Create で選択可）。 */
export const CREATE_MAPPER_IDS = [0, 1, 2, 3, 4, 7] as const;
export type CreateMapperId = (typeof CREATE_MAPPER_IDS)[number];

export const CREATE_MAPPER_LABELS: Record<CreateMapperId, string> = {
  0: "0 — NROM（小規模）",
  1: "1 — MMC1",
  2: "2 — UxROM",
  3: "3 — CNROM",
  4: "4 — MMC3",
  7: "7 — AxROM",
};

export type NesColorIndex = number; // 0–63

export interface PaletteAsset {
  id: string;
  name: string;
  /** 透明扱い + 3色。各要素は NES マスターパレット index。 */
  colors: [NesColorIndex, NesColorIndex, NesColorIndex, NesColorIndex];
}

export interface BitmapAsset {
  id: string;
  name: string;
  /** タイル単位の幅・高さ（各タイルは 8×8 = 64 pixels）。 */
  tileWidth: number;
  tileHeight: number;
  /** 長さ = tileWidth * tileHeight * 64。値は 0–3（パレット内インデックス）。 */
  pixels: number[];
  paletteId: string;
  /**
   * 提供アセット由来のとき、カタログ上の安定キー（例: builtin:font-jp-basic:U+3042）。
   * ビルド時の使用判定・再取り込みスキップに使う。
   */
  providedSource?: string;
}

export interface CharacterAsset {
  id: string;
  name: string;
  bitmapId: string;
  /**
   * プレビュー／実行時のデフォルトパレット。
   * ビットマップの画素は 0–3 のスロット参照だけなので、パレット差し替えで色違い（1P/2P 等）にできる。
   */
  paletteId: string;
  behaviorBlocks?: unknown;
  /** v2 移行用。ビルド接続までは参照のみ。 */
  legacyCode?: string;
}

export interface SoundAsset {
  id: string;
  name: string;
  channel: 0 | 1 | 2 | 3;
  note: number;
  duration: number;
  /** シーケンス全長（フレーム）。省略時は単発 or events から推定。 */
  lengthFrames?: number;
  /** ピアノロール／メロディ。あれば playSound 時にシーケンス再生。 */
  events?: ToneEvent[];
}

export interface ScenePlacement {
  id: string;
  characterId: string;
  x: number;
  y: number;
}

export interface SceneAsset {
  id: string;
  name: string;
  placements: ScenePlacement[];
  backgroundBitmapId?: string;
  soundIds: string[];
  logicBlocks?: unknown;
  legacyCode?: string;
}

export interface ProjectV3 {
  version: typeof PROJECT_V3_VERSION;
  title: string;
  author: string;
  mapperId: CreateMapperId;
  palettes: Record<string, PaletteAsset>;
  bitmaps: Record<string, BitmapAsset>;
  characters: Record<string, CharacterAsset>;
  sounds: Record<string, SoundAsset>;
  scenes: Record<string, SceneAsset>;
  /** エクスプローラ表示順。 */
  paletteOrder: string[];
  bitmapOrder: string[];
  characterOrder: string[];
  soundOrder: string[];
  sceneOrder: string[];
}

export class ProjectV3FormatError extends Error {}

let idSeq = 0;
export function newAssetId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

export function isCreateMapperId(value: unknown): value is CreateMapperId {
  return typeof value === "number" && (CREATE_MAPPER_IDS as readonly number[]).includes(value);
}

export function createDefaultPalette(id = newAssetId("pal")): PaletteAsset {
  return { id, name: "パレット1", colors: [0x0f, 0x01, 0x21, 0x30] };
}

/** 4色が完全一致する既存パレットを探す（順序込み。スロット意味を保つため）。 */
export function findIdenticalPalette(
  project: ProjectV3,
  colors: [NesColorIndex, NesColorIndex, NesColorIndex, NesColorIndex],
): PaletteAsset | undefined {
  return Object.values(project.palettes).find(
    (p) =>
      p.colors[0] === colors[0] &&
      p.colors[1] === colors[1] &&
      p.colors[2] === colors[2] &&
      p.colors[3] === colors[3],
  );
}

/**
 * 同一色のパレットがあれば再利用、なければ新規作成して project に追加する。
 * 画像取り込みや色違いキャラ作成の共通入口。
 */
export function findOrCreatePalette(
  project: ProjectV3,
  colors: [NesColorIndex, NesColorIndex, NesColorIndex, NesColorIndex],
  nameHint = "取り込みパレット",
): PaletteAsset {
  const existing = findIdenticalPalette(project, colors);
  if (existing) return existing;
  const id = newAssetId("pal");
  const pal: PaletteAsset = { id, name: nameHint, colors: [...colors] as typeof colors };
  project.palettes[id] = pal;
  project.paletteOrder.push(id);
  return pal;
}

export function createEmptyBitmap(
  paletteId: string,
  opts?: { id?: string; name?: string; tileWidth?: number; tileHeight?: number },
): BitmapAsset {
  const tileWidth = opts?.tileWidth ?? 2;
  const tileHeight = opts?.tileHeight ?? 2;
  return {
    id: opts?.id ?? newAssetId("bmp"),
    name: opts?.name ?? "ビットマップ",
    tileWidth,
    tileHeight,
    pixels: new Array(tileWidth * tileHeight * 64).fill(0),
    paletteId,
  };
}

export function createEmptyProjectV3(mapperId: CreateMapperId = 0): ProjectV3 {
  const pal = createDefaultPalette();
  const sceneId = newAssetId("scn");
  const scene: SceneAsset = {
    id: sceneId,
    name: "Main",
    placements: [],
    soundIds: [],
  };
  return {
    version: PROJECT_V3_VERSION,
    title: "",
    author: "",
    mapperId,
    palettes: { [pal.id]: pal },
    bitmaps: {},
    characters: {},
    sounds: {},
    scenes: { [sceneId]: scene },
    paletteOrder: [pal.id],
    bitmapOrder: [],
    characterOrder: [],
    soundOrder: [],
    sceneOrder: [sceneId],
  };
}

function assertIntInRange(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ProjectV3FormatError(`${label} は ${min}〜${max} の整数である必要があります`);
  }
  return value;
}

function validatePalette(value: unknown, id: string): PaletteAsset {
  if (typeof value !== "object" || value === null) {
    throw new ProjectV3FormatError(`palettes.${id} がオブジェクトではありません`);
  }
  const p = value as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.length === 0) {
    throw new ProjectV3FormatError(`palettes.${id}.name が不正です`);
  }
  if (!Array.isArray(p.colors) || p.colors.length !== 4) {
    throw new ProjectV3FormatError(`palettes.${id}.colors は長さ4である必要があります`);
  }
  const colors = p.colors.map((c, i) => assertIntInRange(c, 0, 63, `palettes.${id}.colors[${i}]`)) as [
    number,
    number,
    number,
    number,
  ];
  return { id, name: p.name, colors };
}

function validateBitmap(value: unknown, id: string): BitmapAsset {
  if (typeof value !== "object" || value === null) {
    throw new ProjectV3FormatError(`bitmaps.${id} がオブジェクトではありません`);
  }
  const b = value as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.length === 0) {
    throw new ProjectV3FormatError(`bitmaps.${id}.name が不正です`);
  }
  const tileWidth = assertIntInRange(b.tileWidth, 1, 32, `bitmaps.${id}.tileWidth`);
  const tileHeight = assertIntInRange(b.tileHeight, 1, 32, `bitmaps.${id}.tileHeight`);
  if (typeof b.paletteId !== "string" || b.paletteId.length === 0) {
    throw new ProjectV3FormatError(`bitmaps.${id}.paletteId が不正です`);
  }
  if (!Array.isArray(b.pixels)) {
    throw new ProjectV3FormatError(`bitmaps.${id}.pixels が配列ではありません`);
  }
  const expected = tileWidth * tileHeight * 64;
  if (b.pixels.length !== expected) {
    throw new ProjectV3FormatError(`bitmaps.${id}.pixels の長さは ${expected} である必要があります`);
  }
  const pixels = b.pixels.map((px, i) => assertIntInRange(px, 0, 3, `bitmaps.${id}.pixels[${i}]`));
  const out: BitmapAsset = { id, name: b.name, tileWidth, tileHeight, pixels, paletteId: b.paletteId };
  if (typeof b.providedSource === "string" && b.providedSource.length > 0) {
    out.providedSource = b.providedSource;
  }
  return out;
}

function validateCharacter(value: unknown, id: string): CharacterAsset {
  if (typeof value !== "object" || value === null) {
    throw new ProjectV3FormatError(`characters.${id} がオブジェクトではありません`);
  }
  const c = value as Record<string, unknown>;
  if (typeof c.name !== "string" || c.name.length === 0) {
    throw new ProjectV3FormatError(`characters.${id}.name が不正です`);
  }
  if (typeof c.bitmapId !== "string" || c.bitmapId.length === 0) {
    throw new ProjectV3FormatError(`characters.${id}.bitmapId が不正です`);
  }
  // paletteId 欠落は validateProjectV3 で bitmap から補完する（旧 v3 JSON 互換）
  const paletteId = typeof c.paletteId === "string" ? c.paletteId : "";
  const out: CharacterAsset = { id, name: c.name, bitmapId: c.bitmapId, paletteId };
  if ("behaviorBlocks" in c) out.behaviorBlocks = c.behaviorBlocks;
  if (typeof c.legacyCode === "string") out.legacyCode = c.legacyCode;
  return out;
}

function validateSound(value: unknown, id: string): SoundAsset {
  if (typeof value !== "object" || value === null) {
    throw new ProjectV3FormatError(`sounds.${id} がオブジェクトではありません`);
  }
  const s = value as Record<string, unknown>;
  if (typeof s.name !== "string" || s.name.length === 0) {
    throw new ProjectV3FormatError(`sounds.${id}.name が不正です`);
  }
  if (s.channel !== 0 && s.channel !== 1 && s.channel !== 2 && s.channel !== 3) {
    throw new ProjectV3FormatError(`sounds.${id}.channel は 0–3 である必要があります`);
  }
  const note = assertIntInRange(s.note, 0, 255, `sounds.${id}.note`);
  const duration = assertIntInRange(s.duration, 0, 255, `sounds.${id}.duration`);
  const out: SoundAsset = { id, name: s.name, channel: s.channel, note, duration };
  if (typeof s.lengthFrames === "number") {
    out.lengthFrames = assertIntInRange(s.lengthFrames, 1, 255, `sounds.${id}.lengthFrames`);
  }
  if (Array.isArray(s.events)) {
    if (s.events.length > 64) {
      throw new ProjectV3FormatError(`sounds.${id}.events は最大 64 個です`);
    }
    try {
      out.events = s.events.map((ev, i) => validateToneEvent(ev, `sounds.${id}.events[${i}]`));
    } catch (err: unknown) {
      throw new ProjectV3FormatError(err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}

function validatePlacement(value: unknown, index: number): ScenePlacement {
  if (typeof value !== "object" || value === null) {
    throw new ProjectV3FormatError(`placements[${index}] がオブジェクトではありません`);
  }
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || p.id.length === 0) {
    throw new ProjectV3FormatError(`placements[${index}].id が不正です`);
  }
  if (typeof p.characterId !== "string" || p.characterId.length === 0) {
    throw new ProjectV3FormatError(`placements[${index}].characterId が不正です`);
  }
  return {
    id: p.id,
    characterId: p.characterId,
    x: assertIntInRange(p.x, 0, 255, `placements[${index}].x`),
    y: assertIntInRange(p.y, 0, 255, `placements[${index}].y`),
  };
}

function validateScene(value: unknown, id: string): SceneAsset {
  if (typeof value !== "object" || value === null) {
    throw new ProjectV3FormatError(`scenes.${id} がオブジェクトではありません`);
  }
  const s = value as Record<string, unknown>;
  if (typeof s.name !== "string" || s.name.length === 0) {
    throw new ProjectV3FormatError(`scenes.${id}.name が不正です`);
  }
  if (!Array.isArray(s.placements)) {
    throw new ProjectV3FormatError(`scenes.${id}.placements が配列ではありません`);
  }
  if (!Array.isArray(s.soundIds) || !s.soundIds.every((x) => typeof x === "string")) {
    throw new ProjectV3FormatError(`scenes.${id}.soundIds が不正です`);
  }
  const out: SceneAsset = {
    id,
    name: s.name,
    placements: s.placements.map((p, i) => validatePlacement(p, i)),
    soundIds: s.soundIds as string[],
  };
  if (typeof s.backgroundBitmapId === "string") out.backgroundBitmapId = s.backgroundBitmapId;
  if ("logicBlocks" in s) out.logicBlocks = s.logicBlocks;
  if (typeof s.legacyCode === "string") out.legacyCode = s.legacyCode;
  return out;
}

function validateOrder(order: unknown, keys: Set<string>, label: string): string[] {
  if (!Array.isArray(order) || !order.every((x) => typeof x === "string")) {
    throw new ProjectV3FormatError(`${label} は文字列配列である必要があります`);
  }
  const list = order as string[];
  for (const id of list) {
    if (!keys.has(id)) throw new ProjectV3FormatError(`${label} に未知の id: ${id}`);
  }
  return list;
}

function recordFromUnknown<T>(
  value: unknown,
  label: string,
  validate: (v: unknown, id: string) => T,
): Record<string, T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProjectV3FormatError(`${label} がオブジェクトではありません`);
  }
  const out: Record<string, T> = {};
  for (const [id, item] of Object.entries(value as Record<string, unknown>)) {
    out[id] = validate(item, id);
  }
  return out;
}

export function validateProjectV3(data: unknown): ProjectV3 {
  if (typeof data !== "object" || data === null) {
    throw new ProjectV3FormatError("プロジェクトデータの形式が不正です");
  }
  const d = data as Record<string, unknown>;
  if (d.version !== PROJECT_V3_VERSION) {
    throw new ProjectV3FormatError(`version は ${PROJECT_V3_VERSION} である必要があります（got ${String(d.version)}）`);
  }
  if (!isCreateMapperId(d.mapperId)) {
    throw new ProjectV3FormatError(`mapperId が不正です: ${String(d.mapperId)}`);
  }

  const palettes = recordFromUnknown(d.palettes, "palettes", validatePalette);
  const bitmaps = recordFromUnknown(d.bitmaps, "bitmaps", validateBitmap);
  const characters = recordFromUnknown(d.characters, "characters", validateCharacter);
  const sounds = recordFromUnknown(d.sounds, "sounds", validateSound);
  const scenes = recordFromUnknown(d.scenes, "scenes", validateScene);

  for (const bmp of Object.values(bitmaps)) {
    if (!palettes[bmp.paletteId]) {
      throw new ProjectV3FormatError(`bitmap ${bmp.id} の paletteId ${bmp.paletteId} が存在しません`);
    }
  }
  for (const ch of Object.values(characters)) {
    if (!bitmaps[ch.bitmapId]) {
      throw new ProjectV3FormatError(`character ${ch.id} の bitmapId ${ch.bitmapId} が存在しません`);
    }
    if (!ch.paletteId || !palettes[ch.paletteId]) {
      const fromBmp = bitmaps[ch.bitmapId]?.paletteId;
      if (fromBmp && palettes[fromBmp]) ch.paletteId = fromBmp;
      else if (Object.keys(palettes)[0]) ch.paletteId = Object.keys(palettes)[0]!;
      else throw new ProjectV3FormatError(`character ${ch.id} の paletteId を解決できません`);
    }
    if (!palettes[ch.paletteId]) {
      throw new ProjectV3FormatError(`character ${ch.id} の paletteId ${ch.paletteId} が存在しません`);
    }
  }
  for (const sc of Object.values(scenes)) {
    if (sc.backgroundBitmapId && !bitmaps[sc.backgroundBitmapId]) {
      throw new ProjectV3FormatError(`scene ${sc.id} の backgroundBitmapId が存在しません`);
    }
    for (const pl of sc.placements) {
      if (!characters[pl.characterId]) {
        throw new ProjectV3FormatError(`scene ${sc.id} の placement が未知の characterId を参照しています`);
      }
    }
    for (const sid of sc.soundIds) {
      if (!sounds[sid]) {
        throw new ProjectV3FormatError(`scene ${sc.id} の soundIds に未知の id: ${sid}`);
      }
    }
  }

  return {
    version: PROJECT_V3_VERSION,
    title: typeof d.title === "string" ? d.title : "",
    author: typeof d.author === "string" ? d.author : "",
    mapperId: d.mapperId,
    palettes,
    bitmaps,
    characters,
    sounds,
    scenes,
    paletteOrder: validateOrder(d.paletteOrder, new Set(Object.keys(palettes)), "paletteOrder"),
    bitmapOrder: validateOrder(d.bitmapOrder, new Set(Object.keys(bitmaps)), "bitmapOrder"),
    characterOrder: validateOrder(d.characterOrder, new Set(Object.keys(characters)), "characterOrder"),
    soundOrder: validateOrder(d.soundOrder, new Set(Object.keys(sounds)), "soundOrder"),
    sceneOrder: validateOrder(d.sceneOrder, new Set(Object.keys(scenes)), "sceneOrder"),
  };
}

export function serializeProjectV3(project: ProjectV3): string {
  return JSON.stringify(project);
}

export function parseProjectV3(json: string): ProjectV3 {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectV3FormatError("JSONとして解析できませんでした");
  }
  return validateProjectV3(data);
}

/** v2 パーツのタイル列 → 1×N ビットマップ。 */
function tilesToBitmapPixels(tiles: number[][]): { tileWidth: number; tileHeight: number; pixels: number[] } {
  const tileWidth = Math.max(1, tiles.length);
  const tileHeight = 1;
  const pixels: number[] = [];
  for (const tile of tiles) {
    pixels.push(...(tile.length === 64 ? tile : new Array(64).fill(0)));
  }
  while (pixels.length < tileWidth * 64) pixels.push(0);
  return { tileWidth, tileHeight, pixels };
}

export function migrateProjectV2toV3(v2: ProjectV2, mapperId: CreateMapperId = 0): ProjectV3 {
  const project = createEmptyProjectV3(mapperId);
  project.title = v2.title;
  project.author = v2.author;

  const palId = project.paletteOrder[0]!;
  // 空シードの Main シーンを一旦捨て、v2 から作り直す
  project.scenes = {};
  project.sceneOrder = [];

  for (const part of v2.parts) {
    const bmp = createEmptyBitmap(palId, { name: `${part.name} グラフィック` });
    const packed = tilesToBitmapPixels(part.tiles.length > 0 ? part.tiles : [new Array(64).fill(0)]);
    bmp.tileWidth = packed.tileWidth;
    bmp.tileHeight = packed.tileHeight;
    bmp.pixels = packed.pixels;
    project.bitmaps[bmp.id] = bmp;
    project.bitmapOrder.push(bmp.id);

    const chId = newAssetId("chr");
    const character: CharacterAsset = {
      id: chId,
      name: part.name,
      bitmapId: bmp.id,
      paletteId: palId,
      legacyCode: part.code,
    };
    if (part.blocks !== undefined) character.behaviorBlocks = part.blocks;
    project.characters[chId] = character;
    project.characterOrder.push(chId);
  }

  for (const sound of v2.sounds) {
    const id = newAssetId("snd");
    project.sounds[id] = {
      id,
      name: sound.name,
      channel: sound.channel,
      note: sound.note,
      duration: sound.duration,
    };
    project.soundOrder.push(id);
  }

  for (const scene of v2.scenes) {
    const id = newAssetId("scn");
    const sc: SceneAsset = {
      id,
      name: scene.name,
      placements: [],
      soundIds: [],
      legacyCode: scene.code,
    };
    if (scene.blocks !== undefined) sc.logicBlocks = scene.blocks;
    project.scenes[id] = sc;
    project.sceneOrder.push(id);
  }

  if (project.sceneOrder.length === 0) {
    const id = newAssetId("scn");
    project.scenes[id] = { id, name: "Main", placements: [], soundIds: [] };
    project.sceneOrder.push(id);
  }

  return validateProjectV3(project);
}

/** JSON が v3 ならそのまま、v2 なら移行。どちらでもなければエラー。 */
export function parseProjectAnyToV3(json: string): ProjectV3 {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectV3FormatError("JSONとして解析できませんでした");
  }
  if (typeof data !== "object" || data === null) {
    throw new ProjectV3FormatError("プロジェクトデータの形式が不正です");
  }
  const d = data as Record<string, unknown>;
  if (d.version === PROJECT_V3_VERSION) return validateProjectV3(data);
  try {
    const v2 = parseProject(JSON.stringify(data));
    return migrateProjectV2toV3(v2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProjectV3FormatError(`v2/v3 どちらとしても解釈できません: ${msg}`);
  }
}

const STORAGE_KEY_V3 = "famijs:project:v3";

export function saveProjectV3ToLocalStorage(project: ProjectV3): void {
  localStorage.setItem(STORAGE_KEY_V3, serializeProjectV3(project));
}

export function loadProjectV3FromLocalStorage(): ProjectV3 | null {
  const json = localStorage.getItem(STORAGE_KEY_V3);
  if (!json) return null;
  try {
    return parseProjectV3(json);
  } catch {
    return null;
  }
}
