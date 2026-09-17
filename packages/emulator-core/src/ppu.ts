import { NES_PALETTE } from "./palette.js";
import type { Mirroring } from "./ines.js";

export interface PpuBus {
  ppuRead(addr: number): number;
  ppuWrite(addr: number, value: number): void;
  /**
   * 背景・スプライトのパターンテーブルフェッチ（$0000-$1FFF）のたびに、そのアドレスの
   * bit12を通知する（MMC3等、PPU A12エッジ検出でスキャンラインIRQカウンタを駆動する
   * マッパー向け）。ネームテーブル/属性テーブルフェッチは常にbit12=0のため通知しない。
   * 実装しないテストダブル等のために任意項目とする。
   */
  ppuA12?(bit12: 0 | 1): void;
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
 * 背景とスプライト（8x8/8x16・1ライン8枚制限・スプライト0ヒット対応）を描画する。
 * スクロールは実機同様のloopy v/t/x/wレジスタ（上記の`increment*`/`transfer*`参照）で管理する。
 * 背景はPhase 2で導入した真のドット単位フェッチ/シフトレジスタパイプライン
 * （`bgFetchStep`/`shiftBackgroundRegisters`/`sampleBackgroundPixel`）で描画するため、
 * フレーム内で`$2005`/`$2006`をミッドスキャンラインで書き換えれば即座に以降のピクセルへ
 * 反映される（ステータスバー分割等のラスタートリックに対応）。スプライトもPhase 3で
 * 二次OAM評価(dot 65)・パターンフェッチ(dot 257-320)・出力(dot 1-256、`compositeAndSetPixel`)
 * のドット単位パイプラインへ置き換え済み。8x16モード（Phase 5、`fetchSpritePattern`参照）は
 * タイル番号のbit0でパターンテーブルを選択し、垂直反転時は上下のタイル自体も入れ替わる。
 * 背景・スプライトのパターンテーブルフェッチのたびに、そのアドレスのbit12を`PpuBus.ppuA12`
 * 経由でマッパーへ通知する（Phase 4、MMC3等のA12エッジ駆動IRQカウンタ向け）。
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
  // 同じdotでスプライト合成・framebuffer書き込みに使う）。
  private readonly rowBgPixelValue = new Uint8Array(256);
  private readonly rowColorIndex = new Uint8Array(256);

