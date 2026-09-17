import { beforeEach, describe, expect, it } from "vitest";
import {
  ProjectFormatError,
  createProject,
  loadProjectFromLocalStorage,
  parseProject,
  saveProjectToLocalStorage,
  serializeProject,
} from "./project.js";

/**
 * DSL v1(シーン/パーツ構成)導入プロジェクトのPhase 5ゲート。
 * これまで存在しなかった「プロジェクトの保存/読込」を検証する。
 * C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md のPhase 5参照。
 */

// vitestのデフォルト(node環境)にはlocalStorageが無いため、テスト用の最小実装を用意する。
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();
});

const SAMPLE_TILE = new Array(64).fill(1);

describe("Project: 作成・シリアライズ・パース", () => {
  it("createProjectはcode/tilesからバージョン付きのProjectを作る", () => {
    const project = createProject("let x = 0;\n", [SAMPLE_TILE]);
    expect(project.version).toBe(1);
    expect(project.code).toBe("let x = 0;\n");
    expect(project.tiles).toEqual([SAMPLE_TILE]);
    expect(project.title).toBe("");
    expect(project.author).toBe("");
    expect(project.parts).toEqual([]);
    expect(project.scenes).toEqual([]);
    expect(project.sounds).toEqual([]);
  });

  it("serializeProject → parseProject のラウンドトリップで内容が保持される", () => {
    const original = createProject("function init() {}\nfunction update() {}\n", [SAMPLE_TILE, SAMPLE_TILE]);
    original.title = "テストゲーム";
    original.author = "heron-note";

    const restored = parseProject(serializeProject(original));

    expect(restored).toEqual(original);
  });

  it("壊れたJSONはProjectFormatErrorを投げる", () => {
    expect(() => parseProject("{ not valid json")).toThrow(ProjectFormatError);
  });

  it("codeフィールドが無い/不正な型だとProjectFormatErrorを投げる", () => {
    expect(() => parseProject(JSON.stringify({ tiles: [] }))).toThrow(ProjectFormatError);
    expect(() => parseProject(JSON.stringify({ code: 123, tiles: [] }))).toThrow(ProjectFormatError);
  });

  it("tilesの要素が64要素・0-3の整数でないとProjectFormatErrorを投げる", () => {
    expect(() => parseProject(JSON.stringify({ code: "", tiles: [[1, 2, 3]] }))).toThrow(ProjectFormatError);
    expect(() => parseProject(JSON.stringify({ code: "", tiles: [new Array(64).fill(9)] }))).toThrow(
      ProjectFormatError,
    );
    expect(() => parseProject(JSON.stringify({ code: "", tiles: [new Array(64).fill(1.5)] }))).toThrow(
      ProjectFormatError,
    );
  });

  it("title/author/parts/scenes/soundsが欠けていても妥当なデフォルトで補完される（後方互換）", () => {
    const project = parseProject(JSON.stringify({ code: "let x = 0;", tiles: [] }));
    expect(project.title).toBe("");
    expect(project.author).toBe("");
    expect(project.parts).toEqual([]);
    expect(project.scenes).toEqual([]);
    expect(project.sounds).toEqual([]);
  });
});

describe("Project: localStorage永続化", () => {
  it("保存前はnullが返る", () => {
    expect(loadProjectFromLocalStorage()).toBeNull();
  });

  it("保存したプロジェクトを読み込める", () => {
    const project = createProject("let x = 1;\n", [SAMPLE_TILE]);
    saveProjectToLocalStorage(project);
    expect(loadProjectFromLocalStorage()).toEqual(project);
  });

  it("保存データが壊れている場合はnullを返す（デフォルトへのフォールバックを促す）", () => {
    localStorage.setItem("famijs:project", "{ broken");
    expect(loadProjectFromLocalStorage()).toBeNull();
  });
});
