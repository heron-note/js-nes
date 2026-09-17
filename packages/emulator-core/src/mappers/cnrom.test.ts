import { describe, expect, it } from "vitest";
import { Nes } from "../nes.js";
import { buildTestRom } from "../testing/rom-builder.js";

function readChrByte(nes: Nes, addr: number): number {
  nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  nes.ppu.cpuWrite(0x2006, addr & 0xff);
  nes.ppu.cpuRead(0x2007); // ダミー読み（1段バッファ）
  return nes.ppu.cpuRead(0x2007);
}

function buildCnromRom(chrBankCount: number): Uint8Array {
  const prgRom = new Uint8Array(0x4000); // NROMと同じ固定PRG、16KBミラー
  prgRom[0x3ffc] = 0x00;
  prgRom[0x3ffd] = 0x80;
  prgRom[0x3ffe] = 0x00;
  prgRom[0x3fff] = 0x80;

  const chrRom = new Uint8Array(chrBankCount * 0x2000);
  for (let b = 0; b < chrBankCount; b++) {
    chrRom.fill(0x50 + b, b * 0x2000, (b + 1) * 0x2000);
  }
  return buildTestRom({ mapperId: 3, prgRom, chrRom });
}

describe("CnromMapper (Mapper 3)", () => {
  it("PRGは固定のまま、CHRだけ書き込んだバンク番号に切り替わる", () => {
    const nes = new Nes();
    nes.loadRom(buildCnromRom(3)); // bank0=0x50, bank1=0x51, bank2=0x52

    expect(readChrByte(nes, 0x0000)).toBe(0x50);
    expect(nes.readCpuMemory(0x8000)).toBe(nes.readCpuMemory(0xc000)); // NROM同様のミラー

    nes.writeCpuMemory(0x8000, 2); // CHRバンク2へ
    expect(readChrByte(nes, 0x0000)).toBe(0x52);
    expect(readChrByte(nes, 0x1fff)).toBe(0x52);

    nes.writeCpuMemory(0x8000, 1);
    expect(readChrByte(nes, 0x0000)).toBe(0x51);
  });

  it("CHR-ROMへの書き込みは無視される（読み取り専用）", () => {
    const nes = new Nes();
    nes.loadRom(buildCnromRom(1));
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2007, 0xff);
    expect(readChrByte(nes, 0x0000)).toBe(0x50); // 書き込む前の値のまま
  });
});
