/**
 * PRG-ROM + CHR-ROM を iNES形式（Mapper 0 / NROM固定）の .nes バイト列にパッキングする。
 */

export class RomPackError extends Error {}

export interface PackINesOptions {
  mirroring?: "horizontal" | "vertical";
}

const VALID_PRG_SIZES = new Set([0x4000, 0x8000]); // 16KB or 32KB
const CHR_SIZE = 0x2000; // 8KB固定（Mapper 0）

export function packINesRom(prgRom: Uint8Array, chrRom: Uint8Array, options: PackINesOptions = {}): Uint8Array {
  if (!VALID_PRG_SIZES.has(prgRom.length)) {
    throw new RomPackError(`PRG-ROMのサイズは16KBまたは32KBである必要があります（実際: ${prgRom.length}バイト）`);
  }
  if (chrRom.length !== CHR_SIZE) {
    throw new RomPackError(`CHR-ROMのサイズは8KBである必要があります（実際: ${chrRom.length}バイト）`);
  }

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0); // "NES\x1A"
  header[4] = prgRom.length / 0x4000;
  header[5] = chrRom.length / 0x2000;
  header[6] = options.mirroring === "vertical" ? 0x01 : 0x00;
  header[7] = 0x00; // mapper 0

  const rom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, header.length);
  rom.set(chrRom, header.length + prgRom.length);
  return rom;
}
