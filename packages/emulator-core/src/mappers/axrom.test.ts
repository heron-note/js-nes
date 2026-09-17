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

function buildAxromRom(bankCount: number): Uint8Array {
  const prgRom = new Uint8Array(bankCount * 0x8000); // 32KB/バンク
  for (let b = 0; b < bankCount; b++) {
    prgRom.fill(0x60 + b, b * 0x8000, (b + 1) * 0x8000);
  }
  // バンク0（初期選択）の末尾にリセットベクタを置く
  prgRom[0x7ffc] = 0x00;
  prgRom[0x7ffd] = 0x80;
  prgRom[0x7ffe] = 0x00;
  prgRom[0x7fff] = 0x80;
  return buildTestRom({ mapperId: 7, prgRom });
}

describe("AxromMapper (Mapper 7)", () => {
  it("32KB PRGバンク全体が書き込んだバンク番号に切り替わる", () => {
    const nes = new Nes();
    nes.loadRom(buildAxromRom(3)); // bank0=0x60, bank1=0x61, bank2=0x62

    expect(nes.readCpuMemory(0x8000)).toBe(0x60);
    expect(nes.readCpuMemory(0xf000)).toBe(0x60); // 固定領域を持たないため同じバンク内

    nes.writeCpuMemory(0x8000, 2); // bit4=0 (screen A), バンク2
    expect(nes.readCpuMemory(0x8000)).toBe(0x62);
    expect(nes.readCpuMemory(0xc000)).toBe(0x62); // ウィンドウ全体が切り替わる（固定領域なし）
  });

  it("同じレジスタのbit4でシングルスクリーンA/Bを切り替える", () => {
    const nes = new Nes();
    nes.loadRom(buildAxromRom(1));

    nes.writeCpuMemory(0x8000, 0x00); // bank0, screen A
    writeNametableByte(nes, 0x2000, 0x11);
    expect(readNametableByte(nes, 0x2400)).toBe(0x11); // シングルスクリーンなので$2400も同じ

    nes.writeCpuMemory(0x8000, 0x10); // bank0のまま, screen B
    writeNametableByte(nes, 0x2000, 0x22); // screen B側の別バンクに書く
    expect(readNametableByte(nes, 0x2400)).toBe(0x22);

    nes.writeCpuMemory(0x8000, 0x00); // screen Aへ戻す
    expect(readNametableByte(nes, 0x2000)).toBe(0x11); // Aのバンクは上書きされていない
  });
});
