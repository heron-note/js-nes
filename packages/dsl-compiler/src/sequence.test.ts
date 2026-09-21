import { describe, expect, it } from "vitest";
import { Nes } from "@js-nes/emulator-core";
import { compile } from "./compile.js";

const SEQ_ACTIVE = 0x07e0;

describe("playSequence", () => {
  it("compiles a two-note sequence without crashing", () => {
    const source = `
      part Player {
        field x = 10;
        behavior move(self) {
          if (btn.a_just_pressed) { playSequence(0); }
          drawSprite(0, self.x, 100, 0, 0);
        }
      }
      scene Main {
        instance p: Player;
        function init() {
          setPalette(0, 1, 33, 0, 0);
          setSpritePalette(0, 1, 34, 0, 0);
        }
        function update() {
          Player.move(p);
        }
      }
    `;
    const { rom } = compile(source, {
      sequences: [
        {
          events: [
            { t: 0, channel: 0, note: 24, duration: 10 },
            { t: 12, channel: 0, note: 28, duration: 10 },
          ],
        },
      ],
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 20; i++) nes.runFrame();
    expect(rom.length).toBeGreaterThan(16);
  });

  it("loop:true のシーケンスは終端後も SEQ_ACTIVE が残る", () => {
    const source = `
      part Player {
        field x = 10;
        behavior move(self) {
          drawSprite(0, self.x, 100, 0, 0);
        }
      }
      scene Main {
        instance p: Player;
        function init() {
          playSequence(0);
        }
        function update() {
          Player.move(p);
        }
      }
    `;
    const { rom } = compile(source, {
      sequences: [
        {
          loop: true,
          events: [
            { t: 0, channel: 2, note: 24, duration: 4 },
            { t: 8, channel: 2, note: 28, duration: 4 },
          ],
        },
      ],
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 40; i++) nes.runFrame();
    expect(nes.readCpuMemory(SEQ_ACTIVE)).toBe(1);
  });

  it("loop なしのシーケンスは終端後に SEQ_ACTIVE が 0 になる", () => {
    const source = `
      part Player {
        field x = 10;
        behavior move(self) {
          drawSprite(0, self.x, 100, 0, 0);
        }
      }
      scene Main {
        instance p: Player;
        function init() {
          playSequence(0);
        }
        function update() {
          Player.move(p);
        }
      }
    `;
    const { rom } = compile(source, {
      sequences: [
        {
          events: [{ t: 0, channel: 2, note: 24, duration: 4 }],
        },
      ],
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 20; i++) nes.runFrame();
    expect(nes.readCpuMemory(SEQ_ACTIVE)).toBe(0);
  });
});
