/**
 * Create v3 ビットマップ編集 UI（手描き + 画像アップロード減色 + ズーム）。
 */

import type { BitmapAsset, PaletteAsset } from "./projectV3.js";
import { imageFileToBitmapWithPalette, nesIndexToCss } from "./bitmapRaster.js";
import {
  BITMAP_SIZE_PRESETS,
  BITMAP_TILE_MAX,
  clampTileSize,
  matchPreset,
} from "./bitmapSizePresets.js";

export type BitmapEditorHandle = {
  destroy: () => void;
};

/** ズーム: fit=表示幅に合わせる / 数値=1ドットあたりのCSSピクセル */
type ZoomMode = "fit" | number;

export function mountBitmapEditor(
  container: HTMLElement,
  opts: {
    getBitmap: () => BitmapAsset;
    getPalette: () => PaletteAsset;
    resolvePaletteFromImport: (colors: [number, number, number, number], nameHint: string) => PaletteAsset;
    onChange: () => void;
    onPaletteChange: () => void;
  },
): BitmapEditorHandle {
  let activeSlot: 0 | 1 | 2 | 3 = 1;
  let painting = false;
  let selectedSwatchForNesPick: 0 | 1 | 2 | 3 | null = null;
  let zoom: ZoomMode = "fit";

  const presetOptions = BITMAP_SIZE_PRESETS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join("");

  container.innerHTML = `
    <div class="bmp-editor">
      <div class="bmp-editor-toolbar">
        <label>サイズ
          <select id="bmp-preset">
            ${presetOptions}
            <option value="custom">カスタム</option>
          </select>
        </label>
        <label>幅(タイル)<input type="number" id="bmp-tw" min="1" max="${BITMAP_TILE_MAX}" /></label>
        <label>高さ(タイル)<input type="number" id="bmp-th" min="1" max="${BITMAP_TILE_MAX}" /></label>
        <button type="button" id="bmp-resize">サイズ適用</button>
      </div>
      <div class="bmp-editor-toolbar">
        <label>表示
          <select id="bmp-zoom">
            <option value="fit" selected>フィット（全体を見ながら）</option>
            <option value="4">小さめ (×4)</option>
            <option value="8">普通 (×8)</option>
            <option value="12">大きめ (×12)</option>
            <option value="24">ドット編集 (×24)</option>
          </select>
        </label>
        <label class="bmp-upload-label">画像→現サイズ・現パレット
          <input type="file" id="bmp-upload" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
        </label>
        <button type="button" id="bmp-upload-auto">画像から自動（パレット抽出）</button>
      </div>
      <p class="muted bmp-hint">
        既定は人型 16×16。弾は 8×8、ロゴは大きめプリセット＋「フィット」表示で全体を見ながら編集できます。
      </p>
      <div class="bmp-swatches" id="bmp-swatches"></div>
      <div class="bmp-canvas-wrap">
        <canvas id="bmp-canvas" class="bmp-canvas"></canvas>
      </div>
      <details class="bmp-nes-picker">
        <summary>NES 64色からスロット色を選ぶ</summary>
        <div id="bmp-nes-grid" class="bmp-nes-grid"></div>
      </details>
      <p class="muted" id="bmp-status"></p>
    </div>
  `;

  const presetSelect = container.querySelector<HTMLSelectElement>("#bmp-preset")!;
  const twInput = container.querySelector<HTMLInputElement>("#bmp-tw")!;
  const thInput = container.querySelector<HTMLInputElement>("#bmp-th")!;
  const resizeBtn = container.querySelector<HTMLButtonElement>("#bmp-resize")!;
  const zoomSelect = container.querySelector<HTMLSelectElement>("#bmp-zoom")!;
  const uploadInput = container.querySelector<HTMLInputElement>("#bmp-upload")!;
  const uploadAutoBtn = container.querySelector<HTMLButtonElement>("#bmp-upload-auto")!;
  const swatchesEl = container.querySelector<HTMLDivElement>("#bmp-swatches")!;
  const canvasWrap = container.querySelector<HTMLDivElement>(".bmp-canvas-wrap")!;
  const canvas = container.querySelector<HTMLCanvasElement>("#bmp-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const nesGrid = container.querySelector<HTMLDivElement>("#bmp-nes-grid")!;
  const statusEl = container.querySelector<HTMLParagraphElement>("#bmp-status")!;

  function currentPixelScale(): number {
    const bmp = opts.getBitmap();
    const w = bmp.tileWidth * 8;
    if (zoom === "fit") {
      const maxW = Math.max(160, canvasWrap.clientWidth || 480);
      return Math.max(1, Math.min(24, Math.floor(maxW / w)));
    }
    return zoom;
  }

  function syncSizeInputs(): void {
    const bmp = opts.getBitmap();
    twInput.value = String(bmp.tileWidth);
    thInput.value = String(bmp.tileHeight);
    const matched = matchPreset(bmp.tileWidth, bmp.tileHeight);
    presetSelect.value = matched?.id ?? "custom";
  }

  function renderSwatches(): void {
    const pal = opts.getPalette();
    swatchesEl.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const slot = i as 0 | 1 | 2 | 3;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bmp-swatch" + (activeSlot === slot ? " selected" : "");
      btn.title = `スロット ${slot}`;
      if (slot === 0) {
        btn.style.background = "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0/10px 10px";
      } else {
        btn.style.background = nesIndexToCss(pal.colors[slot]!);
      }
      btn.textContent = String(slot);
      btn.addEventListener("click", () => {
        activeSlot = slot;
        selectedSwatchForNesPick = slot;
        renderSwatches();
        statusEl.textContent = `スロット ${slot} を選択`;
      });
      swatchesEl.appendChild(btn);
    }
  }

  function renderNesGrid(): void {
    nesGrid.innerHTML = "";
    for (let i = 0; i < 64; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bmp-nes-cell";
      btn.style.background = nesIndexToCss(i);
      btn.title = `$${i.toString(16).padStart(2, "0")}`;
      btn.addEventListener("click", () => {
        const slot = selectedSwatchForNesPick ?? activeSlot;
        const pal = opts.getPalette();
        pal.colors[slot] = i;
        opts.onPaletteChange();
        renderSwatches();
        renderCanvas();
        statusEl.textContent = `スロット ${slot} ← NES $${i.toString(16).padStart(2, "0")}`;
      });
      nesGrid.appendChild(btn);
    }
  }

  function renderCanvas(): void {
    const bmp = opts.getBitmap();
    const pal = opts.getPalette();
    const scale = currentPixelScale();
    const w = bmp.tileWidth * 8;
    const h = bmp.tileHeight * 8;
    canvas.width = w * scale;
    canvas.height = h * scale;
    ctx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < bmp.tileHeight; ty++) {
      for (let tx = 0; tx < bmp.tileWidth; tx++) {
        const tileIndex = ty * bmp.tileWidth + tx;
        const base = tileIndex * 64;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const slot = (bmp.pixels[base + py * 8 + px] ?? 0) & 3;
            const x = (tx * 8 + px) * scale;
            const y = (ty * 8 + py) * scale;
            if (slot === 0) {
              ctx.fillStyle = ((tx * 8 + px) + (ty * 8 + py)) % 2 === 0 ? "#2a2e3a" : "#1e2230";
            } else {
              ctx.fillStyle = nesIndexToCss(pal.colors[slot]!);
            }
            ctx.fillRect(x, y, scale, scale);
          }
        }
      }
    }

    if (scale >= 4) {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let tx = 0; tx <= bmp.tileWidth; tx++) {
        const x = tx * 8 * scale + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let ty = 0; ty <= bmp.tileHeight; ty++) {
        const y = ty * 8 * scale + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    const px = bmp.tileWidth * 8;
    const py = bmp.tileHeight * 8;
    statusEl.textContent = `${px}×${py}px（${bmp.tileWidth}×${bmp.tileHeight} タイル）・表示 ×${scale}${zoom === "fit" ? "（フィット）" : ""}`;
  }

  function paintAt(clientX: number, clientY: number): void {
    const bmp = opts.getBitmap();
    const scale = currentPixelScale();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.floor(((clientX - rect.left) * scaleX) / scale);
    const py = Math.floor(((clientY - rect.top) * scaleY) / scale);
    const w = bmp.tileWidth * 8;
    const h = bmp.tileHeight * 8;
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const tx = Math.floor(px / 8);
    const ty = Math.floor(py / 8);
    const lx = px % 8;
    const ly = py % 8;
    const tileIndex = ty * bmp.tileWidth + tx;
    const idx = tileIndex * 64 + ly * 8 + lx;
    if (bmp.pixels[idx] === activeSlot) return;
    bmp.pixels[idx] = activeSlot;
    opts.onChange();
    renderCanvas();
  }

  function resizeBitmap(tileWidth: number, tileHeight: number): void {
    const bmp = opts.getBitmap();
    const { tileWidth: tw, tileHeight: th } = clampTileSize(tileWidth, tileHeight);
    const next = new Array(tw * th * 64).fill(0);
    const copyTw = Math.min(tw, bmp.tileWidth);
    const copyTh = Math.min(th, bmp.tileHeight);
    for (let ty = 0; ty < copyTh; ty++) {
      for (let tx = 0; tx < copyTw; tx++) {
        const srcBase = (ty * bmp.tileWidth + tx) * 64;
        const dstBase = (ty * tw + tx) * 64;
        for (let i = 0; i < 64; i++) next[dstBase + i] = bmp.pixels[srcBase + i] ?? 0;
      }
    }
    bmp.tileWidth = tw;
    bmp.tileHeight = th;
    bmp.pixels = next;
    opts.onChange();
    syncSizeInputs();
    renderCanvas();
  }

  async function importImage(file: File, mode: "fixed" | "extract"): Promise<void> {
    const bmp = opts.getBitmap();
    statusEl.textContent = "画像を変換中…";
    try {
      if (mode === "fixed") {
        const pal = opts.getPalette();
        const result = await imageFileToBitmapWithPalette(file, {
          fixedPalette: pal.colors,
          tileWidth: bmp.tileWidth,
          tileHeight: bmp.tileHeight,
        });
        bmp.pixels = result.pixels;
        opts.onChange();
        renderCanvas();
        statusEl.textContent = `「${file.name}」を現在のパレット・サイズで取り込みました`;
        return;
      }

      const result = await imageFileToBitmapWithPalette(file);
      const { tileWidth, tileHeight } = clampTileSize(result.tileWidth, result.tileHeight);
      const pal = opts.resolvePaletteFromImport(result.colors, `${file.name} のパレット`);
      // 推定サイズが clamp された場合は再ラスタが必要だが、取り込み結果をそのまま縮退コピー
      if (tileWidth === result.tileWidth && tileHeight === result.tileHeight) {
        bmp.pixels = result.pixels;
      } else {
        const next = new Array(tileWidth * tileHeight * 64).fill(0);
        for (let ty = 0; ty < Math.min(tileHeight, result.tileHeight); ty++) {
          for (let tx = 0; tx < Math.min(tileWidth, result.tileWidth); tx++) {
            const srcBase = (ty * result.tileWidth + tx) * 64;
            const dstBase = (ty * tileWidth + tx) * 64;
            for (let i = 0; i < 64; i++) next[dstBase + i] = result.pixels[srcBase + i] ?? 0;
          }
        }
        bmp.pixels = next;
      }
      bmp.tileWidth = tileWidth;
      bmp.tileHeight = tileHeight;
      bmp.paletteId = pal.id;
      opts.onChange();
      syncSizeInputs();
      renderSwatches();
      renderCanvas();
      statusEl.textContent = `「${file.name}」を取り込み（パレット「${pal.name}」）`;
    } catch (err: unknown) {
      statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!painting) return;
    paintAt(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    painting = false;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  presetSelect.addEventListener("change", () => {
    const preset = BITMAP_SIZE_PRESETS.find((p) => p.id === presetSelect.value);
    if (!preset) return;
    twInput.value = String(preset.tileWidth);
    thInput.value = String(preset.tileHeight);
    resizeBitmap(preset.tileWidth, preset.tileHeight);
  });

  resizeBtn.addEventListener("click", () => {
    resizeBitmap(Number(twInput.value) | 0, Number(thInput.value) | 0);
  });

  zoomSelect.addEventListener("change", () => {
    const v = zoomSelect.value;
    zoom = v === "fit" ? "fit" : Math.max(1, Number(v) | 0);
    renderCanvas();
  });

  uploadInput.addEventListener("change", () => {
    const file = uploadInput.files?.[0];
    uploadInput.value = "";
    if (file) void importImage(file, "fixed");
  });

  uploadAutoBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void importImage(file, "extract");
    });
    input.click();
  });

  const onResize = () => {
    if (zoom === "fit") renderCanvas();
  };
  window.addEventListener("resize", onResize);

  syncSizeInputs();
  renderSwatches();
  renderNesGrid();
  renderCanvas();

  return {
    destroy: () => {
      window.removeEventListener("resize", onResize);
      container.innerHTML = "";
    },
  };
}
