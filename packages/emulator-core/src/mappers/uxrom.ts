import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

/**
 * Mapper 2（UxROM）。
 * PRG: 16KB可変バンクを$8000-$BFFFに、最終16KBバンクを$C000-$FFFFに固定配置。
 * CHRは常にRAM（8KB、UxROMカートリッジはCHR-ROMを持たない）。
 * ミラーリングはiNESヘッダー固定（マッパーは制御しない）。
 */
export class UxromMapper implements Mapper {
  private readonly prgBankCount: number;
  private prgBank = 0;
  private readonly chr: Uint8Array;

  constructor(
    private readonly prgRom: Uint8Array,
    chr: Uint8Array,
    _chrIsRam: boolean,
  ) {
    this.prgBankCount = Math.max(1, Math.floor(prgRom.length / 0x4000));
    this.chr = chr.length > 0 ? chr : new Uint8Array(0x2000);
  }

  cpuRead(addr: number): number {
    if (addr < 0x8000) return 0;
    if (addr < 0xc000) {
      const offset = this.prgBank * 0x4000 + (addr - 0x8000);
      return this.prgRom[offset] ?? 0;
    }
    const lastBankStart = (this.prgBankCount - 1) * 0x4000;
    return this.prgRom[lastBankStart + (addr - 0xc000)] ?? 0;
  }

  cpuWrite(addr: number, value: number): void {
    if (addr < 0x8000) return;
    this.prgBank = value % this.prgBankCount;
  }

  ppuRead(addr: number): number {
    return this.chr[addr & 0x1fff] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    this.chr[addr & 0x1fff] = value & 0xff;
  }

  getMirroringOverride(): Mirroring | null {
    return null;
  }

  irqPending(): boolean {
    return false;
  }

  clearIrq(): void {}
}
