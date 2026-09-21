/**
 * PRG-ROM + CHR-ROM を iNES 形式の .nes バイト列にパッキングする。
 * エミュ対応マッパー（0/1/2/3/4/7/30）を Create ビルドから出力できる。
 */

export class RomPackError extends Error {}

export type SupportedMapperId = 0 | 1 | 2 | 3 | 4 | 7 | 30;

export interface PackINesOptions {
  mirroring?: "horizontal" | "vertical";
  /** 省略時は 0（NROM） */
  mapperId?: number;
  hasBattery?: boolean;
}

const SUPPORTED_MAPPERS = new Set([0, 1, 2, 3, 4, 7, 30]);

export function packINesRom(prgRom: Uint8Array, chrRom: Uint8Array, options: PackINesOptions = {}): Uint8Array {
  const mapperId = options.mapperId ?? 0;
  if (!SUPPORTED_MAPPERS.has(mapperId)) {
    throw new RomPackError(`未対応のマッパーです: ${mapperId}`);
  }
  if (prgRom.length === 0 || prgRom.length % 0x4000 !== 0) {
    throw new RomPackError(`PRG-ROMのサイズは16KBの倍数である必要があります（実際: ${prgRom.length}バイト）`);
  }
  if (chrRom.length % 0x2000 !== 0) {
    throw new RomPackError(`CHR-ROMのサイズは8KBの倍数（0可）である必要があります（実際: ${chrRom.length}バイト）`);
  }
  // AxROM は 32KB 単位の PRG バンク
  if (mapperId === 7 && prgRom.length % 0x8000 !== 0) {
    throw new RomPackError(`AxROM(7) の PRG-ROM は 32KB の倍数である必要があります（実際: ${prgRom.length}バイト）`);
  }

  const prgBanks = prgRom.length / 0x4000;
  const chrBanks = chrRom.length / 0x2000;
  if (prgBanks > 255 || chrBanks > 255) {
    throw new RomPackError("PRG/CHR バンク数が iNES ヘッダの上限を超えています");
  }

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0); // "NES\x1A"
  header[4] = prgBanks;
  header[5] = chrBanks;
  const mirroringBit = options.mirroring === "vertical" ? 0x01 : 0x00;
  const batteryBit = options.hasBattery ? 0x02 : 0x00;
  header[6] = mirroringBit | batteryBit | ((mapperId & 0x0f) << 4);
  header[7] = mapperId & 0xf0;

  const rom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, header.length);
  rom.set(chrRom, header.length + prgRom.length);
  return rom;
}

/** Create / compile が出力する PRG レイアウト（生成 16KB から拡張）。 */
export function expandPrgForMapper(prg16k: Uint8Array, mapperId: number): Uint8Array {
  if (prg16k.length !== 0x4000) {
    throw new RomPackError(`expandPrgForMapper は 16KB PRG を想定しています（実際: ${prg16k.length}）`);
  }
  switch (mapperId) {
    case 0:
    case 1:
    case 3:
      return prg16k;
    case 2:
    case 4:
    case 7:
    case 30: {
      // 最終バンクにベクタが載るよう 16KB を複製して 32KB にする
      const out = new Uint8Array(0x8000);
      out.set(prg16k, 0);
      out.set(prg16k, 0x4000);
      return out;
    }
    default:
      throw new RomPackError(`未対応のマッパーです: ${mapperId}`);
  }
}

export function isSupportedMapperId(id: number): id is SupportedMapperId {
  return SUPPORTED_MAPPERS.has(id);
}
