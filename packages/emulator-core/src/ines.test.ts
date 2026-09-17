import { describe, expect, it } from "vitest";
import { parseINes } from "./ines.js";

function makeMinimalRom(prgBanks: number, chrBanks: number, flags6 = 0, flags7 = 0): Uint8Array {
  const prgSize = prgBanks * 16384;
  const chrSize = chrBanks * 8192;
  const rom = new Uint8Array(16 + prgSize + chrSize);
  rom.set([0x4e, 0x45, 0x53, 0x1a, prgBanks, chrBanks, flags6, flags7], 0);
  return rom;
}

describe("parseINes", () => {
  it("parses a minimal NROM (Mapper 0) header", () => {
    const rom = makeMinimalRom(1, 1);
    const parsed = parseINes(rom);
    expect(parsed.mapperId).toBe(0);
    expect(parsed.prgRom.length).toBe(16384);
    expect(parsed.chrRom.length).toBe(8192);
    expect(parsed.chrIsRam).toBe(false);
    expect(parsed.mirroring).toBe("horizontal");
    expect(parsed.hasBattery).toBe(false);
  });

  it("treats chrBanks=0 as CHR-RAM (8KB, zero-filled)", () => {
    const rom = makeMinimalRom(1, 0);
    const parsed = parseINes(rom);
    expect(parsed.chrIsRam).toBe(true);
    expect(parsed.chrRom.length).toBe(8192);
    expect(parsed.chrRom.every((b) => b === 0)).toBe(true);
  });

  it("reads vertical mirroring from flags6 bit0", () => {
    const rom = makeMinimalRom(1, 1, 0x01, 0x00);
    const parsed = parseINes(rom);
    expect(parsed.mirroring).toBe("vertical");
  });

  it("rejects a bad magic number", () => {
    const rom = new Uint8Array(16 + 16384 + 8192);
    expect(() => parseINes(rom)).toThrow(/マジックナンバー/);
  });

  it("parses mapperId from flags6/flags7 regardless of whether it's supported (支援可否はcreateMapper側の責務)", () => {
    const rom = makeMinimalRom(1, 1, 0x10, 0x00); // mapper 1 (MMC1)
    const parsed = parseINes(rom);
    expect(parsed.mapperId).toBe(1);
  });
});
