/**
 * OGP / PWA 用 PNG を依存なしで生成する。
 * node apps/web/scripts/generate-pwa-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public");

/** @param {Buffer} buf */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

/** @param {Uint8Array} rgba @param {number} w @param {number} h */
function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = row + 1 + x * 4;
      raw[di] = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
      raw[di + 3] = rgba[si + 3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const makeChunk = (type, data) => {
    const typeBuf = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** viewBox 32x32 のカセットを scale 倍で描画（左上 ox,oy） */
function drawCassette(px, canvasW, canvasH, ox, oy, scale) {
  const set = (x, y, r, g, b, a = 255) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= canvasW || yi >= canvasH) return;
    const i = (yi * canvasW + xi) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const fillRect = (x, y, w, h, r, g, b) => {
    const x0 = Math.floor(ox + x * scale);
    const y0 = Math.floor(oy + y * scale);
    const x1 = Math.ceil(ox + (x + w) * scale);
    const y1 = Math.ceil(oy + (y + h) * scale);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) set(xx, yy, r, g, b);
    }
  };
  fillRect(2, 3, 28, 26, 0x8b, 0x1d, 0x2c);
  fillRect(5, 4, 22, 2, 0x6a, 0x13, 0x1f);
  fillRect(4, 8, 24, 14, 0xec, 0xe5, 0xd3);
  fillRect(6, 10, 20, 10, 0xff, 0xff, 0xff);
  fillRect(12, 12, 2, 6, 0x8b, 0x1d, 0x2c);
  fillRect(18, 12, 2, 6, 0x8b, 0x1d, 0x2c);
  fillRect(14, 14, 4, 2, 0x8b, 0x1d, 0x2c);
  fillRect(23, 5, 4, 3, 0x00, 0xe5, 0xff);
  fillRect(20, 2, 3, 3, 0xff, 0x70, 0x43);
  fillRect(6, 27, 20, 2, 0xe5, 0xb8, 0x3b);
}

/** 正方形アプリアイコン */
function renderAppIcon(size) {
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 0x10;
    px[i + 1] = 0x12;
    px[i + 2] = 0x18;
    px[i + 3] = 255;
  }
  drawCassette(px, size, size, 0, 0, size / 32);
  return px;
}

/** note / SNS 用 1200x630 */
function renderOgImage() {
  const w = 1200;
  const h = 630;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 0x10;
    px[i + 1] = 0x12;
    px[i + 2] = 0x18;
    px[i + 3] = 255;
  }
  // 左にアクセント帯
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * w + x) * 4;
      px[i] = 0x8b;
      px[i + 1] = 0x1d;
      px[i + 2] = 0x2c;
    }
  }
  const iconScale = 14; // 32*14 = 448px
  const iconSize = 32 * iconScale;
  const ox = Math.floor((w - iconSize) / 2);
  const oy = Math.floor((h - iconSize) / 2) - 20;
  drawCassette(px, w, h, ox, oy, iconScale);
  return { rgba: px, w, h };
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  const png = encodePng(renderAppIcon(size), size, size);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}

// og-image.png は scripts/generate-og-image.mjs で生成し public にコミットする。
// ビルド時に上書きしない（note/X 向けの見える画像を壊さないため）。
