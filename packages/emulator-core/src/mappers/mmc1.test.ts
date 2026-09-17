import { describe, expect, it } from "vitest";
import { Nes } from "../nes.js";
import { buildTestRom } from "../testing/rom-builder.js";

/** MMC1のシリアル書き込み（1回1bit×5回）を直接シミュレートする。 */
function mmc1Write(nes: Nes, addr: number, value: number): void {
  for (let k = 0; k < 5; k++) {
    nes.writeCpuMemory(addr, (value >> k) & 1);
  }
}

/** $2006/$2007経由でCHRの1バイトを読む（Ppu2C02はCPU側レジスタアクセスしか公開していないため）。 */
function readChrByte(nes: Nes, addr: number): number {
  nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  nes.ppu.cpuWrite(0x2006, addr & 0xff);
  nes.ppu.cpuRead(0x2007); // ダミー読み（1段バッファ）
  return nes.ppu.cpuRead(0x2007);
}

function mmc1Reset(nes: Nes): void {
  nes.writeCpuMemory(0x8000, 0x80); // bit7セット = リセット
}

/** PRGバンクN枚（16KB単位、最終バンクに有効なリセットベクタ）。 */
function buildMmc1PrgRom(bankCount: number): Uint8Array {
  const prgRom = new Uint8Array(bankCount * 0x4000);
  for (let b = 0; b < bankCount; b++) {
    prgRom.fill(0x70 + b, b * 0x4000, (b + 1) * 0x4000);
  }
  const lastBankStart = (bankCount - 1) * 0x4000;
  prgRom[lastBankStart + 0x3ffc] = 0x00;
  prgRom[lastBankStart + 0x3ffd] = 0xc0; // reset vector = $C000（最終バンクは常にここに固定配置される）
  prgRom[lastBankStart + 0x3ffe] = 0x00;
  prgRom[lastBankStart + 0x3fff] = 0xc0;
  return prgRom;
}

