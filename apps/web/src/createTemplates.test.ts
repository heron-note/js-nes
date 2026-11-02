import { compile } from "@js-nes/dsl-compiler";
import { Nes, parseINes } from "@js-nes/emulator-core";
import { describe, expect, it } from "vitest";
import { CREATE_TEMPLATES, buildTemplateProjectV3 } from "./createTemplates.js";
import { buildProjectAssets, buildProjectSequences, buildProjectSource } from "./projectBuild.js";
import { buildBackgroundTilesFromV3 } from "./projectBackground.js";
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
      const backgroundTiles = buildBackgroundTilesFromV3(v3);
      const { rom } = compile(source, {
        ...assets,
        sequences,
        mapperId: 0,
        backgroundTiles,
      });
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

  it("side_scroll は背景タイルと setScroll を含む", () => {
    const v3 = buildTemplateProjectV3("side_scroll", { mapperId: 0 });
    const bg = buildBackgroundTilesFromV3(v3);
    expect(bg.length).toBeGreaterThan(0);
    const v2 = projectV3ToV2(v3);
    const source = buildProjectSource(v2);
    expect(source).toContain("fillBackground");
    expect(source).toContain("setScroll");
  });
});

describe("テンプレート調整（tuning）", () => {
  const allCode = (v3: ReturnType<typeof buildTemplateProjectV3>): string =>
    [
      ...Object.values(v3.characters).map((c) => c.legacyCode ?? ""),
      ...Object.values(v3.scenes).map((s) => s.legacyCode ?? ""),
    ].join("\n");

  it("platformer の既定値は従来通り（歩行2/ダッシュ3/ジャンプ10/無敵45）", () => {
    const code = allCode(buildTemplateProjectV3("platformer", { mapperId: 0 }));
    expect(code).toContain("self.x += 3; } else { self.x += 2; }");
    expect(code).toContain("self.jumpLeft = 10;");
    expect(code).toContain("hero.hurt = 45;");
  });

  it("platformer の調整が生成コードに焼き込まれる", () => {
    const code = allCode(
      buildTemplateProjectV3("platformer", {
        mapperId: 0,
        tuning: { speed: "fast", jump: "high", hurt: "long" },
      }),
    );
    expect(code).toContain("self.x += 5; } else { self.x += 3; }");
    expect(code).toContain("self.jumpLeft = 14;");
    expect(code).toContain("hero.hurt = 75;");
  });

  it("fighter の HP 調整が両キャラとリセット行に効く", () => {
    const code = allCode(buildTemplateProjectV3("fighter", { mapperId: 0, tuning: { hp: "high" } }));
    expect(code.match(/field hp = 8;/g)).toHaveLength(2);
    expect(code).toContain("p1.hp = 8;");
    expect(code).not.toContain("hp = 5");
  });

  it("shmup / rpg / chase の調整が生成コードに焼き込まれる", () => {
    const shmup = allCode(
      buildTemplateProjectV3("shmup", {
        mapperId: 0,
        tuning: { speed: "fast", bullet: "fast", enemy: "fast" },
      }),
    );
    expect(shmup).toContain("self.x += 3;");
    expect(shmup).toContain("self.y -= 6;");
    expect(shmup).toContain("self.y += 2;");

    const rpg = allCode(buildTemplateProjectV3("rpg", { mapperId: 0, tuning: { pace: "fast" } }));
    expect(rpg).toContain("self.cool = 4;");

    const chase = allCode(
      buildTemplateProjectV3("chase", { mapperId: 0, tuning: { speed: "slow", ghost: "fast" } }),
    );
    expect(chase).toContain("self.x += 1;");
    expect(chase).toContain("ghost.x -= 2;");
  });

  it("未知の tuning 値は無視されて既定値になる", () => {
    const code = allCode(
      buildTemplateProjectV3("platformer", { mapperId: 0, tuning: { speed: "turbo" } }),
    );
    expect(code).toContain("self.x += 3; } else { self.x += 2; }");
  });

  for (const info of CREATE_TEMPLATES) {
    const options = info.options;
    if (!options || options.length === 0) continue;
    it(`${info.id} は非既定の調整でも NROM ビルド＆コンパイルできる`, () => {
      const tuning: Record<string, string> = {};
      for (const o of options) {
        tuning[o.key] = o.choices[o.choices.length - 1]!.value;
      }
      const v3 = buildTemplateProjectV3(info.id, { title: info.title, mapperId: 0, tuning });
      const v2 = projectV3ToV2(v3);
      const source = buildProjectSource(v2);
      const assets = buildProjectAssets(v2);
      const { sequences } = buildProjectSequences(v2);
      const backgroundTiles = buildBackgroundTilesFromV3(v3);
      const { rom } = compile(source, { ...assets, sequences, mapperId: 0, backgroundTiles });
      expect(rom.byteLength).toBeGreaterThan(16);
    });
  }
});
