import { parse } from "./parser.js";
import { generate } from "./codegen.js";
import { packChrRom } from "@js-nes/rom-builder";

export interface CompileAssets {
  /**
   * パーツ種別名 -> そのパーツが使うタイル配列（Phase 3: 資産リンク）。
   * 各タイルは8x8=64ピクセル（値0-3）で、`program.parts`の宣言順・配列内の宣言順で
   * 1本のCHR-ROMへ連結される。パーツの作者は自分のタイルシート内での0起点の番号
   * （drawSpriteのtile引数）だけを意識すればよく、他パーツとの重複や全体でのオフセットを
   * 気にする必要はない。
   */
  partTiles?: Record<string, ArrayLike<number>[]>;
  /** playSequence(id) 用。id は配列インデックス。 */
  sequences?: import("./codegen.js").SoundSequenceDef[];
}

export interface CompileResult {
  /** 完成した .nes ファイルのバイト列（Mapper 0 固定） */
  rom: Uint8Array;
  /** PRG-ROM部分のみ（デバッグ・テスト用） */
  prgRom: Uint8Array;
}

/**
 * JS風DSLソースコードを .nes バイナリにコンパイルする。
 *
 * `assets.partTiles` を渡さない場合（v0時代の呼び出し方と同一）、CHR-ROMは空（8KB, 全0）の
 * プレースホルダーとして出力される（PRG-ROM側の検証のみが目的の場合の簡便な使い方）。
 */
export function compile(source: string, assets: CompileAssets = {}): CompileResult {
  const program = parse(source);

  const tileOffsets = new Map<string, number>();
  const tiles: ArrayLike<number>[] = [];
  if (assets.partTiles) {
    for (const part of program.parts) {
      const partTiles = assets.partTiles[part.name];
      if (!partTiles || partTiles.length === 0) continue;
      tileOffsets.set(part.name, tiles.length);
      tiles.push(...partTiles);
    }
  }

  const prgRom = generate(program, { tileOffsets, sequences: assets.sequences ?? [] });

  const chrRom = tiles.length > 0 ? packChrRom(tiles) : new Uint8Array(0x2000);

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0); // "NES\x1A"
  header[4] = 1; // PRG-ROM: 16KB x1
  header[5] = 1; // CHR-ROM: 8KB x1
  header[6] = 0; // horizontal mirroring, mapper 0
  header[7] = 0;

  const rom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, header.length);
  rom.set(chrRom, header.length + prgRom.length);

  return { rom, prgRom };
}
