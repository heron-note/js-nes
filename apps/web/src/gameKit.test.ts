import { describe, expect, it } from "vitest";
import { compile } from "@js-nes/dsl-compiler";
import { Nes } from "@js-nes/emulator-core";
import { buildTemplateProjectV3 } from "./createTemplates.js";
import { dslHitBox, paintHeroWalkSheet } from "./gameKit.js";
import { buildProjectAssets, buildProjectSequences, buildProjectSource } from "./projectBuild.js";
import { projectV3ToV2 } from "./projectBuildV3.js";

describe("gameKit", () => {
  it("ヒーロー歩行シートは 4 タイル分ある", () => {
    const pixels = new Array(256).fill(0);
    paintHeroWalkSheet(pixels);
    expect(pixels.some((p, i) => i < 64 && p > 0)).toBe(true);
    expect(pixels.some((p, i) => i >= 192 && p > 0)).toBe(true);
  });

  it("dslHitBox は X と Y の両方を見る", () => {
    const src = dslHitBox("a", "b", 16, ["a.got = 1;"]);
    expect(src).toContain("b.hy = b.y");
    expect(src).toContain("a.y > b.y");
  });

  it("platformer テンプレはビルドして数フレーム動く", () => {
    const v3 = buildTemplateProjectV3("platformer", { mapperId: 0 });
    const hero = Object.values(v3.characters).find((c) => c.name === "Hero")!;
    expect(hero.legacyCode).toContain("btn.b");
    expect(hero.legacyCode).toContain("facing");
    expect(v3.bitmaps[hero.bitmapId]!.tileWidth).toBe(4);
    expect(Object.values(v3.sounds).some((s) => s.kind === "se")).toBe(true);
    expect(v3.sceneOrder.length).toBe(3);
    expect(Object.values(v3.sounds).some((s) => s.kind === "bgm" && s.events && s.events.length > 0)).toBe(
      true,
    );

    const v2 = projectV3ToV2(v3);
    const { sequences } = buildProjectSequences(v2);
    expect(sequences.some((s) => s.loop)).toBe(true);
    const { rom } = compile(buildProjectSource(v2), {
      ...buildProjectAssets(v2),
      sequences,
      mapperId: 0,
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 8; i++) nes.runFrame();
    expect(nes.ppu.oam[0]).toBeLessThan(240);
  });
});
