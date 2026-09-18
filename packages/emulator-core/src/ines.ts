/**
 * iNESフォーマット（.nes）のパーサー。
 * 対応マッパーは packages/emulator-core/src/mapper.ts の createMapper() 参照。
 */

/**
 * "four-screen" は当面 "vertical" のフォールバックとして扱う（本来は4枚分の独立した
 * ネームテーブルRAMが必要だが、対応予定のマッパー（NROM/MMC1/UxROM/CNROM/MMC3/AxROM）
 * ではいずれも実質的に使われないため、型としては受け付けつつ実装は将来課題とする）。
 */
export type Mirroring = "horizontal" | "vertical" | "single-screen-a" | "single-screen-b" | "four-screen";

export interface INesRom {
  prgRom: Uint8Array;
  chrRom: Uint8Array;
  chrIsRam: boolean;
  mapperId: number;
  mirroring: Mirroring;
  hasBattery: boolean;
}

const MAGIC = [0x4e, 0x45, 0x53, 0x1a]; // "NES\x1A"

export function parseINes(data: Uint8Array): INesRom {
  if (data.length < 16) {
    throw new Error("iNESファイルとして不正です（16バイト未満）");
  }
  for (let i = 0; i < 4; i++) {
    if (data[i] !== MAGIC[i]) {
      throw new Error("iNESファイルとして不正です（マジックナンバー不一致）");
    }
  }

  const prgBanks = data[4] ?? 0;
  const chrBanks = data[5] ?? 0;
  const flags6 = data[6] ?? 0;
  const flags7 = data[7] ?? 0;

  const mapperId = (flags7 & 0xf0) | (flags6 >> 4);
  const mirroring: Mirroring = (flags6 & 0x01) !== 0 ? "vertical" : "horizontal";
  const hasBattery = (flags6 & 0x02) !== 0;
  const hasTrainer = (flags6 & 0x04) !== 0;

  let offset = 16;
  if (hasTrainer) offset += 512;

  const prgSize = prgBanks * 16384;
  const prgRom = data.slice(offset, offset + prgSize);
  offset += prgSize;

  const chrIsRam = chrBanks === 0;
  // Mapper 30 (UNROM 512) の iNES 既定は 32KB CHR-RAM（NES 2.0 未解釈時）。
  const chrSize = chrIsRam ? (mapperId === 30 ? 0x8000 : 8192) : chrBanks * 8192;
  const chrRom = chrIsRam ? new Uint8Array(chrSize) : data.slice(offset, offset + chrSize);

  if (prgRom.length !== prgSize) {
    throw new Error("iNESファイルが破損しています（PRG-ROMサイズ不一致）");
  }
  if (!chrIsRam && chrRom.length !== chrSize) {
    throw new Error("iNESファイルが破損しています（CHR-ROMサイズ不一致）");
  }

  return { prgRom, chrRom, chrIsRam, mapperId, mirroring, hasBattery };
}
