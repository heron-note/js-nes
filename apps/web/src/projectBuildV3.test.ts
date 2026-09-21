import { describe, expect, it } from "vitest";
import { migrateProjectV2toV3 } from "./projectV3.js";
import { projectV3ToV2, ProjectV3BuildError } from "./projectBuildV3.js";
import type { Project } from "./project.js";

const sampleV2: Project = {
  version: 2,
  title: "サンプル",
  author: "test",
  parts: [
    {
      name: "Player",
      tiles: [new Array(64).fill(1)],
      code: 'field x = 120;\nbehavior move() {\n  drawSprite(0, 0, this.x, this.y, 0);\n}\n',
      blocks: { blocks: [{ type: "fjs_field_decl" }] },
    },
  ],
  scenes: [
    {
      name: "Main",
      code: "instance player: Player;\nupdate() {\n  Player.move(player);\n}\n",
      blocks: { blocks: [{ type: "fjs_instance_decl" }] },
    },
  ],
  sounds: [],
};

describe("projectV3ToV2", () => {
  it("converts migrated sample and keeps blocks", () => {
    const v3 = migrateProjectV2toV3(sampleV2, 0);
    const v2 = projectV3ToV2(v3);
    expect(v2.parts[0]?.name).toBe("Player");
    expect(v2.parts[0]?.blocks).toBeTruthy();
    expect(v2.scenes[0]?.name).toBe("Main");
  });

  it("allows non-NROM build conversion", () => {
    const v3 = migrateProjectV2toV3(sampleV2, 4);
    const v2 = projectV3ToV2(v3);
    expect(v2.parts[0]?.name).toBe("Player");
  });

  it("rejects CHR over 256 tiles", () => {
    const v3 = migrateProjectV2toV3(sampleV2, 0);
    const chId = v3.characterOrder[0]!;
    const ch = v3.characters[chId]!;
    const bmp = v3.bitmaps[ch.bitmapId]!;
    bmp.tileWidth = 20;
    bmp.tileHeight = 14; // 280 tiles
    bmp.pixels = new Array(280 * 64).fill(1);
    expect(() => projectV3ToV2(v3)).toThrow(/CHR/);
  });
});
