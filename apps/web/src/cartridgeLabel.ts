/**
 * 「自作ファミコンカセットのラベル風画像」ジェネレーター（M6: 配布パッケージ整備）。
 * タイトル・作者名・タイルシートの1番タイルをアイコンとして、カセット風のラベル画像を描画する。
 * docs/02_ROADMAP.md の「お遊び要素」参照。
 */

import { getTiles } from "./spriteEditor.js";

const LABEL_WIDTH = 400;
const LABEL_HEIGHT = 560;

function drawIconFromTile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const tile = getTiles()[1];
  const cell = size / 8;
  const colors = ["#00000000", "#ffffff", "#5cc8ff", "#ff5c5c"];
  ctx.save();
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(x, y, size, size);
  if (tile) {
    for (let ty = 0; ty < 8; ty++) {
      for (let tx = 0; tx < 8; tx++) {
        const v = tile[ty * 8 + tx] ?? 0;
        if (v === 0) continue;
        ctx.fillStyle = colors[v] ?? "#ffffff";
        ctx.fillRect(x + tx * cell, y + ty * cell, cell, cell);
      }
    }
  }
  ctx.strokeStyle = "#2a2e3a";
  ctx.strokeRect(x, y, size, size);
  ctx.restore();
}

export interface CartridgeLabelOptions {
  title: string;
  author: string;
}

export function renderCartridgeLabel(canvas: HTMLCanvasElement, options: CartridgeLabelOptions): void {
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // カセット本体（グレー）
  ctx.fillStyle = "#8a8f98";
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  // 上部の切り欠き（NESカセット風のシルエット）
  ctx.fillStyle = "#6f7480";
  ctx.fillRect(0, 0, LABEL_WIDTH, 40);
  ctx.fillStyle = "#8a8f98";
  ctx.fillRect(40, 0, LABEL_WIDTH - 80, 24);

  // ラベル面（白背景）
  const labelX = 24;
  const labelY = 64;
  const labelW = LABEL_WIDTH - 48;
  const labelH = 360;
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(labelX, labelY, labelW, labelH);
  ctx.strokeStyle = "#2a2e3a";
  ctx.lineWidth = 3;
  ctx.strokeRect(labelX, labelY, labelW, labelH);

  // アイコン（タイル1番のプレビュー）
  const iconSize = 128;
  drawIconFromTile(ctx, labelX + (labelW - iconSize) / 2, labelY + 24, iconSize);

  // タイトル
  ctx.fillStyle = "#161616";
  ctx.textAlign = "center";
  ctx.font = "bold 28px sans-serif";
  wrapText(ctx, options.title || "(無題)", labelX + labelW / 2, labelY + 200, labelW - 32, 32);

  // 作者名
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText(`by ${options.author || "anonymous"}`, labelX + labelW / 2, labelY + labelH - 24);

  // 下部（コネクタ端子風の装飾）
  ctx.fillStyle = "#3a3d46";
  ctx.fillRect(40, LABEL_HEIGHT - 48, LABEL_WIDTH - 80, 20);

  // フッター
  ctx.fillStyle = "#161616";
  ctx.font = "12px monospace";
  ctx.fillText("FamiJS Studio — Mapper 0 (NROM)", LABEL_WIDTH / 2, LABEL_HEIGHT - 16);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.slice(0, 4).forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineHeight);
  });
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}
