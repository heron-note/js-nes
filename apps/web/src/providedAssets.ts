/**
 * 提供アセット（ビルトイン）。今はフォント（英数記号・ひらがな・カタカナ）パック。
 * プロジェクトへ取り込んだうえで、ビルド時は参照されているものだけ CHR に載せる。
 */

import {
  findOrCreatePalette,
  newAssetId,
  type BitmapAsset,
  type ProjectV3,
} from "./projectV3.js";

export const FONT_JP_BASIC_PACK_ID = "font-jp-basic";

export type ProvidedAssetPack = {
  id: string;
  title: string;
  description: string;
  kind: "font";
};

export const PROVIDED_ASSET_PACKS: readonly ProvidedAssetPack[] = [
  {
    id: FONT_JP_BASIC_PACK_ID,
    title: "基本フォント（英数・かな）",
    description: "半角英数記号・ひらがな・カタカナを 8×8 グリフとして取り込みます。ビルドでは使った文字だけ CHR に入ります。",
    kind: "font",
  },
];

/** 取り込む文字集合（空白〜ASCII記号、ひらがな、カタカナ、長音・中黒など）。 */
export function fontJpBasicCharset(): string {
  const ascii: string[] = [];
  for (let c = 0x20; c <= 0x7e; c++) ascii.push(String.fromCharCode(c));

  const hiragana: string[] = [];
  for (let c = 0x3041; c <= 0x3096; c++) hiragana.push(String.fromCodePoint(c)); // ぁ-ゖ
  hiragana.push("ー", "゛", "゜", "、", "。", "「", "」");

  const katakana: string[] = [];
  for (let c = 0x30a1; c <= 0x30fa; c++) katakana.push(String.fromCodePoint(c)); // ァ-ヺ
  katakana.push("・", "ー");

  return [...new Set([...ascii, ...hiragana, ...katakana])].join("");
}

export function providedSourceKey(packId: string, ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `builtin:${packId}:U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * 1文字を 8×8・2階調（0=透明, 1=インク）のピクセルにラスタライズ。
 * ブラウザの canvas + システムフォント依存（見た目は環境差あり。NES 風の下書きとして使う）。
 */
export function rasterizeGlyph8x8(ch: string): number[] {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Array(64).fill(0);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 小さめに描いて欠けを減らす
  const fontSize = ch.match(/[^\x00-\x7F]/) ? 7 : 8;
  ctx.font = `bold ${fontSize}px "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif`;
  ctx.fillText(ch, size / 2, size / 2 + 0.5);

  const { data } = ctx.getImageData(0, 0, size, size);
  const pixels = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    const r = data[i * 4]!;
    const a = data[i * 4 + 3]!;
    pixels[i] = a > 128 && r > 128 ? 1 : 0;
  }
  return pixels;
}

export type ImportFontResult = {
  added: number;
  skipped: number;
  paletteId: string;
};

/**
 * フォントパックをプロジェクトのビットマップ群として取り込む。
 * 既に同じ providedSource があればスキップ。
 */
export function importFontJpBasicIntoProject(project: ProjectV3): ImportFontResult {
  const pack = PROVIDED_ASSET_PACKS.find((p) => p.id === FONT_JP_BASIC_PACK_ID)!;
  const palette = findOrCreatePalette(project, [0x0f, 0x30, 0x10, 0x00], "フォント（白）");

  const existingBySource = new Map<string, string>();
  for (const bmp of Object.values(project.bitmaps)) {
    if (bmp.providedSource) existingBySource.set(bmp.providedSource, bmp.id);
  }

  let added = 0;
  let skipped = 0;
  const chars = fontJpBasicCharset();

  for (const ch of chars) {
    const source = providedSourceKey(pack.id, ch);
    if (existingBySource.has(source)) {
      skipped += 1;
      continue;
    }
    const id = newAssetId("bmp");
    const label = ch === " " ? "SP" : ch;
    const bmp: BitmapAsset = {
      id,
      name: `字「${label}」`,
      tileWidth: 1,
      tileHeight: 1,
      pixels: rasterizeGlyph8x8(ch),
      paletteId: palette.id,
      providedSource: source,
    };
    project.bitmaps[id] = bmp;
    project.bitmapOrder.push(id);
    existingBySource.set(source, id);
    added += 1;
  }

  return { added, skipped, paletteId: palette.id };
}

export function countImportedFontGlyphs(project: ProjectV3, packId = FONT_JP_BASIC_PACK_ID): number {
  const prefix = `builtin:${packId}:`;
  return Object.values(project.bitmaps).filter((b) => b.providedSource?.startsWith(prefix)).length;
}
