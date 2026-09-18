import { describe, expect, it } from "vitest";
import { createEmptyProject, serializeProject, type Project } from "./project.js";
import {
  PROJECT_V3_VERSION,
  createEmptyProjectV3,
  migrateProjectV2toV3,
  parseProjectAnyToV3,
  parseProjectV3,
  serializeProjectV3,
  validateProjectV3,
} from "./projectV3.js";

describe("ProjectV3", () => {
  it("空プロジェクトを往復できる", () => {
    const p = createEmptyProjectV3(0);
    p.title = "Test";
    const again = parseProjectV3(serializeProjectV3(p));
    expect(again.version).toBe(PROJECT_V3_VERSION);
    expect(again.title).toBe("Test");
    expect(again.mapperId).toBe(0);
    expect(again.paletteOrder.length).toBe(1);
    expect(again.sceneOrder.length).toBe(1);
  });

  it("bitmap の不正な paletteId を拒否する", () => {
    const p = createEmptyProjectV3(0);
    const palId = p.paletteOrder[0]!;
    p.bitmaps["bmp_x"] = {
      id: "bmp_x",
      name: "x",
      tileWidth: 1,
      tileHeight: 1,
      pixels: new Array(64).fill(0),
      paletteId: palId,
    };
    p.bitmapOrder.push("bmp_x");
    p.bitmaps["bmp_x"]!.paletteId = "missing";
    expect(() => validateProjectV3(p)).toThrow(/paletteId/);
  });

  it("v2 から移行すると part が character+bitmap になる", () => {
    const v2: Project = createEmptyProject();
    v2.title = "サンプル";
    v2.parts.push({
      name: "Player",
      tiles: [new Array(64).fill(1)],
      code: "field x = 1;",
    });
    v2.scenes.push({ name: "Main", code: "function init() {}" });
    v2.sounds.push({ name: "Jump", channel: 0, note: 24, duration: 10 });

    const v3 = migrateProjectV2toV3(v2, 4);
    expect(v3.mapperId).toBe(4);
    expect(v3.characterOrder.length).toBe(1);
    expect(v3.bitmapOrder.length).toBe(1);
    const ch = v3.characters[v3.characterOrder[0]!]!;
    expect(ch.name).toBe("Player");
    expect(ch.legacyCode).toContain("field x");
    expect(v3.bitmaps[ch.bitmapId]?.pixels[0]).toBe(1);
    expect(v3.soundOrder.length).toBe(1);
    expect(v3.scenes[v3.sceneOrder[0]!]!.legacyCode).toContain("init");
  });

  it("parseProjectAnyToV3 が v2 JSON を受け付ける", () => {
    const v2 = createEmptyProject();
    v2.parts.push({ name: "A", tiles: [new Array(64).fill(0)], code: "" });
    v2.scenes.push({ name: "S", code: "" });
    const v3 = parseProjectAnyToV3(serializeProject(v2));
    expect(v3.version).toBe(PROJECT_V3_VERSION);
    expect(v3.characterOrder.length).toBe(1);
  });
});
