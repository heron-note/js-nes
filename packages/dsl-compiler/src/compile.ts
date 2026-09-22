import { parse } from "./parser.js";
import { generate } from "./codegen.js";
import { expandPrgForMapper, isSupportedMapperId, packChrRom, packINesRom } from "@js-nes/rom-builder";
import type {
  PartStmt,
  Program,
  Stmt,
} from "./ast.js";

export interface CompileAssets {
  /**
   * パーツ種別名 -> そのパーツが使うタイル配列（Phase 3: 資産リンク）。
   * 各タイルは8x8=64ピクセル（値0-3）で、`program.parts`の宣言順・配列内の宣言順で
   * 1本のCHR-ROMへ連結される。パーツの作者は自分のタイルシート内でのローカルな0起点の番号
   * （drawSpriteのtile引数）だけを意識すればよく、他パーツとの重複や全体でのオフセットを
   * 気にする必要はない。
   */
  partTiles?: Record<string, ArrayLike<number>[]>;
  /**
   * 背景用タイル（空白タイルの直後に連結）。`fillBackground` / `drawBgTile` で参照する。
   * 指定時またはソースが背景 API を使うとき、CHR[0] に空白タイルを前置する。
   */
  backgroundTiles?: ArrayLike<number>[];
  /** true なら背景描画を強制有効（ソースに API が無くても PPUMASK で BG を出す） */
  enableBackground?: boolean;
  /** playSequence(id) 用。id は配列インデックス。 */
  sequences?: import("./codegen.js").SoundSequenceDef[];
  /** Create / エミュ対応マッパー。省略時 0（NROM）。 */
  mapperId?: number;
  mirroring?: "horizontal" | "vertical";
}

export interface CompileResult {
  /** 完成した .nes ファイルのバイト列 */
  rom: Uint8Array;
  /** PRG-ROM部分のみ（マッパー用に拡張済み、デバッグ・テスト用） */
  prgRom: Uint8Array;
}

const BG_CALLS = new Set(["fillBackground", "setScroll", "drawBgTile"]);

function stmtsUseBackground(stmts: ReadonlyArray<Stmt | PartStmt>): boolean {
  for (const s of stmts) {
    if (s.kind === "callStmt" && BG_CALLS.has(s.call.callee)) return true;
    if (s.kind === "if") {
      if (stmtsUseBackground(s.consequent)) return true;
      if (s.alternate && stmtsUseBackground(s.alternate)) return true;
    }
  }
  return false;
}

/** ソースが背景 API を呼ぶか（compile が enableBackground を立てる判定用）。 */
export function programUsesBackground(program: Program): boolean {
  for (const f of program.functions) {
    if (stmtsUseBackground(f.body)) return true;
  }
  for (const part of program.parts) {
    for (const b of part.behaviors) {
      if (stmtsUseBackground(b.body)) return true;
    }
  }
  for (const scene of program.scenes) {
    for (const f of scene.functions) {
      if (stmtsUseBackground(f.body)) return true;
    }
  }
  return false;
}

/**
 * JS風DSLソースコードを .nes バイナリにコンパイルする。
 *
 * `assets.partTiles` を渡さない場合（v0時代の呼び出し方と同一）、CHR-ROMは空（8KB, 全0）の
 * プレースホルダーとして出力される（PRG-ROM側の検証のみが目的の場合の簡便な使い方）。
 */
export function compile(source: string, assets: CompileAssets = {}): CompileResult {
  const mapperId = assets.mapperId ?? 0;
  if (!isSupportedMapperId(mapperId)) {
    throw new Error(`Mapper ${mapperId} は未対応です（対応: 0,1,2,3,4,7,30）`);
  }

  const program = parse(source);
  const bgTiles = assets.backgroundTiles ?? [];
  const enableBackground =
    assets.enableBackground === true || bgTiles.length > 0 || programUsesBackground(program);

  const tileOffsets = new Map<string, number>();
  const tiles: ArrayLike<number>[] = [];
  if (enableBackground) {
    // タイル0 = 空白（全ドット0）。スプライト絵が画面全面に敷かれる事故を防ぐ。
    tiles.push(new Array(64).fill(0));
    tiles.push(...bgTiles);
  }
  if (assets.partTiles) {
    for (const part of program.parts) {
      const partTiles = assets.partTiles[part.name];
      if (!partTiles || partTiles.length === 0) continue;
      tileOffsets.set(part.name, tiles.length);
      tiles.push(...partTiles);
    }
  }

  const prg16k = generate(program, {
    tileOffsets,
    sequences: assets.sequences ?? [],
    mapperId,
    enableBackground,
  });
  const prgRom = expandPrgForMapper(prg16k, mapperId);
  const chrRom = tiles.length > 0 ? packChrRom(tiles) : new Uint8Array(0x2000);

  const rom = packINesRom(prgRom, chrRom, {
    mapperId,
    mirroring: assets.mirroring ?? "horizontal",
  });

  return { rom, prgRom };
}
