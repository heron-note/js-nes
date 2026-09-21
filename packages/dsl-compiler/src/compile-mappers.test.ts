import { BUTTON, Nes, parseINes } from "@js-nes/emulator-core";
import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";

const SAMPLE = `
let x = 120;
let y = 100;

function init() {
  setPalette(0, 1, 33, 0, 0);
  setSpritePalette(0, 1, 34, 0, 0);
}

function update() {
  if (btn.right) { x += 1; }
  drawSprite(0, x, y, 1, 2);
}
`;

const MAPPERS = [0, 1, 2, 3, 4, 7, 30] as const;
const X_ADDR = 0x0b;

function boot(nes: Nes, frames = 5): void {
  for (let i = 0; i < frames; i++) nes.runFrame();
}

describe("compile mappers", () => {
  for (const mapperId of MAPPERS) {
    it(`mapper ${mapperId}: ヘッダ・ロード・スプライト描画`, () => {
      const { rom, prgRom } = compile(SAMPLE, { mapperId });
      const parsed = parseINes(rom);
      expect(parsed.mapperId).toBe(mapperId);
      expect(prgRom.length % 0x4000).toBe(0);
      if (mapperId === 0 || mapperId === 1 || mapperId === 3) {
        expect(prgRom.length).toBe(0x4000);
      } else {
        expect(prgRom.length).toBe(0x8000);
      }

      const nes = new Nes();
      nes.loadRom(rom);
      boot(nes);

      expect(nes.ppu.getPaletteEntry(0)).toBe(1);
      expect(nes.ppu.getPaletteEntry(1)).toBe(33);
      expect(nes.ppu.oam[0]).toBe(100);
      expect(nes.ppu.oam[1]).toBe(1);
      expect(nes.ppu.oam[2]).toBe(2);
      expect(nes.ppu.oam[3]).toBe(120);
      expect(nes.readCpuMemory(X_ADDR)).toBe(120);
    });
  }

  it("全マッパーで btn.right 後の x が一致する", () => {
    const xs: number[] = [];
    for (const mapperId of MAPPERS) {
      const { rom } = compile(SAMPLE, { mapperId });
      const nes = new Nes();
      nes.loadRom(rom);
      boot(nes);
      nes.controller1.setButton(BUTTON.RIGHT, true);
      nes.runFrame();
      xs.push(nes.readCpuMemory(X_ADDR));
    }
    expect(xs.every((v) => v === 121)).toBe(true);
  });
});
