import type { INesRom, Mirroring } from "./ines.js";
import { NromMapper } from "./mappers/nrom.js";
import { UxromMapper } from "./mappers/uxrom.js";
import { CnromMapper } from "./mappers/cnrom.js";
import { AxromMapper } from "./mappers/axrom.js";
import { Mmc1Mapper } from "./mappers/mmc1.js";
import { Mmc3Mapper } from "./mappers/mmc3.js";

/**
 * カートリッジ側のバンク切り替え回路（マッパー）の共通インターフェース。
 * $6000-$FFFF のCPUアドレス空間（PRG-RAM + PRG-ROM）と、$0000-$1FFF のPPUアドレス空間
 * （CHR-ROM/RAM）へのアクセスをすべてここに集約する。ミラーリング・IRQもマッパーが
 * 制御するカートリッジがあるため、その通知経路もここで持つ。
 */
export interface Mapper {
  cpuRead(addr: number): number;
  cpuWrite(addr: number, value: number): void;
  ppuRead(addr: number): number;
  ppuWrite(addr: number, value: number): void;

  /**
   * マッパーがミラーリングを動的に制御する場合はその値を返す。
   * 固定ミラーリング（iNESヘッダー任せ）のマッパーは常にnullを返す。
   */
  getMirroringOverride(): Mirroring | null;

  /**
   * 可視スキャンライン1本ごとに1回呼ばれる（PPUがドット単位でなくスキャンライン単位の
   * バッチレンダラーであるため、実機のPPU A12エッジ検出の簡略近似として採用）。
   * MMC3のスキャンラインIRQカウンタ以外のマッパーでは何もしない。
   */
  notifyScanline(renderingEnabled: boolean): void;

  /** レベル型のIRQ線。CPU命令境界ごとにポーリングされる。 */
  irqPending(): boolean;
  /** マッパー側のIRQ確認（MMC3の$E000書き込み等）。Nes側からは呼ばれない。 */
  clearIrq(): void;
}

/**
 * iNESのmapperIdに応じたMapper実装を生成する。
 * 対応マッパーは段階的に追加していく（実行計画のPhase 2以降でUxROM/CNROM/AxROM/MMC1/MMC3を追加）。
 */
export function createMapper(rom: INesRom): Mapper {
  switch (rom.mapperId) {
    case 0:
      return new NromMapper(rom.prgRom, rom.chrRom, rom.chrIsRam);
    case 1:
      return new Mmc1Mapper(rom.prgRom, rom.chrRom, rom.chrIsRam);
    case 2:
      return new UxromMapper(rom.prgRom, rom.chrRom, rom.chrIsRam);
    case 3:
      return new CnromMapper(rom.prgRom, rom.chrRom, rom.chrIsRam);
    case 4:
      return new Mmc3Mapper(rom.prgRom, rom.chrRom, rom.chrIsRam);
    case 7:
      return new AxromMapper(rom.prgRom, rom.chrRom, rom.chrIsRam);
    default:
      throw new Error(`Mapper ${rom.mapperId} は未対応です`);
  }
}
