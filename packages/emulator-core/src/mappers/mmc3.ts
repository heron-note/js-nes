import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

const PRG_RAM_SIZE = 0x2000;

/**
 * Mapper 4（MMC3 / TxROM系）。
 * $8000-$9FFF(偶数)のbank-select ＋ 同範囲(奇数)のbank-dataでR0-R7の8つの内部バンク
 * レジスタを更新する。PRG/CHRとも「どちらの向きに固定/可変を割り当てるか」を
 * bank-selectのモードビットで入れ替えられる。スキャンラインIRQカウンタも持つ
 * （実機はPPU A12エッジで駆動するが、本PPUはスキャンライン単位のバッチレンダラーの
 * ため、Phase 0で追加したnotifyScanline()フック＝可視スキャンライン1本ごとの通知で
 * 近似する）。
 */
export class Mmc3Mapper implements Mapper {
  private bankSelectReg = 0;
  private readonly bankRegisters = new Array<number>(8).fill(0);
  private mirroringBit = 0; // 0=vertical, 1=horizontal（iNESヘッダーのbit意味とは逆）
  private prgRamEnabled = true;
  private prgRamWriteProtect = false;

  private irqLatch = 0;
  private irqCounter = 0;
  private reloadPending = false;
  private irqEnabled = false;
  private irqAsserted = false;

  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly prg8kBankCount: number;
  private readonly chr: Uint8Array;
  private readonly chrIsRam: boolean;
  private readonly chr1kBankCount: number;

  constructor(
    private readonly prgRom: Uint8Array,
    chr: Uint8Array,
    chrIsRam: boolean,
  ) {
    this.prg8kBankCount = Math.max(2, Math.floor(prgRom.length / 0x2000));
    this.chrIsRam = chrIsRam;
    this.chr = chr.length > 0 ? chr : new Uint8Array(0x2000);
    this.chr1kBankCount = Math.max(1, Math.floor(this.chr.length / 0x400));
  }

  cpuRead(addr: number): number {
    if (addr < 0x6000) return 0;
    if (addr < 0x8000) {
      return this.prgRamEnabled ? (this.prgRam[addr - 0x6000] ?? 0) : 0;
    }

    const prgModeBit = (this.bankSelectReg >> 6) & 1;
    const windowIndex = Math.floor((addr - 0x8000) / 0x2000); // 0-3
    const secondToLast = this.prg8kBankCount - 2;
    const last = this.prg8kBankCount - 1;

    let bank: number;
    if (windowIndex === 3) {
      bank = last; // $E000-$FFFFは常に最終バンク固定
    } else if (windowIndex === 1) {
      bank = (this.bankRegisters[7] ?? 0) % this.prg8kBankCount; // $A000-$BFFFは常にR7
    } else if (windowIndex === 0) {
      bank = prgModeBit === 0 ? (this.bankRegisters[6] ?? 0) % this.prg8kBankCount : secondToLast;
    } else {
      bank = prgModeBit === 0 ? secondToLast : (this.bankRegisters[6] ?? 0) % this.prg8kBankCount;
    }
    const within = (addr - 0x8000) % 0x2000;
    return this.prgRom[bank * 0x2000 + within] ?? 0;
  }

  cpuWrite(addr: number, value: number): void {
    if (addr < 0x6000) return;
    const v = value & 0xff;
    if (addr < 0x8000) {
      if (this.prgRamEnabled && !this.prgRamWriteProtect) {
        this.prgRam[addr - 0x6000] = v;
      }
      return;
    }

    switch (addr & 0xe001) {
      case 0x8000:
        this.bankSelectReg = v;
        return;
      case 0x8001: {
        const target = this.bankSelectReg & 0x07;
        this.bankRegisters[target] = v;
        return;
      }
      case 0xa000:
        this.mirroringBit = v & 0x01;
        return;
      case 0xa001:
        this.prgRamEnabled = (v & 0x80) !== 0;
        this.prgRamWriteProtect = (v & 0x40) !== 0;
        return;
      case 0xc000:
        this.irqLatch = v;
        return;
      case 0xc001:
        this.reloadPending = true;
        return;
      case 0xe000:
        this.irqEnabled = false;
        this.irqAsserted = false; // IRQ無効化書き込みは確認(acknowledge)も兼ねる
        return;
      case 0xe001:
        this.irqEnabled = true;
        return;
      default:
        return;
    }
  }

  ppuRead(addr: number): number {
    return this.chr[this.chrOffset(addr)] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    if (this.chrIsRam) {
      this.chr[this.chrOffset(addr)] = value & 0xff;
    }
  }

  /**
   * CHRモードビット(bank-selectのbit7)で$0000-$0FFF/$1000-$1FFFのどちらに
   * 2KB×2(R0,R1)を、どちらに1KB×4(R2-R5)を割り当てるかが入れ替わる。
   * XORでアドレスの上位ビットを反転させることで、両モードを同じ計算式で扱う。
   */
  private chrOffset(addr: number): number {
    const a = addr & 0x1fff;
    const chrModeBit = (this.bankSelectReg >> 7) & 1;
    const region = chrModeBit === 0 ? a : a ^ 0x1000;

    if (region < 0x1000) {
      const which = region < 0x0800 ? 0 : 1;
      const reg = this.bankRegisters[which] ?? 0;
      const base = (reg & 0xfe) % this.chr1kBankCount;
      const within2k = region & 0x7ff;
      return ((base + Math.floor(within2k / 0x400)) % this.chr1kBankCount) * 0x400 + (within2k & 0x3ff);
    }
    const idx = Math.floor((region - 0x1000) / 0x400); // 0-3 → R2-R5
    const reg = this.bankRegisters[2 + idx] ?? 0;
    const base = reg % this.chr1kBankCount;
    return base * 0x400 + (region & 0x3ff);
  }

  getMirroringOverride(): Mirroring | null {
    return this.mirroringBit === 0 ? "vertical" : "horizontal";
  }

  /**
   * 可視スキャンライン1本ごとにカウンタをデクリメント（0またはreload予約中なら
   * ラッチ値から再ロード）し、0に達した時点でIRQを要求する簡略モデル。
   */
  notifyScanline(renderingEnabled: boolean): void {
    if (!renderingEnabled) return;
    if (this.irqCounter === 0 || this.reloadPending) {
      this.irqCounter = this.irqLatch;
      this.reloadPending = false;
    } else {
      this.irqCounter--;
    }
    if (this.irqCounter === 0 && this.irqEnabled) {
      this.irqAsserted = true;
    }
  }

  irqPending(): boolean {
    return this.irqAsserted;
  }

  clearIrq(): void {
    this.irqAsserted = false;
  }
}
