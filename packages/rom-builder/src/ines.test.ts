import { describe, expect, it } from "vitest";
import { RomPackError, packINesRom } from "./ines.js";

describe("packINesRom", () => {
  it("builds a valid iNES header for 16KB PRG + 8KB CHR", () => {
    const prg = new Uint8Array(0x4000).fill(0xea);
    const chr = new Uint8Array(0x2000).fill(0x11);
    const rom = packINesRom(prg, chr);

    expect(rom.length).toBe(16 + 0x4000 + 0x2000);
    expect(Array.from(rom.slice(0, 4))).toEqual([0x4e, 0x45, 0x53, 0x1a]);
    expect(rom[4]).toBe(1); // PRG banks
    expect(rom[5]).toBe(1); // CHR banks
    expect(rom[6]).toBe(0); // horizontal mirroring (default)
    expect(rom[7]).toBe(0); // mapper 0
    expect(rom[16]).toBe(0xea);
    expect(rom[16 + 0x4000] ?? -1).toBe(0x11);
  });

  it("sets the mirroring bit when vertical mirroring is requested", () => {
    const rom = packINesRom(new Uint8Array(0x4000), new Uint8Array(0x2000), { mirroring: "vertical" });
    expect((rom[6] ?? 0) & 0x01).toBe(1);
  });

  it("accepts 32KB PRG-ROM", () => {
    const rom = packINesRom(new Uint8Array(0x8000), new Uint8Array(0x2000));
    expect(rom[4]).toBe(2);
  });

  it("throws RomPackError for an invalid PRG-ROM size", () => {
    expect(() => packINesRom(new Uint8Array(100), new Uint8Array(0x2000))).toThrow(RomPackError);
  });

  it("writes mapper id into flags6/7", () => {
    const rom = packINesRom(new Uint8Array(0x8000), new Uint8Array(0x2000), { mapperId: 2 });
    expect(((rom[6] ?? 0) >> 4) | ((rom[7] ?? 0) & 0xf0)).toBe(2);
  });

  it("accepts CHR-ROM size 0 (CHR-RAM)", () => {
    const rom = packINesRom(new Uint8Array(0x4000), new Uint8Array(0), { mapperId: 2 });
    expect(rom[5]).toBe(0);
    expect(rom.length).toBe(16 + 0x4000);
  });

  it("throws RomPackError for an invalid CHR-ROM size", () => {
    expect(() => packINesRom(new Uint8Array(0x4000), new Uint8Array(100))).toThrow(RomPackError);
  });
});
