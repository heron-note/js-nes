import { beforeEach, describe, expect, it } from "vitest";
import {
  ProjectFormatError,
  createEmptyProject,
  loadProjectFromLocalStorage,
  parseProject,
  saveProjectToLocalStorage,
  serializeProject,
  type Project,
} from "./project.js";

/**
 * DSL v1(シーン/パーツ構成)導入プロジェクトのPhase 5→6ゲート。
 * プロジェクトは「パーツ/シーン/サウンドの集まり」として保存・復元できる。
 * C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md のPhase 5/6参照。
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

function sampleProject(): Project {
  const project = createEmptyProject();
  project.title = "テストゲーム";
  project.author = "heron-note";
  project.parts.push({ name: "Ball", tiles: [SAMPLE_TILE], code: "field x = 128;\nfield y = 120;\n" });
  project.scenes.push({ name: "Main", code: "instance ball: Ball;\nfunction init() {}\nfunction update() {}\n" });
  project.sounds.push({ name: "Jump", channel: 0, note: 28, duration: 5 });
  return project;
}

describe("Project: 作成・シリアライズ・パース", () => {
  it("createEmptyProjectは空のparts/scenes/soundsを持つProjectを作る", () => {
    const project = createEmptyProject();
    expect(project.version).toBe(2);
    expect(project.title).toBe("");
    expect(project.author).toBe("");
    expect(project.parts).toEqual([]);
    expect(project.scenes).toEqual([]);
    expect(project.sounds).toEqual([]);
  });

  it("serializeProject → parseProject のラウンドトリップで内容が保持される", () => {
    const original = sampleProject();
    const restored = parseProject(serializeProject(original));
    expect(restored).toEqual(original);
  });

  it("壊れたJSONはProjectFormatErrorを投げる", () => {
    expect(() => parseProject("{ not valid json")).toThrow(ProjectFormatError);
  });

  it("parts/scenesフィールドが無い/不正な型だとProjectFormatErrorを投げる", () => {
    expect(() => parseProject(JSON.stringify({ scenes: [] }))).toThrow(ProjectFormatError);
    expect(() => parseProject(JSON.stringify({ parts: [], scenes: "x" }))).toThrow(ProjectFormatError);
  });

  it("partのtilesが64要素・0-3の整数でないとProjectFormatErrorを投げる", () => {
    expect(() =>
      parseProject(JSON.stringify({ parts: [{ name: "A", code: "", tiles: [[1, 2, 3]] }], scenes: [] })),
    ).toThrow(ProjectFormatError);
  });

  it("partやsceneにnameが無いとProjectFormatErrorを投げる", () => {
    expect(() => parseProject(JSON.stringify({ parts: [{ code: "", tiles: [] }], scenes: [] }))).toThrow(
      ProjectFormatError,
    );
    expect(() => parseProject(JSON.stringify({ parts: [], scenes: [{ code: "" }] }))).toThrow(ProjectFormatError);
  });

  it("soundsのchannel/note/durationが不正だとProjectFormatErrorを投げる", () => {
    expect(() =>
      parseProject(JSON.stringify({ parts: [], scenes: [], sounds: [{ name: "X", channel: 9, note: 0, duration: 0 }] })),
    ).toThrow(ProjectFormatError);
  });

  it("title/author/soundsが欠けていても妥当なデフォルトで補完される（後方互換）", () => {
    const project = parseProject(JSON.stringify({ parts: [], scenes: [] }));
    expect(project.title).toBe("");
    expect(project.author).toBe("");
    expect(project.sounds).toEqual([]);
  });

  it("part/sceneのblocksフィールド（Blockly保存状態）は不透明なデータとしてそのまま保持される", () => {
    const project = createEmptyProject();
    project.parts.push({ name: "Ball", tiles: [], code: "", blocks: { blocks: { languageVersion: 0 } } });
    const restored = parseProject(serializeProject(project));
    expect(restored.parts[0]!.blocks).toEqual({ blocks: { languageVersion: 0 } });
  });
});

describe("Project: localStorage永続化", () => {
  it("保存前はnullが返る", () => {
    expect(loadProjectFromLocalStorage()).toBeNull();
  });

  it("保存したプロジェクトを読み込める", () => {
    const project = sampleProject();
    saveProjectToLocalStorage(project);
    expect(loadProjectFromLocalStorage()).toEqual(project);
  });

  it("保存データが壊れている場合はnullを返す（デフォルトへのフォールバックを促す）", () => {
    localStorage.setItem("famijs:project", "{ broken");
    expect(loadProjectFromLocalStorage()).toBeNull();
  });
});
