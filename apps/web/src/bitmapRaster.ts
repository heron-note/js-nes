/**
 * 画像 → BitmapAsset 用ピクセル（パレット 0–3）への減色・タイル分割。
 */

import { NES_PALETTE } from "@js-nes/emulator-core";

export function nesIndexToRgb(index: number): [number, number, number] {
  const rgb = NES_PALETTE[index & 0x3f] ?? 0;
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

export function nesIndexToCss(index: number): string {
  const [r, g, b] = nesIndexToRgb(index);
  return `rgb(${r}, ${g}, ${b})`;
}

function colorDist2(r: number, g: number, b: number, ir: number, ig: number, ib: number): number {
  const dr = r - ir;
  const dg = g - ig;
  const db = b - ib;
  return dr * dr + dg * dg + db * db;
}

/** RGB を NES マスターパレット 0–63 のうち最も近い index に。 */
export function nearestNesIndex(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 64; i++) {
    const [nr, ng, nb] = nesIndexToRgb(i);
    const d = colorDist2(r, g, b, nr, ng, nb);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** RGB をパレット4色（NES index）のうち最も近いスロット 0–3 に割り当てる。 */
export function nearestPaletteSlot(
  r: number,
  g: number,
  b: number,
  paletteColors: [number, number, number, number],
): 0 | 1 | 2 | 3 {
  let best: 0 | 1 | 2 | 3 = 0;
  let bestD = Infinity;
  for (let i = 0; i < 4; i++) {
    const [nr, ng, nb] = nesIndexToRgb(paletteColors[i]!);
    const d = colorDist2(r, g, b, nr, ng, nb);
    if (d < bestD) {
      bestD = d;
      best = i as 0 | 1 | 2 | 3;
    }
  }
  return best;
}

/**
 * 画像から NES 4色パレットを推定する。
 * 不透明画素を NES 色に落とし、出現頻度上位を採用。スロット0は暗い色優先（透明扱いしやすい $0F）。
 */
export function extractNesPaletteFromRgba(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
): [number, number, number, number] {
  const counts = new Map<number, number>();
  const stepX = Math.max(1, Math.floor(srcW / 64));
  const stepY = Math.max(1, Math.floor(srcH / 64));
  for (let y = 0; y < srcH; y += stepY) {
    for (let x = 0; x < srcW; x += stepX) {
      const si = (y * srcW + x) * 4;
      const a = rgba[si + 3] ?? 0;
      if (a < 128) continue;
      const nes = nearestNesIndex(rgba[si]!, rgba[si + 1]!, rgba[si + 2]!);
      counts.set(nes, (counts.get(nes) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1]! - a[1]!);
  const picked: number[] = [];
  if (counts.has(0x0f)) {
    picked.push(0x0f);
  } else if (ranked.length > 0) {
    let darkest = ranked[0]![0];
    let darkLuma = Infinity;
    for (const [idx] of ranked) {
      const [r, g, b] = nesIndexToRgb(idx);
      const luma = r * 3 + g * 6 + b;
      if (luma < darkLuma) {
        darkLuma = luma;
        darkest = idx;
      }
    }
    picked.push(darkest);
  } else {
    picked.push(0x0f);
  }

  for (const [idx] of ranked) {
    if (picked.includes(idx)) continue;
    picked.push(idx);
    if (picked.length >= 4) break;
  }
  const pad = [0x0f, 0x00, 0x10, 0x30];
  while (picked.length < 4) {
    const next = pad.find((p) => !picked.includes(p)) ?? 0x30;
    picked.push(next);
  }
  return [picked[0]!, picked[1]!, picked[2]!, picked[3]!];
}

/**
 * 画像ピクセルを指定タイルサイズの 0–3 配列へ。
 * pixels 長さ = tileWidth * tileHeight * 64。タイル行優先。
 */
export function rasterToBitmapPixels(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  tileWidth: number,
  tileHeight: number,
  paletteColors: [number, number, number, number],
): number[] {
  const outW = tileWidth * 8;
  const outH = tileHeight * 8;
  const pixels = new Array(tileWidth * tileHeight * 64).fill(0);

  for (let ty = 0; ty < tileHeight; ty++) {
    for (let tx = 0; tx < tileWidth; tx++) {
      const tileIndex = ty * tileWidth + tx;
      const base = tileIndex * 64;
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const x = tx * 8 + px;
          const y = ty * 8 + py;
          let slot: 0 | 1 | 2 | 3 = 0;
          if (x < outW && y < outH) {
            const sx = Math.min(srcW - 1, Math.floor((x * srcW) / outW));
            const sy = Math.min(srcH - 1, Math.floor((y * srcH) / outH));
            const si = (sy * srcW + sx) * 4;
            const a = rgba[si + 3] ?? 0;
            if (a < 128) {
              slot = 0;
            } else {
              slot = nearestPaletteSlot(rgba[si]!, rgba[si + 1]!, rgba[si + 2]!, paletteColors);
            }
          }
          pixels[base + py * 8 + px] = slot;
        }
      }
    }
  }
  return pixels;
}

export function suggestTileSize(
  pixelW: number,
  pixelH: number,
  maxTiles = 32,
): { tileWidth: number; tileHeight: number } {
  const tileWidth = Math.max(1, Math.min(maxTiles, Math.ceil(pixelW / 8)));
  const tileHeight = Math.max(1, Math.min(maxTiles, Math.ceil(pixelH / 8)));
  return { tileWidth, tileHeight };
}

export async function decodeImageFile(file: File): Promise<{
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context を取得できません");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { rgba: imageData.data, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/**
 * 画像からパレットを推定しつつビットマップ化。
 * `fixedPalette` があればそれを使い、なければ画像から抽出する。
 */
export async function imageFileToBitmapWithPalette(
  file: File,
  opts?: {
    tileWidth?: number;
    tileHeight?: number;
    fixedPalette?: [number, number, number, number];
  },
): Promise<{
  tileWidth: number;
  tileHeight: number;
  pixels: number[];
  colors: [number, number, number, number];
}> {
  const { rgba, width, height } = await decodeImageFile(file);
  const colors = opts?.fixedPalette ?? extractNesPaletteFromRgba(rgba, width, height);
  const size =
    opts?.tileWidth !== undefined && opts.tileHeight !== undefined
      ? { tileWidth: opts.tileWidth, tileHeight: opts.tileHeight }
      : suggestTileSize(width, height);
  const pixels = rasterToBitmapPixels(rgba, width, height, size.tileWidth, size.tileHeight, colors);
  return { ...size, pixels, colors };
}

/** 固定パレットで減色（手描き用ビットマップへ既存パレットで流し込む場合）。 */
export async function imageFileToBitmapPixels(
  file: File,
  paletteColors: [number, number, number, number],
  size?: { tileWidth: number; tileHeight: number },
): Promise<{ tileWidth: number; tileHeight: number; pixels: number[] }> {
  const result = await imageFileToBitmapWithPalette(file, {
    fixedPalette: paletteColors,
    tileWidth: size?.tileWidth,
    tileHeight: size?.tileHeight,
  });
  return { tileWidth: result.tileWidth, tileHeight: result.tileHeight, pixels: result.pixels };
}
