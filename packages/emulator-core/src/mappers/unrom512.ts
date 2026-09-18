import type { Mapper } from "../mapper.js";
import type { Mirroring } from "../ines.js";

/**
 * Mapper 30（UNROM 512）。
 * PRG: 16KB 可変バンクを $8000-$BFFF、最終 16KB を $C000-$FFFF に固定（UxROM 拡張）。
 * CHR: 最大 32KB RAM を 8KB バンクで切替。
 * ミラーリング: 書き込み bit7 で 1画面 A/B を切替（ハード固定 H/V の基板もあるが、
 * ホームブリュー実機向け ROM は 1画面制御が一般的なのでこちらを返す）。
 *
 * レジスタ ($8000-$FFFF 書き込み):
 *   7  bit  0
 *   ---- ----
 *   MCCC PPPP
 *   |||| ||||
 *   |||| ++++- PRG バンク (16KB)
 *   ||++------ CHR RAM バンク (8KB)
 *   |+-------- （未使用扱い）
 *   +--------- 1画面ミラー (0=A / 1=B)
 *
 * バスコンフリクト・自己フラッシュはエミュしない（サブマッパ 1 相当）。
 */
export class Unrom512Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private prgBank = 0;
  private chrBank = 0;
  private screenB = false;
  private readonly chr: Uint8Array;

  constructor(
    private readonly prgRom: Uint8Array,
    chr: Uint8Array,
    _chrIsRam: boolean,
  ) {
    this.prgBankCount = Math.max(1, Math.floor(prgRom.length / 0x4000));
    // iNES 既定は 32KB CHR-RAM。渡されたバッファが小さい場合は拡張する。
    const size = Math.max(chr.length > 0 ? chr.length : 0x8000, 0x2000);
    this.chr = new Uint8Array(size);
    if (chr.length > 0) this.chr.set(chr.subarray(0, Math.min(chr.length, size)));
    this.chrBankCount = Math.max(1, Math.floor(this.chr.length / 0x2000));
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
    const v = value & 0xff;
    this.prgBank = (v & 0x1f) % this.prgBankCount;
    this.chrBank = ((v >> 5) & 0x03) % this.chrBankCount;
    this.screenB = (v & 0x80) !== 0;
  }

  ppuRead(addr: number): number {
    return this.chr[this.chrBank * 0x2000 + (addr & 0x1fff)] ?? 0;
  }

  ppuWrite(addr: number, value: number): void {
    this.chr[this.chrBank * 0x2000 + (addr & 0x1fff)] = value & 0xff;
  }

  getMirroringOverride(): Mirroring | null {
    return this.screenB ? "single-screen-b" : "single-screen-a";
  }

  irqPending(): boolean {
    return false;
  }

  clearIrq(): void {}
}
