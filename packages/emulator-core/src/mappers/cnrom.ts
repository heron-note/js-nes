import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

/**
 * Mapper 3（CNROM）。
 * PRGはNROMと同じ固定配置（16KBは$8000/$C000にミラー、32KBはそのまま）。
 * CHRは8KB単位で可変（$8000-$FFFFへの書き込みでバンク選択）。
 * ミラーリングはiNESヘッダー固定。
 */
export class CnromMapper implements Mapper {
  private readonly chrBankCount: number;
  private chrBank = 0;

  constructor(
    private readonly prgRom: Uint8Array,
    private readonly chr: Uint8Array,
    private readonly chrIsRam: boolean,
  ) {
    this.chrBankCount = Math.max(1, Math.floor(chr.length / 0x2000));
  }

  cpuRead(addr: number): number {
    if (addr < 0x8000) return 0;
    const size = this.prgRom.length;
    if (size === 0) return 0;
    const idx = (addr - 0x8000) % size;
    return this.prgRom[idx] ?? 0;
  }

  cpuWrite(addr: number, value: number): void {
    if (addr < 0x8000) return;
    this.chrBank = value % this.chrBankCount;
  }

  ppuRead(addr: number): number {
    return this.chr[this.chrBank * 0x2000 + (addr & 0x1fff)] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    if (this.chrIsRam) {
      this.chr[this.chrBank * 0x2000 + (addr & 0x1fff)] = value & 0xff;
    }
  }

  getMirroringOverride(): Mirroring | null {
    return null;
  }

  irqPending(): boolean {
    return false;
  }

  clearIrq(): void {}
}
