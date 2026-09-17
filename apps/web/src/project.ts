/**
 * プロジェクトの保存/読込（Phase 5: プロジェクトデータモデル・永続化）。
 * これまでWeb IDEには「プロジェクト」という永続化された概念が存在せず、コードは
 * textareaの値、ドット絵は一時的なグローバル配列でしかなかった（ページを再読み込みすると
 * 消える）。ここでその状態に名前と保存/読込の手段を与える。
 *
 * `parts`/`scenes`/`sounds` は、パーツ/シーンをそれぞれ個別に編集できるようにする
 * 今後のUI再編（タブ構成の変更）に備えた予約フィールドで、現時点では空配列のまま
 * 保存される。今のWeb IDEが実際に編集するのは引き続き `code`（DSLソース全文。
 * v0のフラットな記法でもv1のpart/scene構文でもそのまま書ける）と `tiles`
 * （256枚のフラットなタイルシート）の2つ。
 */

export const PROJECT_VERSION = 1;

export interface ProjectPart {
  name: string;
  tiles: number[][];
  code: string;
}

export interface ProjectScene {
  name: string;
  code: string;
}

export interface ProjectSound {
  name: string;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  title: string;
  author: string;
  code: string;
  tiles: number[][];
  parts: ProjectPart[];
  scenes: ProjectScene[];
  sounds: ProjectSound[];
}

export class ProjectFormatError extends Error {}

export function createProject(code: string, tiles: ArrayLike<number>[]): Project {
  return {
    version: PROJECT_VERSION,
    title: "",
    author: "",
    code,
    tiles: Array.from(tiles, (t) => Array.from(t)),
    parts: [],
    scenes: [],
    sounds: [],
  };
}

function isTile(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 64 &&
    value.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3)
  );
}

function validateProject(data: unknown): Project {
  if (typeof data !== "object" || data === null) {
    throw new ProjectFormatError("プロジェクトデータの形式が不正です（オブジェクトではありません）");
  }
  const d = data as Record<string, unknown>;

  if (typeof d.code !== "string") {
    throw new ProjectFormatError("code フィールドが見つからないか、文字列ではありません");
  }
  if (!Array.isArray(d.tiles)) {
    throw new ProjectFormatError("tiles フィールドが見つからないか、配列ではありません");
  }
  const tiles = d.tiles.map((t, i) => {
    if (!isTile(t)) {
      throw new ProjectFormatError(`tiles[${i}] は64要素（値は0-3の整数）の配列である必要があります`);
    }
    return t;
  });

  return {
    version: PROJECT_VERSION,
    title: typeof d.title === "string" ? d.title : "",
    author: typeof d.author === "string" ? d.author : "",
    code: d.code,
    tiles,
    parts: Array.isArray(d.parts) ? (d.parts as ProjectPart[]) : [],
    scenes: Array.isArray(d.scenes) ? (d.scenes as ProjectScene[]) : [],
    sounds: Array.isArray(d.sounds) ? (d.sounds as ProjectSound[]) : [],
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

/** 保存されていない場合、または壊れている場合はnullを返す（呼び出し側でデフォルトにフォールバックする）。 */
export function loadProjectFromLocalStorage(): Project | null {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  try {
    return parseProject(json);
  } catch {
    return null;
  }
}