describe("Mmc1Mapper (Mapper 1)", () => {
  it("5回書き込んで初めてPRGバンクレジスタに反映される（途中では変わらない）", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(4) })); // bank0=0x70..bank3=0x73

    expect(nes.readCpuMemory(0x8000)).toBe(0x70); // 初期状態(prgMode=3固定)ではbank0

    for (let k = 0; k < 4; k++) {
      nes.writeCpuMemory(0xe000, (1 >> k) & 1); // PRGバンク=1を書き込み中（4回目まで）
      expect(nes.readCpuMemory(0x8000)).toBe(0x70); // まだ反映されない
    }
    nes.writeCpuMemory(0xe000, (1 >> 4) & 1); // 5回目で反映
    expect(nes.readCpuMemory(0x8000)).toBe(0x71);
  });

  it("bit7セットの書き込みはシーケンス途中でも即座にリセットとして扱われる", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(4) }));

    nes.writeCpuMemory(0xe000, 1); // 1回目
    nes.writeCpuMemory(0xe000, 0); // 2回目（ここまでで途中断ち切り）
    mmc1Reset(nes);

    // 新しく5回書き込みを完了させる。中断された最初のシーケンスの影響が残っていないこと。
    mmc1Write(nes, 0xe000, 2);
    expect(nes.readCpuMemory(0x8000)).toBe(0x72); // bank2が反映されている（1ではない）
  });

  it("PRGモード3: $8000側が可変、$C000側は最終バンク固定", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(4) }));
    mmc1Write(nes, 0x8000, 0x0c); // control = prgMode 3, chrMode 0, mirroring=single-screen-a(0)
    mmc1Write(nes, 0xe000, 1); // PRGバンク=1

    expect(nes.readCpuMemory(0x8000)).toBe(0x71);
    expect(nes.readCpuMemory(0xc000)).toBe(0x73); // 最終バンク(3)固定
  });

  it("PRGモード2: $8000側は先頭バンク固定、$C000側が可変", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(4) }));
    mmc1Write(nes, 0x8000, 0x08); // control = prgMode 2 (0b10<<2), chrMode0, mirroring0
    mmc1Write(nes, 0xe000, 2); // PRGバンク=2

    expect(nes.readCpuMemory(0x8000)).toBe(0x70); // 先頭バンク固定
    expect(nes.readCpuMemory(0xc000)).toBe(0x72); // バンク2が$C000側に
  });

  it("PRGモード0/1: 32KB単位で丸ごと切り替わる", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(4) })); // 32KBバンク0={0x70,0x71}, バンク1={0x72,0x73}
    mmc1Write(nes, 0x8000, 0x00); // control = prgMode 0
    mmc1Write(nes, 0xe000, 2); // バンク番号2 → 32KB換算で bank32=2>>1=1

    expect(nes.readCpuMemory(0x8000)).toBe(0x72);
    expect(nes.readCpuMemory(0xc000)).toBe(0x73);
  });

  it("PRG-RAM: PRGバンクレジスタのbit4で有効/無効を切り替えられる", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(2) }));

    mmc1Write(nes, 0xe000, 0x00); // bit4=0 → PRG-RAM有効
    nes.writeCpuMemory(0x6000, 0x99);
    expect(nes.readCpuMemory(0x6000)).toBe(0x99);

    mmc1Write(nes, 0xe000, 0x10); // bit4=1 → PRG-RAM無効
    nes.writeCpuMemory(0x6001, 0x55);
    expect(nes.readCpuMemory(0x6000)).toBe(0); // 無効化中は読めない
  });

  it("CHRモード0: 8KB単位で切り替わる", () => {
    const nes = new Nes();
    const chrRom = new Uint8Array(2 * 0x2000);
    chrRom.fill(0xa0, 0, 0x2000);
    chrRom.fill(0xa1, 0x2000, 0x4000);
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(2), chrRom }));

    mmc1Write(nes, 0x8000, 0x0c); // chrMode=0(8KB)
    mmc1Write(nes, 0xa000, 0); // CHRバンク0選択（8KBモードでは下位bit無視）
    expect(readChrByte(nes, 0x0000)).toBe(0xa0);

    mmc1Write(nes, 0xa000, 2); // 2>>1=1 → 2つ目の8KBバンク
    expect(readChrByte(nes, 0x0000)).toBe(0xa1);
  });

  it("CHRモード1: 4KB単位で独立して切り替わる", () => {
    const nes = new Nes();
    const chrRom = new Uint8Array(4 * 0x1000);
    chrRom.fill(0xb0, 0x0000, 0x1000);
    chrRom.fill(0xb1, 0x1000, 0x2000);
    chrRom.fill(0xb2, 0x2000, 0x3000);
    chrRom.fill(0xb3, 0x3000, 0x4000);
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(2), chrRom }));

    mmc1Write(nes, 0x8000, 0x1c); // chrMode=1(4KB独立), prgMode=3
    mmc1Write(nes, 0xa000, 2); // CHRバンク0 = 領域2(0xb2)
    mmc1Write(nes, 0xc000, 3); // CHRバンク1 = 領域3(0xb3)

    expect(readChrByte(nes, 0x0000)).toBe(0xb2);
    expect(readChrByte(nes, 0x1000)).toBe(0xb3);
  });

  it("controlレジスタ下位2bitでミラーリングを切り替えられる", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 1, prgRom: buildMmc1PrgRom(2) }));

    function writeNametableByte(addr: number, value: number): void {
      nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
      nes.ppu.cpuWrite(0x2006, addr & 0xff);
      nes.ppu.cpuWrite(0x2007, value);
    }
    function readNametableByte(addr: number): number {
      nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
      nes.ppu.cpuWrite(0x2006, addr & 0xff);
      nes.ppu.cpuRead(0x2007);
      return nes.ppu.cpuRead(0x2007);
    }

    mmc1Write(nes, 0x8000, 0x02); // control下位2bit=2 → vertical
    writeNametableByte(0x2000, 0x11);
    expect(readNametableByte(0x2800)).toBe(0x11); // vertical: $2000と$2800が同バンク

    mmc1Write(nes, 0x8000, 0x0f); // control下位2bit=3 → horizontal
    writeNametableByte(0x2000, 0x22);
    expect(readNametableByte(0x2400)).toBe(0x22); // horizontal: $2000と$2400が同バンク
  });
});
