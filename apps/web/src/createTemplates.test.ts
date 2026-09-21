import { compile } from "@js-nes/dsl-compiler";
import { Nes, parseINes } from "@js-nes/emulator-core";
import { describe, expect, it } from "vitest";
import { CREATE_TEMPLATES, buildTemplateProjectV3 } from "./createTemplates.js";
import { buildProjectAssets, buildProjectSequences, buildProjectSource } from "./projectBuild.js";
import { projectV3ToV2 } from "./projectBuildV3.js";

describe("createTemplates", () => {
  it("カタログに主要ジャンルが揃っている", () => {
    const ids = CREATE_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual([
      "empty",
      "starter",
      "platformer",
      "side_scroll",
      "shmup",
      "fighter",
      "rpg",
      "chase",
    ]);
  });

  for (const info of CREATE_TEMPLATES) {
    if (info.id === "empty") continue;
    it(`${info.id} は NROM ビルド＆コンパイルできる`, () => {
      const v3 = buildTemplateProjectV3(info.id, { title: info.title, mapperId: 0 });
      const v2 = projectV3ToV2(v3);
      const source = buildProjectSource(v2);
      const assets = buildProjectAssets(v2);
      const { sequences } = buildProjectSequences(v2);
      const { rom } = compile(source, { ...assets, sequences, mapperId: 0 });
      expect(rom.byteLength).toBeGreaterThan(16);
    });
  }

  it("starter テンプレは全エミュマッパーでロード・描画できる", () => {
    for (const mapperId of [0, 1, 2, 3, 4, 7, 30] as const) {
      const v3 = buildTemplateProjectV3("starter", { title: "t", mapperId });
      const v2 = projectV3ToV2(v3);
      const source = buildProjectSource(v2);
      const assets = buildProjectAssets(v2);
      const { sequences } = buildProjectSequences(v2);
      const { rom } = compile(source, { ...assets, sequences, mapperId });
      expect(parseINes(rom).mapperId).toBe(mapperId);
      const nes = new Nes();
      nes.loadRom(rom);
      for (let i = 0; i < 6; i++) nes.runFrame();
      expect(nes.ppu.oam[0]).toBeLessThan(240);
    }
  });
});
