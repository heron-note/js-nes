import { describe, expect, it } from "vitest";
import { Nes } from "../nes.js";
import { buildTestRom } from "../testing/rom-builder.js";

function buildUxromRom(bankCount: number): Uint8Array {
  const prgRom = new Uint8Array(bankCount * 0x4000);
  for (let b = 0; b < bankCount; b++) {
    prgRom.fill(0x10 + b, b * 0x4000, (b + 1) * 0x4000);
  }
  // 最終バンク（$C000-$FFFFに固定配置される）のベクタだけ有効な値にしておく
  const lastBankStart = (bankCount - 1) * 0x4000;
  prgRom[lastBankStart + 0x3ffc] = 0x00;
  prgRom[lastBankStart + 0x3ffd] = 0xc0; // reset vector = $C000
  prgRom[lastBankStart + 0x3ffe] = 0x00;
  prgRom[lastBankStart + 0x3fff] = 0xc0;
  return buildTestRom({ mapperId: 2, prgRom });
}

describe("UxromMapper (Mapper 2)", () => {
  it("$8000-$BFFFは書き込んだバンク番号に切り替わり、$C000-$FFFFは常に最終バンク固定", () => {
    const nes = new Nes();
    nes.loadRom(buildUxromRom(3)); // bank0=0x10, bank1=0x11, bank2(最終)=0x12

    expect(nes.readCpuMemory(0x8000)).toBe(0x10); // 初期値はバンク0
    expect(nes.readCpuMemory(0xc000)).toBe(0x12); // 最終バンク固定

    nes.writeCpuMemory(0x8000, 1); // バンク1へ切り替え
    expect(nes.readCpuMemory(0x8000)).toBe(0x11);
    expect(nes.readCpuMemory(0xc000)).toBe(0x12); // 固定側は変わらない

    nes.writeCpuMemory(0x9abc, 0); // どのアドレスへの書き込みでもバンク選択レジスタとして働く
    expect(nes.readCpuMemory(0x8000)).toBe(0x10);
  });

  it("CHRは常にRAMとして書き込み可能", () => {
    const nes = new Nes();
    nes.loadRom(buildUxromRom(2));
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2007, 0x42);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuWrite(0x2006, 0x00);
    nes.ppu.cpuRead(0x2007); // ダミー読み（1段バッファ）
    expect(nes.ppu.cpuRead(0x2007)).toBe(0x42);
  });
});
