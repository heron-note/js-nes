import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

/**
 * Mapper 0（NROM）。バンク切り替えなしの最小構成。
 * PRG-ROMは16KBなら$8000-$BFFF/$C000-$FFFFにミラーされ、32KBならそのまま配置される。
 * CHRはROMまたは（chrBanks=0の場合）RAMとして扱う。PRG-RAMは持たない
 * （$6000-$7FFFは常に0/no-op。バッテリーバックアップ付きNROMは稀なため対象外）。
 */
export class NromMapper implements Mapper {
  constructor(
    private readonly prgRom: Uint8Array,
    private readonly chr: Uint8Array,
    private readonly chrIsRam: boolean,
  ) {}

  cpuRead(addr: number): number {
    if (addr < 0x8000) return 0;
    const size = this.prgRom.length;
    if (size === 0) return 0;
    const idx = (addr - 0x8000) % size;
    return this.prgRom[idx] ?? 0;
  }

  cpuWrite(_addr: number, _value: number): void {
    // NROMのPRG-ROMは書き込み不可（無視する）。PRG-RAMも持たない。
  }

  ppuRead(addr: number): number {
    return this.chr[addr & 0x1fff] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    if (this.chrIsRam) {
      this.chr[addr & 0x1fff] = value & 0xff;
    }
    // CHR-ROMへの書き込みは無視する
  }

  getMirroringOverride(): Mirroring | null {
    return null; // ミラーリングは常にiNESヘッダー任せ
  }

  notifyScanline(_renderingEnabled: boolean): void {
    // NROMにスキャンラインカウンタはない
  }

  irqPending(): boolean {
    return false;
  }

  clearIrq(): void {
    // NROMはIRQを発生させない
  }
}

export { NromMapper as Mapper0 };
