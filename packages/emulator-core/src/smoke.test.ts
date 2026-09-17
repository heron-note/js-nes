import { describe, expect, it } from "vitest";
import { Nes } from "./nes.js";
import { NES_PALETTE } from "./palette.js";
import { SMOKE_ROM_FILL_PALETTE_INDEX, buildSmokeRom } from "./testing/smoke-rom.js";

describe("Nes integration smoke test", () => {
  it("renders the fill color across the whole screen once the ROM enables background rendering", () => {
    const nes = new Nes();
    nes.loadRom(buildSmokeRom());

    // ROMの初期化ルーチン（2vblank待ち + テーブル書き込み）が完了するまで複数フレーム進める
    for (let i = 0; i < 5; i++) {
      nes.runFrame();
    }

    const fb = nes.ppu.framebuffer;
    const expectedRgb = NES_PALETTE[SMOKE_ROM_FILL_PALETTE_INDEX] ?? 0;
    const expectedR = (expectedRgb >> 16) & 0xff;
    const expectedG = (expectedRgb >> 8) & 0xff;
    const expectedB = expectedRgb & 0xff;

    function pixelAt(x: number, y: number): [number, number, number, number] {
      const idx = (y * 256 + x) * 4;
      return [fb[idx] ?? -1, fb[idx + 1] ?? -1, fb[idx + 2] ?? -1, fb[idx + 3] ?? -1];
    }

    const samplePoints: Array<[number, number]> = [
      [0, 0],
      [10, 10],
      [128, 120],
      [200, 50],
      [255, 239],
    ];

    for (const [x, y] of samplePoints) {
      expect(pixelAt(x, y)).toEqual([expectedR, expectedG, expectedB, 255]);
    }
  });

  it("throws a helpful error when loading a ROM with an unsupported mapper", () => {
    const rom = new Uint8Array(16 + 16384 + 8192);
    rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 0x30, 0x60], 0); // mapper 99（未対応・存在しないID）
    const nes = new Nes();
    expect(() => nes.loadRom(rom)).toThrow(/Mapper/);
  });
});
