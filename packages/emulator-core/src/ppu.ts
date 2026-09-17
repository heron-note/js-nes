import { NES_PALETTE } from "./palette.js";
import type { Mirroring } from "./ines.js";

export interface PpuBus {
  ppuRead(addr: number): number;
  ppuWrite(addr: number, value: number): void;
  /**
   * 可視スキャンライン1本ごとに呼ばれる（MMC3等、スキャンラインIRQカウンタを持つ
   * マッパー向け）。実装しないテストダブル等のために任意項目とする。
   * Phase 4でPPU A12エッジ駆動の`ppuA12`に置き換え予定（PPUのドット精度化プロジェクト参照）。
   */
  notifyScanline?(renderingEnabled: boolean): void;
}

/**
 * loopy v/t レジスタ内のビット位置（実機2C02のPPUADDRレジスタレイアウト:
 * 0yyy NNYY YYYX XXXX ― yyy=fine Y(12-14), NN=ネームテーブル選択(10-11),
 * YYYYY=coarse Y(5-9), XXXXX=coarse X(0-4)）。
 */
const COARSE_X_MASK = 0x001f;
const HORIZ_NAMETABLE_BIT = 0x0400;
const VERT_NAMETABLE_BIT = 0x0800;
const COARSE_Y_MASK = 0x03e0;
const FINE_Y_MASK = 0x7000;
const HORIZ_COPY_MASK = 0x041f; // coarse X + 水平ネームテーブルビット
const VERT_COPY_MASK = 0x7be0; // fine Y + coarse Y + 垂直ネームテーブルビット

/** dot 8,16,...ごとのcoarse Xインクリメント。31で0へラップし水平ネームテーブルを反転する。 */
export function incrementCoarseX(v: number): number {
  if ((v & COARSE_X_MASK) === COARSE_X_MASK) {
    v &= ~COARSE_X_MASK;
    v ^= HORIZ_NAMETABLE_BIT;
  } else {
    v += 1;
  }
  return v;
}

/** dot 256ごとのYインクリメント（fine Y→coarse Yの繰り上げ、coarse Y=29でネームテーブル反転）。 */
export function incrementY(v: number): number {
  if ((v & FINE_Y_MASK) !== FINE_Y_MASK) {
    return v + 0x1000;
  }
  v &= ~FINE_Y_MASK;
  let y = (v & COARSE_Y_MASK) >> 5;
  if (y === 29) {
    y = 0;
    v ^= VERT_NAMETABLE_BIT;
  } else if (y === 31) {
    // アトリビュートテーブル領域まで来た場合の実機挙動: ネームテーブルは反転せずコピー
    y = 0;
  } else {
    y += 1;
  }
  return (v & ~COARSE_Y_MASK) | (y << 5);
}

/** dot 257: 水平方向のスクロール位置(coarse X + 水平ネームテーブルビット)をtからvへコピーする。 */
export function transferHorizontal(v: number, t: number): number {
  return (v & ~HORIZ_COPY_MASK) | (t & HORIZ_COPY_MASK);
}

/** pre-renderラインのdot 280-304: 垂直方向のスクロール位置をtからvへコピーする。 */
export function transferVertical(v: number, t: number): number {
  return (v & ~VERT_COPY_MASK) | (t & VERT_COPY_MASK);
}

/**
 * Ricoh 2C02 (PPU) の実装。
 * 背景とスプライト（8x8固定・1ライン8枚制限・スプライト0ヒット対応）を描画する。
 * スクロールは実機同様のloopy v/t/x/wレジスタ（上記の`increment*`/`transfer*`参照）で管理する。
 * 背景はPhase 2で導入した真のドット単位フェッチ/シフトレジスタパイプライン
 * （`bgFetchStep`/`shiftBackgroundRegisters`/`sampleBackgroundPixel`）で描画するため、
 * フレーム内で`$2005`/`$2006`をミッドスキャンラインで書き換えれば即座に以降のピクセルへ
 * 反映される（ステータスバー分割等のラスタートリックに対応）。スプライトは引き続き
 * スキャンライン単位のバッチ合成（`compositeSpritesRow`、Phase 3で対応予定）。
 * PPUのドット精度化プロジェクト: C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md
 */
export class Ppu2C02 {
  ctrl = 0;
  mask = 0;
  status = 0;
  oamAddr = 0;
  readonly oam = new Uint8Array(256);

