import { describe, expect, it } from "vitest";
import { Nes } from "../nes.js";
import { buildTestRom } from "../testing/rom-builder.js";

function writeNametableByte(nes: Nes, addr: number, value: number): void {
  nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  nes.ppu.cpuWrite(0x2006, addr & 0xff);
  nes.ppu.cpuWrite(0x2007, value);
}

function readNametableByte(nes: Nes, addr: number): number {
  nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  nes.ppu.cpuWrite(0x2006, addr & 0xff);
  nes.ppu.cpuRead(0x2007);
  return nes.ppu.cpuRead(0x2007);
}

function buildUnrom512Rom(prgBanks: number): Uint8Array {
  const prgRom = new Uint8Array(prgBanks * 0x4000);
  for (let b = 0; b < prgBanks; b++) {
    prgRom.fill(0x30 + b, b * 0x4000, (b + 1) * 0x4000);
  }
  const lastBankStart = (prgBanks - 1) * 0x4000;
  prgRom[lastBankStart + 0x3ffc] = 0x00;
  prgRom[lastBankStart + 0x3ffd] = 0xc0;
  prgRom[lastBankStart + 0x3ffe] = 0x00;
  prgRom[lastBankStart + 0x3fff] = 0xc0;
  return buildTestRom({ mapperId: 30, prgRom, chrRom: new Uint8Array(0) });
}

describe("Unrom512Mapper (Mapper 30)", () => {
  it("PRG は UxROM 同様に $8000 可変・$C000 最終固定", () => {
    const nes = new Nes();
    nes.loadRom(buildUnrom512Rom(4));

    expect(nes.readCpuMemory(0x8000)).toBe(0x30);
    expect(nes.readCpuMemory(0xc000)).toBe(0x33);

    nes.writeCpuMemory(0x8000, 0x02);
    expect(nes.readCpuMemory(0x8000)).toBe(0x32);
    expect(nes.readCpuMemory(0xc000)).toBe(0x33);
  });

  it("CHR RAM バンクを切替できる", () => {
    const nes = new Nes();
    nes.loadRom(buildUnrom512Rom(2));

    nes.writeCpuMemory(0x8000, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2007, 0xaa);

    nes.writeCpuMemory(0x8000, 1 << 5);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2007, 0xbb);

    nes.writeCpuMemory(0x8000, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuRead(0x2007);
    expect(nes.ppu.cpuRead(0x2007)).toBe(0xaa);

    nes.writeCpuMemory(0x8000, 1 << 5);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuRead(0x2007);
    expect(nes.ppu.cpuRead(0x2007)).toBe(0xbb);
  });

  it("bit7 でシングルスクリーン A/B を切替", () => {
    const nes = new Nes();
    nes.loadRom(buildUnrom512Rom(2));

    nes.writeCpuMemory(0x8000, 0x00);
    writeNametableByte(nes, 0x2000, 0x11);
    expect(readNametableByte(nes, 0x2400)).toBe(0x11);

    nes.writeCpuMemory(0x8000, 0x80);
    writeNametableByte(nes, 0x2000, 0x22);
    expect(readNametableByte(nes, 0x2400)).toBe(0x22);

    nes.writeCpuMemory(0x8000, 0x00);
    expect(readNametableByte(nes, 0x2000)).toBe(0x11);
  });
});
