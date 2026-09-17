/**
 * ドット絵エディタのタイルデータ（8x8、各ピクセル0-3の値）を
 * ファミコンのCHR-ROM形式（2bppビットプレーン、1タイル16バイト）にパッキングする。
 * docs/05_ASSET_EDITOR_SPEC.md 参照。
 */

export const TILE_WIDTH = 8;
export const TILE_HEIGHT = 8;
export const TILE_PIXEL_COUNT = TILE_WIDTH * TILE_HEIGHT;
export const TILE_BYTE_SIZE = 16;

export class ChrPackError extends Error {}

/** 1タイル分（64ピクセル、値0-3）を16バイトの2bppパターンデータに変換する。 */
export function packChrTile(pixels: ArrayLike<number>): Uint8Array {
  if (pixels.length !== TILE_PIXEL_COUNT) {
    throw new ChrPackError(`タイルは${TILE_PIXEL_COUNT}ピクセル（8x8）である必要があります（実際: ${pixels.length}）`);
  }
  const out = new Uint8Array(TILE_BYTE_SIZE);
  for (let row = 0; row < TILE_HEIGHT; row++) {
    let plane0 = 0;
    let plane1 = 0;
    for (let col = 0; col < TILE_WIDTH; col++) {
      const v = pixels[row * TILE_WIDTH + col] ?? 0;
      if (v < 0 || v > 3) {
        throw new ChrPackError(`ピクセル値は0-3である必要があります（実際: ${v}）`);
      }
      const bit = 7 - col;
      if (v & 1) plane0 |= 1 << bit;
      if (v & 2) plane1 |= 1 << bit;
    }
    out[row] = plane0;
    out[row + 8] = plane1;
  }
  return out;
}

/** 複数タイルを1つのCHR-ROM（既定8KB、512タイル分）にパッキングする。収まらないタイルは無視する。 */
export function packChrRom(tiles: ArrayLike<number>[], bankSize = 0x2000): Uint8Array {
  const rom = new Uint8Array(bankSize);
  tiles.forEach((tile, i) => {
    const offset = i * TILE_BYTE_SIZE;
    if (offset + TILE_BYTE_SIZE > bankSize) return;
    rom.set(packChrTile(tile), offset);
  });
  return rom;
}