  private readonly nametables = new Uint8Array(2048);
  private readonly paletteRam = new Uint8Array(32);

  // $2005(PPUSCROLL)と$2006(PPUADDR)は実機同様1つの書き込みトグル(w)を共有する。
  // v/t/x/wは実機のloopyレジスタと同じ役割（このファイル先頭のincrementCoarseX等参照）。
  private w: 0 | 1 = 0;
  private v = 0;
  private t = 0;
  private fineX = 0;
  private dataBuffer = 0;

  // --- 背景フェッチ/シフトレジスタパイプライン（Phase 2） ---
  private ntLatch = 0;
  private atLatch = 0;
  private ptLowLatch = 0;
  private ptHighLatch = 0;
  private nextPaletteBits = 0;
  private bgPatternLoShift = 0;
  private bgPatternHiShift = 0;
  private bgAttribLoShift = 0;
  private bgAttribHiShift = 0;
  // このスキャンライン分の背景ピクセル生値/パレット解決済み色（ドット単位で埋めていき、
  // スキャンライン末尾でスプライト合成・framebuffer書き込みに使う）。
  private readonly rowBgPixelValue = new Uint8Array(256);
  private readonly rowColorIndex = new Uint8Array(256);

  scanline = -1;
  cycle = 0;
  frameComplete = false;
  nmiRequested = false;

  /** 256x240 RGBA フレームバッファ */
  readonly framebuffer = new Uint8ClampedArray(256 * 240 * 4);

  constructor(
    private readonly bus: PpuBus,
    private readonly getMirroring: () => Mirroring,
  ) {}

  reset(): void {
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.oamAddr = 0;
    this.w = 0;
    this.v = 0;
    this.t = 0;
    this.fineX = 0;
    this.dataBuffer = 0;
    this.ntLatch = 0;
    this.atLatch = 0;
    this.ptLowLatch = 0;
    this.ptHighLatch = 0;
    this.nextPaletteBits = 0;
    this.bgPatternLoShift = 0;
    this.bgPatternHiShift = 0;
    this.bgAttribLoShift = 0;
    this.bgAttribHiShift = 0;
    this.rowBgPixelValue.fill(0);
    this.rowColorIndex.fill(0);
    this.scanline = -1;
    this.cycle = 0;
    this.frameComplete = false;
    this.nmiRequested = false;
    this.nametables.fill(0);
    this.paletteRam.fill(0);
    this.oam.fill(0);
    this.framebuffer.fill(0);
  }

  /** パレットRAM($3F00-$3F1F)の1バイトを読む。デバッグ・テスト・将来のツール用の補助API。 */
  getPaletteEntry(index: number): number {
    return this.paletteRam[index & 0x1f] ?? 0;
  }

  cpuRead(addr: number): number {
    switch (addr & 0x2007) {
      case 0x2002: {
        const value = (this.status & 0xe0) | (this.dataBuffer & 0x1f);
        this.status &= ~0x80 & 0xff;
        this.w = 0;
        return value;
      }
      case 0x2004:
        return this.oam[this.oamAddr] ?? 0;
      case 0x2007: {
        let data = this.dataBuffer;
        this.dataBuffer = this.ppuMemRead(this.v);
        if (this.v >= 0x3f00) {
          data = this.dataBuffer;
        }
        this.v = (this.v + this.vramIncrement()) & 0x7fff;
        return data;
      }
      default:
        return 0;
    }
  }

  cpuWrite(addr: number, value: number): void {
    const byte = value & 0xff;
    switch (addr & 0x2007) {
      case 0x2000:
        this.ctrl = byte;
        this.t = (this.t & 0xf3ff) | ((byte & 0x03) << 10);
        return;
      case 0x2001:
        this.mask = byte;
        return;
      case 0x2003:
        this.oamAddr = byte;
        return;
      case 0x2004:
        this.oam[this.oamAddr] = byte;
        this.oamAddr = (this.oamAddr + 1) & 0xff;
        return;
      case 0x2005:
        if (this.w === 0) {
          this.t = (this.t & 0xffe0) | (byte >> 3);
          this.fineX = byte & 0x07;
          this.w = 1;
        } else {
          this.t = (this.t & 0x8fff) | ((byte & 0x07) << 12);
          this.t = (this.t & 0xfc1f) | ((byte & 0xf8) << 2);
          this.w = 0;
        }
        return;
      case 0x2006:
        if (this.w === 0) {
          this.t = (this.t & 0x00ff) | ((byte & 0x3f) << 8);
          this.w = 1;
        } else {
          this.t = (this.t & 0xff00) | byte;
          this.v = this.t;
          this.w = 0;
        }
        return;
      case 0x2007:
        this.ppuMemWrite(this.v, byte);
        this.v = (this.v + this.vramIncrement()) & 0x7fff;
        return;
      default:
        return;
    }
  }

