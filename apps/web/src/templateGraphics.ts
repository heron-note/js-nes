/** テンプレ用の簡易ドット絵（8×8）。 */

export type TilePattern =
  | "player"
  | "enemy"
  | "ghost"
  | "npc"
  | "bullet"
  | "coin"
  | "ground"
  | "goal"
  | "fighter"
  | "dot";

function put(pixels: number[], x: number, y: number, c: number): void {
  if (x >= 0 && x < 8 && y >= 0 && y < 8) pixels[y * 8 + x] = c;
}

export function paintTile(pixels: number[], pattern: TilePattern): void {
  for (let i = 0; i < 64; i++) pixels[i] = 0;
  switch (pattern) {
    case "player":
      for (let x = 2; x <= 5; x++) put(pixels, x, 1, 3);
      for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) put(pixels, x, y, 2);
      put(pixels, 3, 6, 1);
      put(pixels, 4, 6, 1);
      break;
    case "enemy":
      for (let x = 1; x <= 6; x++) put(pixels, x, 3, 3);
      for (let x = 2; x <= 5; x++) put(pixels, x, 4, 2);
      put(pixels, 1, 3, 1);
      put(pixels, 6, 3, 1);
      put(pixels, 2, 2, 1);
      put(pixels, 5, 2, 1);
      break;
    case "ghost":
      for (let y = 2; y <= 6; y++) for (let x = 1; x <= 6; x++) put(pixels, x, y, 2);
      put(pixels, 2, 3, 3);
      put(pixels, 5, 3, 3);
      put(pixels, 2, 7, 2);
      put(pixels, 4, 7, 2);
      put(pixels, 6, 7, 2);
      break;
    case "npc":
      for (let x = 2; x <= 5; x++) put(pixels, x, 1, 3);
      for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) put(pixels, x, y, 1);
      put(pixels, 3, 6, 2);
      put(pixels, 4, 6, 2);
      break;
    case "bullet":
      put(pixels, 3, 2, 3);
      put(pixels, 4, 2, 3);
      put(pixels, 3, 3, 2);
      put(pixels, 4, 3, 2);
      put(pixels, 3, 4, 2);
      put(pixels, 4, 4, 2);
      break;
    case "coin":
      for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) put(pixels, x, y, 3);
      put(pixels, 3, 3, 1);
      put(pixels, 4, 4, 1);
      break;
    case "ground":
      for (let y = 4; y <= 7; y++) for (let x = 0; x <= 7; x++) put(pixels, x, y, 2);
      for (let x = 0; x <= 7; x++) put(pixels, x, 4, 3);
      break;
    case "goal":
      for (let y = 0; y <= 7; y++) put(pixels, 3, y, 2);
      for (let x = 3; x <= 6; x++) put(pixels, x, 1, 3);
      for (let x = 3; x <= 5; x++) put(pixels, x, 2, 3);
      break;
    case "fighter":
      for (let x = 2; x <= 5; x++) put(pixels, x, 0, 3);
      for (let y = 1; y <= 4; y++) for (let x = 2; x <= 5; x++) put(pixels, x, y, 2);
      put(pixels, 1, 2, 1);
      put(pixels, 6, 2, 1);
      put(pixels, 2, 5, 1);
      put(pixels, 5, 5, 1);
      put(pixels, 2, 6, 1);
      put(pixels, 5, 6, 1);
      break;
    case "dot":
      put(pixels, 3, 3, 3);
      put(pixels, 4, 3, 3);
      put(pixels, 3, 4, 3);
      put(pixels, 4, 4, 3);
      break;
  }
}
