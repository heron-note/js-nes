import { describe, expect, it } from "vitest";
import { Ppu2C02, type PpuBus } from "./ppu.js";
import type { Mirroring } from "./ines.js";

function makePpu(mirroring: Mirroring): Ppu2C02 {
  const bus: PpuBus = {
    ppuRead: () => 0,
    ppuWrite: () => {},
  };
  return new Ppu2C02(bus, () => mirroring);
}

/** $2006(PPUADDR)を2回書いてvramAddrをセットし、$2007(PPUDATA)へ1バイト書く。 */
function writeNametableByte(ppu: Ppu2C02, addr: number, value: number): void {
  ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  ppu.cpuWrite(0x2006, addr & 0xff);
  ppu.cpuWrite(0x2007, value);
}

/** $2006を2回書いてvramAddrをセットし、$2007を1回ダミー読みしてから本読みする（PPUDATAの1段バッファ）。 */
function readNametableByte(ppu: Ppu2C02, addr: number): number {
  ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  ppu.cpuWrite(0x2006, addr & 0xff);
  ppu.cpuRead(0x2007); // ダミー読み（バッファ埋め）
  return ppu.cpuRead(0x2007);
}

describe("Ppu2C02 nametableMirror", () => {
  it("horizontal: $2000と$2400は同じ物理バンク、$2000と$2800は別バンク", () => {
    const ppu = makePpu("horizontal");
    writeNametableByte(ppu, 0x2000, 0x11);
    expect(readNametableByte(ppu, 0x2400)).toBe(0x11);
    writeNametableByte(ppu, 0x2800, 0x22);
    expect(readNametableByte(ppu, 0x2000)).toBe(0x11); // 上書きされていない
    expect(readNametableByte(ppu, 0x2c00)).toBe(0x22);
  });

  it("vertical: $2000と$2800は同じ物理バンク、$2000と$2400は別バンク", () => {
    const ppu = makePpu("vertical");
    writeNametableByte(ppu, 0x2000, 0x33);
    expect(readNametableByte(ppu, 0x2800)).toBe(0x33);
    writeNametableByte(ppu, 0x2400, 0x44);
    expect(readNametableByte(ppu, 0x2000)).toBe(0x33);
    expect(readNametableByte(ppu, 0x2c00)).toBe(0x44);
  });

  it("single-screen-a: 4枠すべてが同じ1枚の物理バンクを指す", () => {
    const ppu = makePpu("single-screen-a");
    writeNametableByte(ppu, 0x2000, 0x55);
    expect(readNametableByte(ppu, 0x2400)).toBe(0x55);
    expect(readNametableByte(ppu, 0x2800)).toBe(0x55);
    expect(readNametableByte(ppu, 0x2c00)).toBe(0x55);
  });

  it("single-screen-a/bはマッパーの動的切り替え（AxROM/MMC1想定）で異なる物理バンクを指す", () => {
    let mirroring: Mirroring = "single-screen-a";
    const bus: PpuBus = { ppuRead: () => 0, ppuWrite: () => {} };
    const ppu = new Ppu2C02(bus, () => mirroring);

    writeNametableByte(ppu, 0x2000, 0x66); // single-screen-a側のバンクに書く
    mirroring = "single-screen-b";
    writeNametableByte(ppu, 0x2000, 0x77); // single-screen-b側の別バンクに書く

    mirroring = "single-screen-a";
    expect(readNametableByte(ppu, 0x2000)).toBe(0x66); // aのバンクは上書きされていない
    mirroring = "single-screen-b";
    expect(readNametableByte(ppu, 0x2000)).toBe(0x77);
  });
});