  private vramIncrement(): number {
    return this.ctrl & 0x04 ? 32 : 1;
  }

  private nametableMirror(addr: number): number {
    const a = addr & 0x0fff;
    const table = Math.floor(a / 0x400);
    const offset = a % 0x400;
    let physicalTable: number;
    switch (this.getMirroring()) {
      case "horizontal":
        physicalTable = table < 2 ? 0 : 1;
        break;
      case "vertical":
        physicalTable = table % 2;
        break;
      case "single-screen-a":
        physicalTable = 0;
        break;
      case "single-screen-b":
        physicalTable = 1;
        break;
      case "four-screen":
        // TODO: 本来は4枚分(4KB)の独立ネームテーブルRAMが必要。対応予定のマッパーでは
        // 実質未使用のため、当面はverticalにフォールバックする。
        physicalTable = table % 2;
        break;
    }
    return physicalTable * 0x400 + offset;
  }

  private ppuMemRead(addr: number): number {
    const a = addr & 0x3fff;
    if (a < 0x2000) {
      return this.bus.ppuRead(a);
    }
    if (a < 0x3f00) {
      return this.nametables[this.nametableMirror(a)] ?? 0;
    }
    let pi = a & 0x1f;
    if (pi === 0x10 || pi === 0x14 || pi === 0x18 || pi === 0x1c) pi -= 0x10;
    return this.paletteRam[pi] ?? 0;
  }

  private ppuMemWrite(addr: number, value: number): void {
    const a = addr & 0x3fff;
    if (a < 0x2000) {
      this.bus.ppuWrite(a, value);
      return;
    }
    if (a < 0x3f00) {
      this.nametables[this.nametableMirror(a)] = value;
      return;
    }
    let pi = a & 0x1f;
    if (pi === 0x10 || pi === 0x14 || pi === 0x18 || pi === 0x1c) pi -= 0x10;
    this.paletteRam[pi] = value & 0x3f;
  }

  /**
   * PPUを1ドット分進める。背景は真のドット単位フェッチ/シフトレジスタパイプライン
   * （dot 1-256・321-336でのNT/AT/パターンバイトフェッチ、毎dotのシフト、dot 1-256での
   * 1ピクセルずつのサンプリング）で描画するため、フレーム内で`$2005`/`$2006`/`$2000`を
   * ミッドスキャンラインで書き換えれば、以降のdotのフェッチ・サンプルへ即座に反映される。
   * スプライトは引き続きスキャンライン単位のバッチ合成（Phase 3で対応予定）。
   */
  tickOne(): void {
    const renderingEnabled = (this.mask & 0x18) !== 0;
    const bgEnabled = (this.mask & 0x08) !== 0;
    const spritesEnabled = (this.mask & 0x10) !== 0;
    const isRenderingLine = (this.scanline >= 0 && this.scanline < 240) || this.scanline === -1;
    const isVisibleLine = this.scanline >= 0 && this.scanline < 240;
    const inFetchWindow = (this.cycle >= 1 && this.cycle <= 256) || (this.cycle >= 321 && this.cycle <= 336);

    // サンプリングは常にシフト/フェッチより先（このdotのシフトレジスタが「まだシフトされて
    // いない」状態を使う）。
    if (isVisibleLine && this.cycle >= 1 && this.cycle <= 256) {
      this.sampleBackgroundPixel(this.cycle - 1, bgEnabled);
    }

    if (isRenderingLine && renderingEnabled && inFetchWindow) {
      this.bgFetchStep();
      this.shiftBackgroundRegisters();
      if (this.cycle % 8 === 0) {
        this.reloadBgShiftRegisters();
        this.v = incrementCoarseX(this.v);
      }
    }
    if (isRenderingLine && renderingEnabled) {
      if (this.cycle === 256) this.v = incrementY(this.v);
      if (this.cycle === 257) this.v = transferHorizontal(this.v, this.t);
      if (this.scanline === -1 && this.cycle === 280) this.v = transferVertical(this.v, this.t);
    }

    if (isVisibleLine && this.cycle === 256) {
      this.finishScanline(this.scanline, spritesEnabled);
      this.bus.notifyScanline?.(renderingEnabled);
    }
    if (this.scanline === 241 && this.cycle === 1) {
      this.status |= 0x80;
      if (this.ctrl & 0x80) this.nmiRequested = true;
    }
    if (this.scanline === -1 && this.cycle === 1) {
      this.status &= ~0x80 & 0xff;
      this.status &= ~0x40 & 0xff;
      this.status &= ~0x20 & 0xff;
    }

    this.cycle++;
    if (this.cycle > 340) {
      this.cycle = 0;
      this.scanline++;
      if (this.scanline > 260) {
        this.scanline = -1;
        this.frameComplete = true;
      }
    }
  }

