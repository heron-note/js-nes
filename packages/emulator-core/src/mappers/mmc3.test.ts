import { describe, expect, it } from "vitest";
import { Nes } from "../nes.js";
import { buildTestRom } from "../testing/rom-builder.js";
import { Asm } from "../testing/mini-asm.js";

function bankSelect(nes: Nes, register: number, prgModeBit: 0 | 1, chrModeBit: 0 | 1): void {
  nes.writeCpuMemory(0x8000, register | (prgModeBit << 6) | (chrModeBit << 7));
}
function bankData(nes: Nes, value: number): void {
  nes.writeCpuMemory(0x8001, value);
}
function setMirroring(nes: Nes, bit: 0 | 1): void {
  nes.writeCpuMemory(0xa000, bit);
}
function setPrgRamProtect(nes: Nes, enabled: boolean, writeProtect: boolean): void {
  nes.writeCpuMemory(0xa001, (enabled ? 0x80 : 0) | (writeProtect ? 0x40 : 0));
}
function setIrqLatch(nes: Nes, value: number): void {
  nes.writeCpuMemory(0xc000, value);
}
function forceIrqReload(nes: Nes): void {
  nes.writeCpuMemory(0xc001, 0);
}
function setIrqEnabled(nes: Nes, enabled: boolean): void {
  nes.writeCpuMemory(enabled ? 0xe001 : 0xe000, 0);
}

function readChrByte(nes: Nes, addr: number): number {
  nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
  nes.ppu.cpuWrite(0x2006, addr & 0xff);
  nes.ppu.cpuRead(0x2007);
  return nes.ppu.cpuRead(0x2007);
}

/** 8KB単位のPRGバンクN枚（最終バンクに有効なリセットベクタ）。 */
function buildMmc3PrgRom(bankCount: number): Uint8Array {
  const prgRom = new Uint8Array(bankCount * 0x2000);
  for (let b = 0; b < bankCount; b++) {
    prgRom.fill(0x90 + b, b * 0x2000, (b + 1) * 0x2000);
  }
  const lastBankStart = (bankCount - 1) * 0x2000;
  prgRom[lastBankStart + 0x1ffc] = 0x00;
  prgRom[lastBankStart + 0x1ffd] = 0xe0; // reset vector = $E000（最終バンク固定領域内）
  prgRom[lastBankStart + 0x1ffe] = 0x00;
  prgRom[lastBankStart + 0x1fff] = 0xe0;
  return prgRom;
}

function buildMmc3ChrRom(): Uint8Array {
  const chrRom = new Uint8Array(8 * 0x400); // 1KB x 8 = 8KB
  for (let i = 0; i < 8; i++) chrRom.fill(0xb0 + i, i * 0x400, (i + 1) * 0x400);
  return chrRom;
}

