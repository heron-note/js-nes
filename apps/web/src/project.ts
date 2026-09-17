/**
 * プロジェクトの保存/読込・データモデル（Phase 5→Phase 6で全面改訂）。
 *
 * Phase 6より、プロジェクトは「1個のフラットなコード+1個のフラットなタイルシート」
 * ではなく、**パーツ（ドット絵+振る舞い）とシーン（パーツの配置+進行ロジック）の集まり**
 * として保存される。これが唯一の編集モデルであり、「フラットな旧モード」は残さない
 * （モード分岐は複雑さと不具合の温床になるだけで良いことがない、という判断による）。
 *
 * 各`ProjectPart.code`/`ProjectScene.code`は、`part Name { ... }`/`scene Name { ... }`
 * ラッパーを除いた「中身」だけを保持する（名前は別フィールドで持つため）。
 * 実際にコンパイルするDSLソース・CHR-ROM用タイルの組み立ては`projectBuild.ts`が行う。
 *
 * 音もドット絵と同じく名前付きアセットとして持つ（`sounds`）。DSL自体にはBGM/SE専用の
 * 構文は追加せず、コード中の`playSound(名前)`という呼び出しを、プロジェクトのビルド時に
 * `playTone(channel, note, duration)`へ機械的に置き換える（`projectBuild.ts`参照）。
 */

export const PROJECT_VERSION = 2;

export interface ProjectPart {
  name: string;
  tiles: number[][];
  code: string;
  /** Blockly workspaceの保存状態（Blockly.serialization.workspaces.save()の結果）。未保存ならundefined。 */
  blocks?: unknown;
}

export interface ProjectScene {
  name: string;
  code: string;
  blocks?: unknown;
}

export interface ProjectSound {
  name: string;
  channel: 0 | 1 | 2 | 3;
  note: number;
  duration: number;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  title: string;
  author: string;
  parts: ProjectPart[];
  scenes: ProjectScene[];
  sounds: ProjectSound[];
}

export class ProjectFormatError extends Error {}

export function createEmptyProject(): Project {
  return { version: PROJECT_VERSION, title: "", author: "", parts: [], scenes: [], sounds: [] };
}

function isTile(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 64 &&
    value.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3)
  );
}

function validateTiles(value: unknown, context: string): number[][] {
  if (!Array.isArray(value)) {
    throw new ProjectFormatError(`${context}.tiles が配列ではありません`);
  }
  return value.map((t, i) => {
    if (!isTile(t)) {
      throw new ProjectFormatError(`${context}.tiles[${i}] は64要素（値は0-3の整数）の配列である必要があります`);
    }
    return t;
  });
}

function validatePart(value: unknown, index: number): ProjectPart {
  if (typeof value !== "object" || value === null) {
    throw new ProjectFormatError(`parts[${index}] がオブジェクトではありません`);
  }
  const p = value as Record<string, unknown>;
  if (typeof p.name !== "string" || p.name.length === 0) {
    throw new ProjectFormatError(`parts[${index}].name が見つからないか、空です`);
  }
  if (typeof p.code !== "string") {
    throw new ProjectFormatError(`parts[${index}].code が見つからないか、文字列ではありません`);
  }
  const part: ProjectPart = {
    name: p.name,
    code: p.code,
    tiles: validateTiles(p.tiles, `parts[${index}]`),
  };
  if ("blocks" in p) part.blocks = p.blocks;
  return part;
}

function validateScene(value: unknown, index: number): ProjectScene {
  if (typeof value !== "object" || value === null) {
    throw new ProjectFormatError(`scenes[${index}] がオブジェクトではありません`);
  }
  const s = value as Record<string, unknown>;
  if (typeof s.name !== "string" || s.name.length === 0) {
    throw new ProjectFormatError(`scenes[${index}].name が見つからないか、空です`);
  }
  if (typeof s.code !== "string") {
    throw new ProjectFormatError(`scenes[${index}].code が見つからないか、文字列ではありません`);
  }
  const scene: ProjectScene = { name: s.name, code: s.code };
  if ("blocks" in s) scene.blocks = s.blocks;
  return scene;
}

function validateSound(value: unknown, index: number): ProjectSound {
  if (typeof value !== "object" || value === null) {
    throw new ProjectFormatError(`sounds[${index}] がオブジェクトではありません`);
  }
  const s = value as Record<string, unknown>;
  if (typeof s.name !== "string" || s.name.length === 0) {
    throw new ProjectFormatError(`sounds[${index}].name が見つからないか、空です`);
  }
  if (s.channel !== 0 && s.channel !== 1 && s.channel !== 2 && s.channel !== 3) {
    throw new ProjectFormatError(`sounds[${index}].channel は0-3である必要があります`);
  }
  if (typeof s.note !== "number" || !Number.isInteger(s.note) || s.note < 0) {
    throw new ProjectFormatError(`sounds[${index}].note が不正です`);
  }
  if (typeof s.duration !== "number" || !Number.isInteger(s.duration) || s.duration < 0) {
    throw new ProjectFormatError(`sounds[${index}].duration が不正です`);
  }
  return { name: s.name, channel: s.channel, note: s.note, duration: s.duration };
}

function validateProject(data: unknown): Project {
  if (typeof data !== "object" || data === null) {
    throw new ProjectFormatError("プロジェクトデータの形式が不正です（オブジェクトではありません）");
  }
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.parts)) {
    throw new ProjectFormatError("parts フィールドが見つからないか、配列ではありません");
  }
  if (!Array.isArray(d.scenes)) {
    throw new ProjectFormatError("scenes フィールドが見つからないか、配列ではありません");
  }

  return {
    version: PROJECT_VERSION,
    title: typeof d.title === "string" ? d.title : "",
    author: typeof d.author === "string" ? d.author : "",
    parts: d.parts.map((p, i) => validatePart(p, i)),
    scenes: d.scenes.map((s, i) => validateScene(s, i)),
    sounds: Array.isArray(d.sounds) ? d.sounds.map((s, i) => validateSound(s, i)) : [],
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}

/** JSON文字列からProjectを復元する。壊れている/形式違反の場合はProjectFormatErrorを投げる。 */
export function parseProject(json: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectFormatError("JSONとして解析できませんでした");
  }
  return validateProject(data);
}

const STORAGE_KEY = "famijs:project";

export function saveProjectToLocalStorage(project: Project): void {
  localStorage.setItem(STORAGE_KEY, serializeProject(project));
}

/** 保存されていない場合、または壊れている/旧バージョンの場合はnullを返す（呼び出し側でデフォルトにフォールバックする）。 */
export function loadProjectFromLocalStorage(): Project | null {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  try {
    return parseProject(json);
  } catch {
    return null;
  }
}
