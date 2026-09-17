/**
 * 任意のマッパーID・複数バンク構成のiNES(.nes)テストROMを組み立てる汎用ヘルパー。
 * 既存の smoke-rom.ts / sprite-rom.ts はMapper0・単一バンク決め打ちだったため、
 * マッパー拡張（UxROM/CNROM/AxROM/MMC1/MMC3）のテストにはこちらを使う。
 */

export interface BuildTestRomOptions {
  mapperId: number;
  /** 16KB単位のPRG-ROM本体（複数バンクの場合は連結したものを渡す）。 */
  prgRom: Uint8Array;
  /** 8KB単位のCHR-ROM本体。省略/空ならCHR-RAM（chrBanks=0）として扱う。 */
  chrRom?: Uint8Array;
  mirroring?: "horizontal" | "vertical";
  hasBattery?: boolean;
}

export function buildTestRom(opts: BuildTestRomOptions): Uint8Array {
  const prgRom = opts.prgRom;
  if (prgRom.length % 0x4000 !== 0) {
    throw new Error(`prgRomは16KBの倍数である必要があります（実際: ${prgRom.length}バイト）`);
  }
  const chrRom = opts.chrRom ?? new Uint8Array(0);
  if (chrRom.length % 0x2000 !== 0) {
    throw new Error(`chrRomは8KBの倍数である必要があります（実際: ${chrRom.length}バイト）`);
  }

  const prgBanks = prgRom.length / 0x4000;
  const chrBanks = chrRom.length / 0x2000; // 0ならCHR-RAM

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0);
  header[4] = prgBanks;
  header[5] = chrBanks;
  const mirroringBit = opts.mirroring === "vertical" ? 0x01 : 0x00;
  const batteryBit = opts.hasBattery ? 0x02 : 0x00;
  header[6] = mirroringBit | batteryBit | ((opts.mapperId & 0x0f) << 4);
  header[7] = opts.mapperId & 0xf0;

  const rom = new Uint8Array(16 + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, 16);
  rom.set(chrRom, 16 + prgRom.length);
  return rom;
}