  /** dot%8===1,3,5,7でNT/AT/パターン下位/パターン上位バイトを順にフェッチしラッチする。 */
  private bgFetchStep(): void {
    const phase = this.cycle % 8;
    if (phase === 1) {
      this.ntLatch = this.ppuMemRead(0x2000 | (this.v & 0x0fff));
    } else if (phase === 3) {
      const attrAddr = 0x23c0 | (this.v & 0x0c00) | ((this.v >> 4) & 0x38) | ((this.v >> 2) & 0x07);
      this.atLatch = this.ppuMemRead(attrAddr);
      const shift = ((this.v >> 4) & 4) | (this.v & 2);
      this.nextPaletteBits = (this.atLatch >> shift) & 0x03;
    } else if (phase === 5) {
      const bgPatternBase = this.ctrl & 0x10 ? 0x1000 : 0x0000;
      const fineY = (this.v >> 12) & 0x07;
      this.ptLowLatch = this.ppuMemRead(bgPatternBase + this.ntLatch * 16 + fineY);
    } else if (phase === 7) {
      const bgPatternBase = this.ctrl & 0x10 ? 0x1000 : 0x0000;
      const fineY = (this.v >> 12) & 0x07;
      this.ptHighLatch = this.ppuMemRead(bgPatternBase + this.ntLatch * 16 + fineY + 8);
    }
  }

  /** dot%8===0で、直前にフェッチし終えた1タイル分をシフトレジスタの下位バイトへ読み込む。 */
  private reloadBgShiftRegisters(): void {
    this.bgPatternLoShift = (this.bgPatternLoShift & 0xff00) | this.ptLowLatch;
    this.bgPatternHiShift = (this.bgPatternHiShift & 0xff00) | this.ptHighLatch;
    this.bgAttribLoShift = (this.bgAttribLoShift & 0xff00) | (this.nextPaletteBits & 1 ? 0xff : 0x00);
    this.bgAttribHiShift = (this.bgAttribHiShift & 0xff00) | (this.nextPaletteBits & 2 ? 0xff : 0x00);
  }

  private shiftBackgroundRegisters(): void {
    this.bgPatternLoShift = (this.bgPatternLoShift << 1) & 0xffff;
    this.bgPatternHiShift = (this.bgPatternHiShift << 1) & 0xffff;
    this.bgAttribLoShift = (this.bgAttribLoShift << 1) & 0xffff;
    this.bgAttribHiShift = (this.bgAttribHiShift << 1) & 0xffff;
  }

  /** fine X(this.fineX)ぶんシフトレジスタの上位側から1ピクセル抽出し、rowBgPixelValue/rowColorIndexへ書く。 */
  private sampleBackgroundPixel(x: number, bgEnabled: boolean): void {
    if (!bgEnabled) {
      this.rowBgPixelValue[x] = 0;
      return;
    }
    const bitMask = 0x8000 >> this.fineX;
    const pixelValue =
      (((this.bgPatternHiShift & bitMask) !== 0 ? 1 : 0) << 1) | ((this.bgPatternLoShift & bitMask) !== 0 ? 1 : 0);
    this.rowBgPixelValue[x] = pixelValue;
    if (pixelValue !== 0) {
      const paletteGroup =
        (((this.bgAttribHiShift & bitMask) !== 0 ? 1 : 0) << 1) | ((this.bgAttribLoShift & bitMask) !== 0 ? 1 : 0);
      this.rowColorIndex[x] = (this.paletteRam[paletteGroup * 4 + pixelValue] ?? 0) & 0x3f;
    }
  }