describe("Mmc3Mapper (Mapper 4)", () => {
  it("R6/R7でPRGバンクを切り替え、$E000-$FFFFは常に最終バンク固定", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom: buildMmc3PrgRom(8) })); // bank0=0x90..bank7=0x97

    bankSelect(nes, 6, 0, 0);
    bankData(nes, 2); // R6 = bank2
    bankSelect(nes, 7, 0, 0);
    bankData(nes, 3); // R7 = bank3

    expect(nes.readCpuMemory(0x8000)).toBe(0x92); // prgMode=0: $8000側=R6
    expect(nes.readCpuMemory(0xa000)).toBe(0x93); // $A000側は常にR7
    expect(nes.readCpuMemory(0xc000)).toBe(0x96); // 2番目に最後(secondToLast=8-2=6)固定
    expect(nes.readCpuMemory(0xe000)).toBe(0x97); // 最終バンク(7)固定
  });

  it("PRGモードビットで$8000側/$C000側の固定・可変が入れ替わる", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom: buildMmc3PrgRom(8) }));

    bankSelect(nes, 6, 1, 0); // prgMode=1
    bankData(nes, 4); // R6 = bank4

    expect(nes.readCpuMemory(0x8000)).toBe(0x96); // prgMode=1: $8000側は2番目に最後(固定)
    expect(nes.readCpuMemory(0xc000)).toBe(0x94); // $C000側がR6(可変)
  });

  it("R0-R5でCHRバンクを切り替えられる（chrMode=0: 前半2KB×2、後半1KB×4）", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom: buildMmc3PrgRom(2), chrRom: buildMmc3ChrRom() }));

    bankSelect(nes, 0, 0, 0);
    bankData(nes, 2); // R0 = 2（偶数扱い、2KB分=領域2,3）
    bankSelect(nes, 2, 0, 0);
    bankData(nes, 5); // R2 = 5（1KB、領域5）

    expect(readChrByte(nes, 0x0000)).toBe(0xb2); // R0 & 0xFE = 2
    expect(readChrByte(nes, 0x0400)).toBe(0xb3); // 2KB内の後半
    expect(readChrByte(nes, 0x1000)).toBe(0xb5); // R2
  });

  it("CHRモードビットで前半/後半の役割(2KB×2 と 1KB×4)が入れ替わる", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom: buildMmc3PrgRom(2), chrRom: buildMmc3ChrRom() }));

    bankSelect(nes, 2, 0, 1); // chrMode=1, R2を選択対象に
    bankData(nes, 6); // R2 = 6

    // chrMode=1では$0000側が1KB×4(R2-R5)になる
    expect(readChrByte(nes, 0x0000)).toBe(0xb6);
  });

  it("ミラーリングレジスタ($A000)のbit0: 0=vertical, 1=horizontal", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom: buildMmc3PrgRom(2) }));

    function writeNt(addr: number, value: number): void {
      nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
      nes.ppu.cpuWrite(0x2006, addr & 0xff);
      nes.ppu.cpuWrite(0x2007, value);
    }
    function readNt(addr: number): number {
      nes.ppu.cpuWrite(0x2006, (addr >> 8) & 0x3f);
      nes.ppu.cpuWrite(0x2006, addr & 0xff);
      nes.ppu.cpuRead(0x2007);
      return nes.ppu.cpuRead(0x2007);
    }

    setMirroring(nes, 0); // vertical
    writeNt(0x2000, 0x11);
    expect(readNt(0x2800)).toBe(0x11);

    setMirroring(nes, 1); // horizontal
    writeNt(0x2000, 0x22);
    expect(readNt(0x2400)).toBe(0x22);
  });

  it("PRG-RAM protect: write-protectビットが立っていると書き込みが無視される", () => {
    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom: buildMmc3PrgRom(2) }));

    setPrgRamProtect(nes, true, true); // 有効・書き込み保護
    nes.writeCpuMemory(0x6000, 0x77);
    expect(nes.readCpuMemory(0x6000)).toBe(0); // 保護中は書き込めない

    setPrgRamProtect(nes, true, false); // 保護解除
    nes.writeCpuMemory(0x6000, 0x77);
    expect(nes.readCpuMemory(0x6000)).toBe(0x77);
  });

  it("スキャンラインIRQ: ラッチ値ぶんのスキャンラインが経過すると実際にCPUのIRQハンドラへ飛ぶ", () => {
    // reset/IRQハンドラは実際にCPU $E000-$FFFF（最終バンク固定域）にロードするため、
    // 絶対アドレス計算（JMP/分岐オフセット）が正しくなるようoriginもそこに合わせる。
    // reset: IRQラッチ=5・即reload・IRQ有効化・背景描画有効化してから無限ループ。
    // IRQハンドラ: RAMの$0010に目印(0x42)を書き、$E000への書き込みでIRQを確認(disable)してRTI。
    const asm = new Asm(0xe000);
    asm
      .label("reset")
      .SEI()
      .CLD()
      .LDX_IMM(0xff)
      .TXS()
      .LDA_IMM(0x00)
      .STA_ABS(0x2000)
      .STA_ABS(0x2001)
      .label("vblankwait1")
      .BIT_ABS(0x2002)
      .BPL("vblankwait1")
      .label("vblankwait2")
      .BIT_ABS(0x2002)
      .BPL("vblankwait2")
      .LDA_IMM(5)
      .STA_ABS(0xc000) // IRQラッチ = 5
      .LDA_IMM(0)
      .STA_ABS(0xc001) // 即reload
      .STA_ABS(0xe001) // IRQ有効化（値は無視される）
      .LDA_IMM(0b0000_1000)
      .STA_ABS(0x2001) // 背景描画を有効化（notifyScanlineが呼ばれるようになる）
      .CLI() // IRQマスクを解除（SEIしたままだとcpu.irq()が常にno-opになる）
      .label("forever")
      .JMP("forever");

    const { bytes: resetBytes } = asm.assemble();

    const irqAsm = new Asm(0xe100);
    irqAsm.label("irqhandler").LDA_IMM(0x42).STA_ABS(0x0010).LDA_IMM(0).STA_ABS(0xe000).RTI();
    const { bytes: irqBytes } = irqAsm.assemble();

    const prgRom = buildMmc3PrgRom(2);
    const lastBankStart = 1 * 0x2000; // bank1 = CPU $E000-$FFFFに固定配置される最終バンク
    prgRom.set(resetBytes, lastBankStart); // reset本体（$E000起点）
    prgRom.set(irqBytes, lastBankStart + 0x0100); // irqhandler（$E100起点）
    prgRom[lastBankStart + 0x1ffa] = 0x00;
    prgRom[lastBankStart + 0x1ffb] = 0xe1; // NMIベクタ（未使用だが有効な値にしておく）
    prgRom[lastBankStart + 0x1ffc] = 0x00;
    prgRom[lastBankStart + 0x1ffd] = 0xe0; // resetベクタ = $E000
    prgRom[lastBankStart + 0x1ffe] = 0x00;
    prgRom[lastBankStart + 0x1fff] = 0xe1; // IRQベクタ = $E100

    const nes = new Nes();
    nes.loadRom(buildTestRom({ mapperId: 4, prgRom }));
    // resetルーチンの二重vblank待ちを越えるため複数フレーム進める（他の統合テストと同じ作法）
    for (let i = 0; i < 5; i++) nes.runFrame();

    expect(nes.readCpuMemory(0x0010)).toBe(0x42);
  });
});
