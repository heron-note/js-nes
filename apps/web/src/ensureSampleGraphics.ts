/**
 * サンプル Player / Mover のビットマップが全透明のとき、見えるドットを埋める。
 */
import type { ProjectV3 } from "./projectV3.js";

function paintSimpleTile(pixels: number[], pattern: "player" | "mover"): void {
  if (pixels.length < 64) return;
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < 8 && y >= 0 && y < 8) pixels[y * 8 + x] = c;
  };
  for (let i = 0; i < 64; i++) pixels[i] = 0;
  if (pattern === "player") {
    for (let x = 2; x <= 5; x++) put(x, 1, 3);
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) put(x, y, 2);
    put(3, 6, 1);
    put(4, 6, 1);
  } else {
    for (let x = 1; x <= 6; x++) put(x, 3, 3);
    for (let x = 2; x <= 5; x++) put(x, 4, 2);
    put(1, 3, 1);
    put(6, 3, 1);
  }
}

function isBlankBitmap(pixels: number[]): boolean {
  return pixels.every((p) => p === 0);
}

/** 変更したら true。 */
export function ensureSampleGraphics(project: ProjectV3): boolean {
  let changed = false;
  for (const id of project.characterOrder) {
    const ch = project.characters[id];
    if (!ch) continue;
    const pattern = ch.name === "Player" ? "player" : ch.name === "Mover" ? "mover" : null;
    if (!pattern) continue;
    const bmp = project.bitmaps[ch.bitmapId];
    if (!bmp || !isBlankBitmap(bmp.pixels)) continue;
    paintSimpleTile(bmp.pixels, pattern);
    changed = true;
  }
  return changed;
}
