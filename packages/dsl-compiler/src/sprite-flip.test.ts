import { describe, expect, it } from "vitest";
import { BUTTON, Nes } from "@js-nes/emulator-core";
import { compile } from "./compile.js";

describe("drawSpriteFlip", () => {
  it("左右反転フラグが OAM 属性に載る", () => {
    const source = `
      part Player {
        field x = 80;
        behavior move(self) {
          drawSpriteFlip(0, self.x, 100, 0, 4);
        }
      }
      scene Main {
        instance p: Player;
        function init() {
          setSpritePalette(0, 1, 34, 0, 0);
        }
        function update() {
          Player.move(p);
        }
      }
    `;
    const tile = new Array(64).fill(2);
    const { rom } = compile(source, { partTiles: { Player: [tile] } });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 3; i++) nes.runFrame();
    // OAM attr at $0202: palette 0 | H-flip (bit6)
    expect(nes.ppu.oam[2] & 0x40).toBe(0x40);
    expect(nes.ppu.oam[2] & 0x03).toBe(0);
  });
});

describe("gotoScene clears OAM and stops sequence", () => {
  it("切替後もクラッシュしない", () => {
    const source = `
      part M {
        field x = 10;
        behavior move(self) { drawSprite(0, self.x, 50, 0, 0); }
      }
      scene A {
        instance a: M;
        function init() { playSequence(0); }
        function update() {
          M.move(a);
          if (btn.start_just_pressed) { gotoScene(1); }
        }
      }
      scene B {
        instance b: M;
        function init() { b.x = 200; }
        function update() { M.move(b); }
      }
    `;
    const { rom } = compile(source, {
      partTiles: { M: [new Array(64).fill(1)] },
      sequences: [{ loop: true, events: [{ t: 0, channel: 2, note: 24, duration: 4 }] }],
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 3; i++) nes.runFrame();
    nes.controller1.setButton(BUTTON.START, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.START, false);
    for (let i = 0; i < 3; i++) nes.runFrame();
    expect(nes.readCpuMemory(0x07e5)).toBe(1);
    expect(nes.readCpuMemory(0x07e0)).toBe(0); // SEQ_ACTIVE cleared on goto
  });
});
