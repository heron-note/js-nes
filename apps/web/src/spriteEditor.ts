import { NES_PALETTE } from "@js-nes/emulator-core";

/**
 * ドット絵（CHR）エディタ。8x8タイルのシートを編集する。
 * ここで編集した内容は rom-builder の packChrRom() でCHR-ROMにパッキングされる。
 * 注意: ここでの「プレビュー用パレット」は編集画面の見た目のためだけのものであり、
 * 実際にゲーム画面に出る色はDSLコードの setPalette() が実行時に決める（CHRデータ自体は色番号非依存）。
 */

// 256枚 = ファミコン実機のスプライト用パターンテーブル（$0000-$0FFF）がそのまま持てるタイル数の上限
// （Mapper 0・バンク切り替えなしでも追加変換なしにこの数まで使える。参照: docs/05_ASSET_EDITOR_SPEC.md）。
const TILE_COUNT = 256;
const TILE_SIZE = 8;
const PIXELS_PER_TILE = TILE_SIZE * TILE_SIZE;

const tiles: Uint8Array[] = Array.from({ length: TILE_COUNT }, () => new Uint8Array(PIXELS_PER_TILE));
let activeTileIndex = 0;
let activeColor = 1; // 0=透明, 1-3=描画色

// プレビュー用パレット（NESパレット色番号 0-63）。初期値はよく使われる定番配色。
const previewPalette = [0x0f, 0x30, 0x21, 0x16];

function nesColorCss(paletteIndex: number): string {
  const rgb = NES_PALETTE[paletteIndex & 0x3f] ?? 0;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}

export function getTiles(): Uint8Array[] {
  return tiles;
}

let sheetEl: HTMLDivElement;
let editEl: HTMLCanvasElement;
let editCtx: CanvasRenderingContext2D;
let swatchesEl: HTMLDivElement;
let tileJumpInput: HTMLInputElement | null;

const EDIT_CANVAS_SIZE = 256; // 256/8 = 32px per pixel
const CELL_SIZE = EDIT_CANVAS_SIZE / TILE_SIZE;

function renderSwatches(): void {
  swatchesEl.innerHTML = "";
  previewPalette.forEach((paletteIndex, colorSlot) => {
    const wrap = document.createElement("div");
    wrap.className = "swatch-item";

    const swatch = document.createElement("button");
    swatch.className = "swatch-color";
    swatch.style.background = colorSlot === 0 ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0/12px 12px" : nesColorCss(paletteIndex);
    swatch.setAttribute("aria-label", `色スロット${colorSlot}を選択`);
    if (colorSlot === activeColor) swatch.classList.add("selected");
    swatch.addEventListener("click", () => {
      activeColor = colorSlot;
      renderSwatches();
    });

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "63";
    input.value = String(paletteIndex);
    input.className = "swatch-input";
    input.addEventListener("change", () => {
      const v = Math.max(0, Math.min(63, Number(input.value) || 0));
      previewPalette[colorSlot] = v;
      renderSwatches();
      renderEditCanvas();
      tiles.forEach((_tile, i) => redrawThumbnail(i));
    });

    wrap.appendChild(swatch);
    wrap.appendChild(input);
    swatchesEl.appendChild(wrap);
  });
}

function tileColorCss(colorSlot: number): string {
  if (colorSlot === 0) return "#000";
  return nesColorCss(previewPalette[colorSlot] ?? 0);
}

function renderEditCanvas(): void {
  const tile = tiles[activeTileIndex]!;
  editCtx.clearRect(0, 0, EDIT_CANVAS_SIZE, EDIT_CANVAS_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = tile[y * TILE_SIZE + x] ?? 0;
      editCtx.fillStyle = tileColorCss(v);
      editCtx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }
  editCtx.strokeStyle = "#00000033";
  for (let i = 0; i <= TILE_SIZE; i++) {
    editCtx.beginPath();
    editCtx.moveTo(i * CELL_SIZE, 0);
    editCtx.lineTo(i * CELL_SIZE, EDIT_CANVAS_SIZE);
    editCtx.stroke();
    editCtx.beginPath();
    editCtx.moveTo(0, i * CELL_SIZE);
    editCtx.lineTo(EDIT_CANVAS_SIZE, i * CELL_SIZE);
    editCtx.stroke();
  }
}

