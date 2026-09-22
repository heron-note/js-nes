import { describe, expect, it } from "vitest";
import { BUTTON, Nes } from "@js-nes/emulator-core";
import { compile } from "./compile.js";

const SCROLL_X = 0x07e6;

describe("background + scroll", () => {
  const source = `
    part Player {
      field x = 40;
      behavior move(self) {
        if (btn.right) { self.x += 2; }
        drawSprite(0, self.x, 100, 0, 0);
      }
    }
    scene Main {
      instance p: Player;
      function init() {
        setPalette(0, 1, 33, 0, 0);
        setSpritePalette(0, 1, 34, 0, 0);
        fillBackground(1);
        setScroll(0, 0);
      }
      function update() {
        Player.move(p);
        setScroll(p.x, 0);
      }
    }
  `;

  const checker: number[] = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) checker[i] = (i + (i >> 3)) & 1 ? 2 : 1;

  it("fillBackground / setScroll をコンパイルして動かす", () => {
    const { rom } = compile(source, {
      partTiles: { Player: [new Array(64).fill(2)] },
      backgroundTiles: [checker],
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 4; i++) nes.runFrame();
    expect(nes.readCpuMemory(SCROLL_X)).toBe(40);
    expect(nes.ppu.oam[0]).toBeLessThan(240);
  });

  it("右入力でスクロール値が増える", () => {
    const { rom } = compile(source, {
      partTiles: { Player: [new Array(64).fill(2)] },
      backgroundTiles: [checker],
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 2; i++) nes.runFrame();
    const before = nes.readCpuMemory(SCROLL_X);
    nes.controller1.setButton(BUTTON.RIGHT, true);
    for (let i = 0; i < 5; i++) nes.runFrame();
    expect(nes.readCpuMemory(SCROLL_X)).toBeGreaterThan(before);
  });
});