  /** dot 256（このスキャンラインの256ピクセル全てサンプル済み）で、スプライト合成とframebuffer書き込みを行う。 */
  private finishScanline(y: number, spritesEnabled: boolean): void {
    const backdrop = (this.paletteRam[0] ?? 0) & 0x3f;
    const colorIndex = new Uint8Array(256);
    for (let x = 0; x < 256; x++) {
      colorIndex[x] = this.rowBgPixelValue[x] === 0 ? backdrop : (this.rowColorIndex[x] ?? backdrop);
    }
    if (spritesEnabled) {
      this.compositeSpritesRow(y, this.rowBgPixelValue, colorIndex);
    }
    for (let x = 0; x < 256; x++) {
      const rgb = NES_PALETTE[(colorIndex[x] ?? backdrop) & 0x3f] ?? 0;
      this.setPixel(x, y, rgb);
    }
  }

  /**
   * スプライト（8x8固定）を合成する。
   * - 1スキャンラインあたり最大8枚（実機の制限を再現。9枚目以降は評価を打ち切る）
   * - OAMインデックスが小さいスプライトほど手前に描画される
   * - 属性バイトのbit5（背景優先）が立っている場合、不透明な背景の上には描画しない
   * - スプライト0と不透明な背景が重なった場所でスプライト0ヒットフラグ($2002 bit6)を立てる
   */
  private compositeSpritesRow(y: number, bgPixelValue: Uint8Array, colorIndex: Uint8Array): void {
    const SPRITE_HEIGHT = 8; // 8x16モードは未対応
    const spritePatternBase = this.ctrl & 0x08 ? 0x1000 : 0x0000;
    const spriteDrawn = new Uint8Array(256);

    let evaluated = 0;
    for (let i = 0; i < 64 && evaluated < 8; i++) {
      const base = i * 4;
      const oamY = this.oam[base] ?? 0xff;
      const spriteTop = oamY + 1;
      const row = y - spriteTop;
      if (row < 0 || row >= SPRITE_HEIGHT) continue;
      evaluated++;

      const tileIndex = this.oam[base + 1] ?? 0;
      const attr = this.oam[base + 2] ?? 0;
      const spriteX = this.oam[base + 3] ?? 0;
      const flipH = (attr & 0x40) !== 0;
      const flipV = (attr & 0x80) !== 0;
      const behindBg = (attr & 0x20) !== 0;
      const paletteGroup = attr & 0x03;

      const patternRow = flipV ? SPRITE_HEIGHT - 1 - row : row;
      const patternAddr = spritePatternBase + tileIndex * 16 + patternRow;
      const lo = this.ppuMemRead(patternAddr);
      const hi = this.ppuMemRead(patternAddr + 8);

      for (let col = 0; col < 8; col++) {
        const px = spriteX + col;
        if (px > 255) continue;
        const bit = flipH ? col : 7 - col;
        const pixelValue = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
        if (pixelValue === 0) continue;

        const bgOpaque = (bgPixelValue[px] ?? 0) !== 0;
        if (i === 0 && bgOpaque) {
          this.status |= 0x40;
        }

        if (spriteDrawn[px]) continue; // 手前のスプライトが既にこの画素を描画済み
        spriteDrawn[px] = 1;

        if (behindBg && bgOpaque) continue; // 背景優先設定 かつ 背景が不透明ならスプライトは隠れる

        colorIndex[px] = (this.paletteRam[0x10 + paletteGroup * 4 + pixelValue] ?? 0) & 0x3f;
      }
    }
  }

  private setPixel(x: number, y: number, rgb: number): void {
    const idx = (y * 256 + x) * 4;
    this.framebuffer[idx] = (rgb >> 16) & 0xff;
    this.framebuffer[idx + 1] = (rgb >> 8) & 0xff;
    this.framebuffer[idx + 2] = rgb & 0xff;
    this.framebuffer[idx + 3] = 255;
  }
}
