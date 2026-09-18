import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

const PRG_RAM_SIZE = 0x2000;

/**
 * Mapper 1（MMC1 / SxROM）。
 * $8000-$FFFFへの1ビットずつ5回のシリアル書き込みで、アドレス範囲に応じて
 * Control/CHRバンク0/CHRバンク1/PRGバンクの4つの内部レジスタのいずれかを更新する。
 * bit7が立った書き込みはシーケンス途中でも即座にリセットとして認識され、
 * PRGバンクモードを実機仕様どおり強制的にモード3（$C000固定）にする。
 */
export class Mmc1Mapper implements Mapper {
  private shiftRegister = 0;
  private writeCount = 0;

  /** 電源投入時の実機の一般的な初期値（PRGモード3=$C000固定、CHRモード0=8KB切替）。 */
  private control = 0x0c;
  private chrBank0 = 0;
  private chrBank1 = 0;
  private prgBankReg = 0;

  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly prg16kBankCount: number;
  private readonly chr: Uint8Array;
  private readonly chrIsRam: boolean;

  constructor(
    private readonly prgRom: Uint8Array,
    chr: Uint8Array,
    chrIsRam: boolean,
  ) {
    this.prg16kBankCount = Math.max(1, Math.floor(prgRom.length / 0x4000));
    this.chrIsRam = chrIsRam;
    this.chr = chr.length > 0 ? chr : new Uint8Array(0x2000);
  }

  private get prgRamEnabled(): boolean {
    return (this.prgBankReg & 0x10) === 0; // bit4=1でPRG-RAM無効（実機仕様）
  }

  cpuRead(addr: number): number {
    if (addr < 0x6000) return 0;
    if (addr < 0x8000) {
      return this.prgRamEnabled ? (this.prgRam[addr - 0x6000] ?? 0) : 0;
    }

    const bankSelect = this.prgBankReg & 0x0f;
    const prgMode = (this.control >> 2) & 0x03;

    if (prgMode === 0 || prgMode === 1) {
      // 32KBモード: バンク番号の下位1bitは無視して32KB単位で切り替える
      // PRG が 16KB しかない ROM は同一バンクを $8000-$FFFF にミラーする
      if (this.prg16kBankCount === 1) {
        return this.prgRom[(addr - 0x8000) & 0x3fff] ?? 0;
      }
      const bank32Count = Math.max(1, Math.floor(this.prg16kBankCount / 2));
      const bank32 = (bankSelect >> 1) % bank32Count;
      return this.prgRom[bank32 * 0x8000 + (addr - 0x8000)] ?? 0;
    }
    if (prgMode === 2) {
      // 先頭バンク固定、$C000側を切り替え
      if (addr < 0xc000) return this.prgRom[addr - 0x8000] ?? 0;
      const bank = bankSelect % this.prg16kBankCount;
      return this.prgRom[bank * 0x4000 + (addr - 0xc000)] ?? 0;
    }
    // prgMode === 3: $8000側を切り替え、最終バンクを$C000に固定
    if (addr < 0xc000) {
      const bank = bankSelect % this.prg16kBankCount;
      return this.prgRom[bank * 0x4000 + (addr - 0x8000)] ?? 0;
    }
    const lastBank = this.prg16kBankCount - 1;
    return this.prgRom[lastBank * 0x4000 + (addr - 0xc000)] ?? 0;
  }

  cpuWrite(addr: number, value: number): void {
    if (addr < 0x6000) return;
    if (addr < 0x8000) {
      if (this.prgRamEnabled) this.prgRam[addr - 0x6000] = value & 0xff;
      return;
    }

    if (value & 0x80) {
      // リセット書き込み: シーケンス途中でも認識され、PRGモードを強制的に3にする
      this.shiftRegister = 0;
      this.writeCount = 0;
      this.control |= 0x0c;
      return;
    }

    this.shiftRegister = (this.shiftRegister >> 1) | ((value & 1) << 4);
    this.writeCount++;
    if (this.writeCount < 5) return;

    const result = this.shiftRegister & 0x1f;
    const region = (addr >> 13) & 0x03; // 0=$8000-9FFF,1=$A000-BFFF,2=$C000-DFFF,3=$E000-FFFF
    switch (region) {
      case 0:
        this.control = result;
        break;
      case 1:
        this.chrBank0 = result;
        break;
      case 2:
        this.chrBank1 = result;
        break;
      case 3:
        this.prgBankReg = result;
        break;
    }
    this.shiftRegister = 0;
    this.writeCount = 0;
  }

  ppuRead(addr: number): number {
    return this.chr[this.chrOffset(addr)] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    if (this.chrIsRam) {
      this.chr[this.chrOffset(addr)] = value & 0xff;
    }
  }

  private chrOffset(addr: number): number {
    const a = addr & 0x1fff;
    const chrMode = (this.control >> 4) & 1;
    if (chrMode === 0) {
      const bank8kCount = Math.max(1, Math.floor(this.chr.length / 0x2000));
      const bank = (this.chrBank0 >> 1) % bank8kCount;
      return bank * 0x2000 + a;
    }
    const bank4kCount = Math.max(1, Math.floor(this.chr.length / 0x1000));
    if (a < 0x1000) {
      const bank = this.chrBank0 % bank4kCount;
      return bank * 0x1000 + a;
    }
    const bank = this.chrBank1 % bank4kCount;
    return bank * 0x1000 + (a - 0x1000);
  }

  getMirroringOverride(): Mirroring | null {
    switch (this.control & 0x03) {
      case 0:
        return "single-screen-a";
      case 1:
        return "single-screen-b";
      case 2:
        return "vertical";
      default:
        return "horizontal";
    }
  }

  irqPending(): boolean {
    return false;
  }

  clearIrq(): void {}
}
