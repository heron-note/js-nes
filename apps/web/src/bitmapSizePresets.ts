/**
 * ビットマップ／キャラ用のよくあるサイズプリセット。
 * ハードは 8×8 タイル単位。見た目のキャラは複数タイルが普通。
 */

export type BitmapSizePreset = {
  id: string;
  label: string;
  tileWidth: number;
  tileHeight: number;
};

/** 新規ビットマップ／キャラ用グラフィックの既定（よくある人型 16×16）。 */
export const DEFAULT_BITMAP_TILES = { tileWidth: 2, tileHeight: 2 } as const;

export const BITMAP_SIZE_PRESETS: readonly BitmapSizePreset[] = [
  { id: "bullet", label: "弾・小物 (8×8)", tileWidth: 1, tileHeight: 1 },
  { id: "humanoid", label: "人型 (16×16)", tileWidth: 2, tileHeight: 2 },
  { id: "humanoid_tall", label: "人型たて長 (16×24)", tileWidth: 2, tileHeight: 3 },
  { id: "mid", label: "中型 (24×32)", tileWidth: 3, tileHeight: 4 },
  { id: "large", label: "大型 (32×32)", tileWidth: 4, tileHeight: 4 },
  { id: "banner", label: "ロゴ横長 (64×32)", tileWidth: 8, tileHeight: 4 },
  { id: "title", label: "タイトル寄り (128×48)", tileWidth: 16, tileHeight: 6 },
  { id: "screen_w", label: "画面幅バナー (256×64)", tileWidth: 32, tileHeight: 8 },
];

export const BITMAP_TILE_MAX = 32;

export function clampTileSize(tileWidth: number, tileHeight: number): { tileWidth: number; tileHeight: number } {
  return {
    tileWidth: Math.max(1, Math.min(BITMAP_TILE_MAX, tileWidth | 0)),
    tileHeight: Math.max(1, Math.min(BITMAP_TILE_MAX, tileHeight | 0)),
  };
}

export function matchPreset(tileWidth: number, tileHeight: number): BitmapSizePreset | undefined {
  return BITMAP_SIZE_PRESETS.find((p) => p.tileWidth === tileWidth && p.tileHeight === tileHeight);
}
