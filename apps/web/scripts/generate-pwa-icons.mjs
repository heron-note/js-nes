/**
 * カセットブランドマークを PWA 用 PNG に書き出す（依存なし）。
 * node apps/web/scripts/generate-pwa-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public");

/** @param {number} size */
function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 32; // viewBox 0..32

  const set = (x, y, r, g, b, a = 255) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= size || yi >= size) return;
    const i = (yi * size + xi) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };

  const fillRect = (x, y, w, h, r, g, b) => {
    const x0 = Math.floor(x * s);
    const y0 = Math.floor(y * s);
    const x1 = Math.ceil((x + w) * s);
    const y1 = Math.ceil((y + h) * s);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) set(xx, yy, r, g, b);
    }
  };

  // transparent background (PWA maskable 用に周囲は透過→後で安全マージン塗りも可)
  // maskable: 塗りつぶし背景を本体色に寄せる
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 0x10;
    px[i + 1] = 0x12;
    px[i + 2] = 0x18;
    px[i + 3] = 255;
  }

  // rounded look is approximate (rects only) — matches favicon geometry
  fillRect(2, 3, 28, 26, 0x8b, 0x1d, 0x2c); // shell
  fillRect(5, 4, 22, 2, 0x6a, 0x13, 0x1f); // rib
  fillRect(4, 8, 24, 14, 0xec, 0xe5, 0xd3); // label ivory
  fillRect(6, 10, 20, 10, 0xff, 0xff, 0xff); // label white
  // H path: M12 12h2v2h4v-2h2v6h-2v-2h-4v2h-2z
  fillRect(12, 12, 2, 6, 0x8b, 0x1d, 0x2c);
  fillRect(18, 12, 2, 6, 0x8b, 0x1d, 0x2c);
  fillRect(14, 14, 4, 2, 0x8b, 0x1d, 0x2c);
  fillRect(23, 5, 4, 3, 0x00, 0xe5, 0xff); // cyan block
  fillRect(20, 2, 3, 3, 0xff, 0x70, 0x43); // orange block
  fillRect(6, 27, 20, 2, 0xe5, 0xb8, 0x3b); // gold connector

  return px;
}

/** @param {Uint8Array} rgba @param {number} size */
function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(raw, row + 1);
  }
  const compressed = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([typeBuf, data])) : crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** @param {Buffer} buf */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

// Node zlib may not expose crc32 on all versions — always use local
function encodePngSafe(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
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
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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

fs.mkdirSync(outDir, { recursive: true });
for (const size of [180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  const png = encodePngSafe(renderIcon(size), size);
  const out = path.join(outDir, name);
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}