// タイル数が256枚と多いため、ストローク中の1ピクセルごとにDOMを全部作り直すと重くなる。
// サムネイル要素は初回に1度だけ作り、以後は該当タイルのcanvasだけを再描画する。
const thumbEls: { wrap: HTMLButtonElement; ctx: CanvasRenderingContext2D }[] = [];

function redrawThumbnail(i: number): void {
  const el = thumbEls[i];
  if (!el) return;
  const tile = tiles[i]!;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = tile[y * TILE_SIZE + x] ?? 0;
      el.ctx.fillStyle = tileColorCss(v);
      el.ctx.fillRect(x, y, 1, 1);
    }
  }
}

function selectTile(i: number): void {
  thumbEls[activeTileIndex]?.wrap.classList.remove("selected");
  activeTileIndex = i;
  thumbEls[activeTileIndex]?.wrap.classList.add("selected");
  renderEditCanvas();
  if (tileJumpInput) tileJumpInput.value = String(i);
}

function buildSheet(): void {
  sheetEl.innerHTML = "";
  thumbEls.length = 0;
  tiles.forEach((_tile, i) => {
    const wrap = document.createElement("button");
    wrap.type = "button";
    wrap.className = "tile-thumb-wrap" + (i === activeTileIndex ? " selected" : "");
    wrap.setAttribute("aria-label", `タイル${i}番を編集`);

    const c = document.createElement("canvas");
    c.width = TILE_SIZE;
    c.height = TILE_SIZE;
    c.className = "tile-thumb";
    const cctx = c.getContext("2d")!;

    const label = document.createElement("span");
    label.className = "tile-thumb-label";
    label.textContent = String(i);

    wrap.appendChild(c);
    wrap.appendChild(label);
    wrap.addEventListener("click", () => selectTile(i));
    sheetEl.appendChild(wrap);

    thumbEls.push({ wrap, ctx: cctx });
    redrawThumbnail(i);
  });
}

function paintAt(clientX: number, clientY: number): void {
  const rect = editEl.getBoundingClientRect();
  const scaleX = EDIT_CANVAS_SIZE / rect.width;
  const scaleY = EDIT_CANVAS_SIZE / rect.height;
  const x = Math.floor(((clientX - rect.left) * scaleX) / CELL_SIZE);
  const y = Math.floor(((clientY - rect.top) * scaleY) / CELL_SIZE);
  if (x < 0 || x >= TILE_SIZE || y < 0 || y >= TILE_SIZE) return;
  const tile = tiles[activeTileIndex]!;
  tile[y * TILE_SIZE + x] = activeColor;
  renderEditCanvas();
  redrawThumbnail(activeTileIndex);
}

export function initSpriteEditor(): void {
  sheetEl = document.querySelector<HTMLDivElement>("#tile-sheet")!;
  editEl = document.querySelector<HTMLCanvasElement>("#tile-edit")!;
  swatchesEl = document.querySelector<HTMLDivElement>("#palette-swatches")!;
  tileJumpInput = document.querySelector<HTMLInputElement>("#tile-jump-input");
  if (!sheetEl || !editEl || !swatchesEl) return;

  editEl.width = EDIT_CANVAS_SIZE;
  editEl.height = EDIT_CANVAS_SIZE;
  editCtx = editEl.getContext("2d")!;

  let painting = false;
  editEl.addEventListener("pointerdown", (e) => {
    painting = true;
    paintAt(e.clientX, e.clientY);
  });
  editEl.addEventListener("pointermove", (e) => {
    if (painting) paintAt(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => {
    painting = false;
  });

  tileJumpInput?.addEventListener("change", () => {
    const v = Math.max(0, Math.min(TILE_COUNT - 1, Number(tileJumpInput!.value) || 0));
    selectTile(v);
    thumbEls[v]?.wrap.scrollIntoView({ block: "nearest" });
  });

  renderSwatches();
  renderEditCanvas();
  buildSheet();
}
