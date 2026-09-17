import { parse } from "./parser.js";
import { generate } from "./codegen.js";

export interface CompileResult {
  /** 完成した .nes ファイルのバイト列（Mapper 0 固定） */
  rom: Uint8Array;
  /** PRG-ROM部分のみ（デバッグ・テスト用） */
  prgRom: Uint8Array;
}

/**
 * JS風DSLソースコードを .nes バイナリにコンパイルする。
 *
 * 注意（M2時点の暫定仕様）: CHR-ROM統合（ドット絵エディタで描いたタイルの埋め込み）は
 * M3 の rom-builder / アセットエディタ実装後に対応する。現状はCHR-ROMを空（8KB, 全0）の
 * プレースホルダーとして出力し、PRG-ROM側（DSLからのロジック生成）の検証を主目的とする。
 */
export function compile(source: string): CompileResult {
  const program = parse(source);
  const prgRom = generate(program);

  const chrRom = new Uint8Array(0x2000);

  const header = new Uint8Array(16);
  header.set([0x4e, 0x45, 0x53, 0x1a], 0); // "NES\x1A"
  header[4] = 1; // PRG-ROM: 16KB x1
  header[5] = 1; // CHR-ROM: 8KB x1（プレースホルダー）
  header[6] = 0; // horizontal mirroring, mapper 0
  header[7] = 0;

  const rom = new Uint8Array(header.length + prgRom.length + chrRom.length);
  rom.set(header, 0);
  rom.set(prgRom, header.length);
  rom.set(chrRom, header.length + prgRom.length);

  return { rom, prgRom };
}