  // --- スプライト評価/フェッチパイプライン（Phase 3） ---
  // 二次OAM: dot 65でこのスキャンラインの間に「次のスキャンライン」向けに一括評価する
  // （タイミング精度が意味を持つのはフェッチ側=A12エッジのため、評価自体は1回でまとめてよい）。
  private secondaryCount = 0;
  private readonly secondaryY = new Uint8Array(8);
  private readonly secondaryTile = new Uint8Array(8);
  private readonly secondaryAttr = new Uint8Array(8);
  private readonly secondaryX = new Uint8Array(8);
  private readonly secondaryIsZero = new Uint8Array(8);
  // スプライト出力レジスタ: dot 257-320で二次OAMから確定・フェッチし、次スキャンラインの
  // dot 1-256の出力に使う。インデックスが小さいほど優先度が高い（実機のOAM順）。
  private spriteCount = 0;
  private readonly spriteX = new Uint8Array(8);
  private readonly spriteAttr = new Uint8Array(8);
  private readonly spriteIsZero = new Uint8Array(8);
  private readonly spritePatternLo = new Uint8Array(8);
  private readonly spritePatternHi = new Uint8Array(8);

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
    this.secondaryCount = 0;
    this.secondaryY.fill(0xff);
    this.secondaryTile.fill(0);
    this.secondaryAttr.fill(0);
    this.secondaryX.fill(0xff);
    this.secondaryIsZero.fill(0);
    this.spriteCount = 0;
    this.spriteX.fill(0xff);
    this.spriteAttr.fill(0);
    this.spriteIsZero.fill(0);
    this.spritePatternLo.fill(0);
    this.spritePatternHi.fill(0);
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
   * スプライトもdot 65で次スキャンライン向けの二次OAM評価、dot 257-320でパターンフェッチ、
   * dot 1-256で背景との合成・framebuffer書き込みを行うドット単位パイプラインで動作する。
   */
  tickOne(): void {
    const renderingEnabled = (this.mask & 0x18) !== 0;
    const bgEnabled = (this.mask & 0x08) !== 0;
    const spritesEnabled = (this.mask & 0x10) !== 0;
    const isRenderingLine = (this.scanline >= 0 && this.scanline < 240) || this.scanline === -1;
    const isVisibleLine = this.scanline >= 0 && this.scanline < 240;
    const inFetchWindow = (this.cycle >= 1 && this.cycle <= 256) || (this.cycle >= 321 && this.cycle <= 336);

    // サンプリングは常にシフト/フェッチより先（このdotのシフトレジスタが「まだシフトされて
    // いない」状態を使う）。背景・スプライトの合成とframebuffer書き込みも同じdotで行う。
    if (isVisibleLine && this.cycle >= 1 && this.cycle <= 256) {
      const x = this.cycle - 1;
      this.sampleBackgroundPixel(x, bgEnabled);
      this.compositeAndSetPixel(x, this.scanline, spritesEnabled);
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
      if (this.cycle === 65) this.evaluateSprites();
      if (this.cycle === 257) this.commitSpriteOutputRegisters();
      if (this.cycle >= 257 && this.cycle <= 320 && (this.cycle - 257) % 8 === 0) {
        this.fetchSpritePattern((this.cycle - 257) / 8);
      }
      if (this.cycle === 256) this.v = incrementY(this.v);
      if (this.cycle === 257) this.v = transferHorizontal(this.v, this.t);
      if (this.scanline === -1 && this.cycle === 280) this.v = transferVertical(this.v, this.t);
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
      const addr = bgPatternBase + this.ntLatch * 16 + fineY;
      this.ptLowLatch = this.ppuMemRead(addr);
      this.bus.ppuA12?.(((addr >> 12) & 1) as 0 | 1);
    } else if (phase === 7) {
      const bgPatternBase = this.ctrl & 0x10 ? 0x1000 : 0x0000;
      const fineY = (this.v >> 12) & 0x07;
      const addr = bgPatternBase + this.ntLatch * 16 + fineY + 8;
      this.ptHighLatch = this.ppuMemRead(addr);
      this.bus.ppuA12?.(((addr >> 12) & 1) as 0 | 1);
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

  /**
   * dot 65: 「次のスキャンライン」向けの二次OAM評価。1スキャンラインあたり最大8枚
   * （実機の制限。9枚目以降の在圏ヒットで`status`のoverflowビット(bit5)を立てる）。
   * 実機の「対角読み出しバグ」までは再現しない、評価件数ベースの素朴な実装
   * （ホームブリュー向けであり、バグに依存するROMは対象外という既存方針と一貫）。
   */
  private evaluateSprites(): void {
    const nextScanline = this.scanline + 1;
    const spriteHeight = this.ctrl & 0x20 ? 16 : 8; // 8x16モード（Phase 5、fetchSpritePattern参照）
    this.secondaryCount = 0;
    let overflow = false;
    for (let i = 0; i < 64; i++) {
      const base = i * 4;
      const oamY = this.oam[base] ?? 0xff;
      const row = nextScanline - (oamY + 1);
      if (row < 0 || row >= spriteHeight) continue;
      if (this.secondaryCount < 8) {
        const slot = this.secondaryCount;
        this.secondaryY[slot] = oamY;
        this.secondaryTile[slot] = this.oam[base + 1] ?? 0;
        this.secondaryAttr[slot] = this.oam[base + 2] ?? 0;
        this.secondaryX[slot] = this.oam[base + 3] ?? 0;
        this.secondaryIsZero[slot] = i === 0 ? 1 : 0;
        this.secondaryCount++;
      } else {
        overflow = true;
      }
    }
    if (overflow) this.status |= 0x20;
  }

  /** dot 257: 直前のdot65評価結果をスプライト出力レジスタへ確定コピーする（次スキャンラインの出力用）。 */
  private commitSpriteOutputRegisters(): void {
    this.spriteCount = this.secondaryCount;
    for (let i = 0; i < 8; i++) {
      this.spriteX[i] = this.secondaryX[i] ?? 0xff;
      this.spriteAttr[i] = this.secondaryAttr[i] ?? 0;
      this.spriteIsZero[i] = this.secondaryIsZero[i] ?? 0;
    }
  }

  /**
   * dot 257,265,...,313: 二次OAMスロット`slot`のパターンバイト(下位/上位)をフェッチする。
   * 実機は未使用スロット（このスキャンラインに実際のスプライトが無い分）もタイル$FFとして
   * 同じ8dot周期でフェッチし続ける（出力には使われないが、Phase 4のA12エッジ駆動MMC3 IRQは
   * この「スプライトが少ない/皆無でも8回分のCHRフェッチが必ず起きる」性質に依存するため、
   * ここで実際に`ppuMemRead`を呼んでおく必要がある）。
   * 8x16モード（`ctrl`bit5）では、パターンテーブルの選択自体がタイル番号のbit0で決まり
   * （`ctrl`bit3は無視される）、上半分=タイル番号&0xFE・下半分=その次の番号を使う。
   * 垂直反転時は上下の行順だけでなく、上半分/下半分のタイル自体も入れ替わる（実機どおり）。
   */
  private fetchSpritePattern(slot: number): void {
    const spriteHeight = this.ctrl & 0x20 ? 16 : 8;
    const used = slot < this.secondaryCount;
    const nextScanline = this.scanline + 1;
    const oamY = used ? (this.secondaryY[slot] ?? 0xff) : 0xff;
    let row = used ? nextScanline - (oamY + 1) : 0;
    const flipV = used && ((this.secondaryAttr[slot] ?? 0) & 0x80) !== 0;
    if (flipV) row = spriteHeight - 1 - row;
    const tileIndex = used ? (this.secondaryTile[slot] ?? 0) : 0xff;

    let patternAddr: number;
    if (spriteHeight === 16) {
      const patternTable = tileIndex & 0x01 ? 0x1000 : 0x0000;
      const tileBase = tileIndex & 0xfe;
      const tile = row < 8 ? tileBase : tileBase + 1;
      patternAddr = patternTable + tile * 16 + (row & 0x07);
    } else {
      const spritePatternBase = this.ctrl & 0x08 ? 0x1000 : 0x0000;
      patternAddr = spritePatternBase + tileIndex * 16 + row;
    }

    const lo = this.ppuMemRead(patternAddr);
    this.bus.ppuA12?.(((patternAddr >> 12) & 1) as 0 | 1);
    const hi = this.ppuMemRead(patternAddr + 8);
    this.bus.ppuA12?.((((patternAddr + 8) >> 12) & 1) as 0 | 1);
    this.spritePatternLo[slot] = used ? lo : 0;
    this.spritePatternHi[slot] = used ? hi : 0;
  }

  /** スプライト出力レジスタのスロット`slot`について、画面X座標`x`でのピクセル生値(0=透明)を返す。 */
  private spritePixelValueAt(slot: number, x: number): number {
    const spriteX = this.spriteX[slot] ?? 0xff;
    const col = x - spriteX;
    if (col < 0 || col >= 8) return 0;
    const attr = this.spriteAttr[slot] ?? 0;
    const flipH = (attr & 0x40) !== 0;
    const bit = flipH ? col : 7 - col;
    const lo = this.spritePatternLo[slot] ?? 0;
    const hi = this.spritePatternHi[slot] ?? 0;
    return (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
  }

  /**
   * 背景ピクセル(既にsampleBackgroundPixelでrowBgPixelValue/rowColorIndexへ書き込み済み)と
   * スプライト出力レジスタを合成し、このdotのframebufferピクセルを確定する。
   * - OAMインデックスが小さいスプライトほど手前（スロット0から順に探し、最初の不透明画素で確定）
   * - 属性バイトのbit5（背景優先）が立っている場合、不透明な背景の上には描画しない
   * - スプライト0ヒット判定は、実際に描画されるかどうかとは独立に行う（実機どおり）
   */
  private compositeAndSetPixel(x: number, y: number, spritesEnabled: boolean): void {
    const backdrop = (this.paletteRam[0] ?? 0) & 0x3f;
    const bgPixelValue = this.rowBgPixelValue[x] ?? 0;
    let colorIndex = bgPixelValue === 0 ? backdrop : (this.rowColorIndex[x] ?? backdrop);

    if (spritesEnabled) {
      if (this.spriteCount > 0 && this.spriteIsZero[0] === 1 && bgPixelValue !== 0) {
        if (this.spritePixelValueAt(0, x) !== 0) this.status |= 0x40;
      }
      for (let i = 0; i < this.spriteCount; i++) {
        const pixelValue = this.spritePixelValueAt(i, x);
        if (pixelValue === 0) continue;
        const attr = this.spriteAttr[i] ?? 0;
        const behindBg = (attr & 0x20) !== 0;
        if (!(behindBg && bgPixelValue !== 0)) {
          const paletteGroup = attr & 0x03;
          colorIndex = (this.paletteRam[0x10 + paletteGroup * 4 + pixelValue] ?? 0) & 0x3f;
        }
        break; // 手前のスプライトが確定した時点で、それより奥のスプライトは無視（実機どおり）
      }
    }

    const rgb = NES_PALETTE[colorIndex & 0x3f] ?? 0;
    this.setPixel(x, y, rgb);
  }

  private setPixel(x: number, y: number, rgb: number): void {
    const idx = (y * 256 + x) * 4;
    this.framebuffer[idx] = (rgb >> 16) & 0xff;
    this.framebuffer[idx + 1] = (rgb >> 8) & 0xff;
    this.framebuffer[idx + 2] = rgb & 0xff;
    this.framebuffer[idx + 3] = 255;
  }
}
