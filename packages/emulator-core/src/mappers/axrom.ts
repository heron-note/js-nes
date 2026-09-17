import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

/**
 * Mapper 7（AxROM）。
 * PRG: 32KB丸ごと可変バンクとして$8000-$FFFF全体に配置。
 * CHRは常にRAM（8KB）。
 * ミラーリングはシングルスクリーン固定で、バンク選択と同じレジスタのbit4で
 * どちらの物理ページを使うか切り替える（実機仕様）。
 */
export class AxromMapper implements Mapper {
  private readonly prgBankCount: number;
  private prgBank = 0;
  private screenB = false;
  private readonly chr: Uint8Array;

  constructor(
    private readonly prgRom: Uint8Array,
    chr: Uint8Array,
    _chrIsRam: boolean,
  ) {
    this.prgBankCount = Math.max(1, Math.floor(prgRom.length / 0x8000));
    this.chr = chr.length > 0 ? chr : new Uint8Array(0x2000);
  }

  cpuRead(addr: number): number {
    if (addr < 0x8000) return 0;
    const offset = this.prgBank * 0x8000 + (addr - 0x8000);
    return this.prgRom[offset] ?? 0;
  }

  cpuWrite(addr: number, value: number): void {
    if (addr < 0x8000) return;
    this.prgBank = (value & 0x07) % this.prgBankCount;
    this.screenB = (value & 0x10) !== 0;
  }

  ppuRead(addr: number): number {
    return this.chr[addr & 0x1fff] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    this.chr[addr & 0x1fff] = value & 0xff;
  }

  getMirroringOverride(): Mirroring | null {
    return this.screenB ? "single-screen-b" : "single-screen-a";
  }

  irqPending(): boolean {
    return false;
  }

  clearIrq(): void {}
}
