import { NES_PALETTE } from "./palette.js";
import type { Mirroring } from "./ines.js";

export interface PpuBus {
  ppuRead(addr: number): number;
  ppuWrite(addr: number, value: number): void;
  /**
   * 可視スキャンライン1本ごとに呼ばれる（MMC3等、スキャンラインIRQカウンタを持つ
   * マッパー向け）。実装しないテストダブル等のために任意項目とする。
   */
  notifyScanline?(renderingEnabled: boolean): void;
}

/**
 * Ricoh 2C02 (PPU) の簡易実装。
 * 背景（M1）とスプライト（M4、8x8固定・1ライン8枚制限・スプライト0ヒット対応）を描画する。
 * スキャンライン単位でまとめて描画する簡易レンダラー（サイクル精度のフェッチ順は再現しない）。
 * PPUSCROLL（$2005）によるスクロールに対応するが、「1スキャンラインごとにその時点の
 * スクロール値をラッチして適用する」簡略モデル（実機のloopy v/t/x/wレジスタのような
 * ドット単位の厳密な再現はしない）。フレーム内で複数回$2005を書き換える構成
 * （ステータスバー分割等）はスキャンライン境界でなら追従できるが、1スキャンライン内で
 * の書き換えには対応しない。
 */
export class Ppu2C02 {
  ctrl = 0;
  mask = 0;
  status = 0;
  oamAddr = 0;
  readonly oam = new Uint8Array(256);

  private readonly nametables = new Uint8Array(2048);
  private readonly paletteRam = new Uint8Array(32);

  // $2005(PPUSCROLL)と$2006(PPUADDR)は実機同様1つの書き込みトグルを共有する
  // （以前は別々のフィールドだったが、$2005を実装するにあたり実機仕様に合わせて統合した）。
  private writeToggle: 0 | 1 = 0;
  private vramAddr = 0;
  private dataBuffer = 0;
  private scrollX = 0;
  private scrollY = 0;

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
    this.writeToggle = 0;
    this.vramAddr = 0;
    this.dataBuffer = 0;
    this.scrollX = 0;
    this.scrollY = 0;
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
        this.writeToggle = 0;
        return value;
      }
      case 0x2004:
        return this.oam[this.oamAddr] ?? 0;
      case 0x2007: {
        let data = this.dataBuffer;
        this.dataBuffer = this.ppuMemRead(this.vramAddr);
        if (this.vramAddr >= 0x3f00) {
          data = this.dataBuffer;
        }
        this.vramAddr = (this.vramAddr + this.vramIncrement()) & 0x3fff;
        return data;
      }
      default:
        return 0;
    }
  }

  cpuWrite(addr: number, value: number): void {
    const v = value & 0xff;
    switch (addr & 0x2007) {
      case 0x2000:
        this.ctrl = v;
        return;
      case 0x2001:
        this.mask = v;
        return;
      case 0x2003:
        this.oamAddr = v;
        return;
      case 0x2004:
        this.oam[this.oamAddr] = v;
        this.oamAddr = (this.oamAddr + 1) & 0xff;
        return;
      case 0x2005:
        if (this.writeToggle === 0) {
          this.scrollX = v;
          this.writeToggle = 1;
        } else {
          this.scrollY = v;
          this.writeToggle = 0;
        }
        return;
      case 0x2006:
        if (this.writeToggle === 0) {
          this.vramAddr = ((v & 0x3f) << 8) | (this.vramAddr & 0x00ff);
          this.writeToggle = 1;
        } else {
          this.vramAddr = (this.vramAddr & 0xff00) | v;
          this.writeToggle = 0;
        }
        return;
      case 0x2007:
        this.ppuMemWrite(this.vramAddr, v);
        this.vramAddr = (this.vramAddr + this.vramIncrement()) & 0x3fff;
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

  /** PPUを1ドット分進める。 */
  tickOne(): void {
    if (this.scanline >= 0 && this.scanline < 240 && this.cycle === 1) {
      this.renderScanline(this.scanline);
      const renderingEnabled = (this.mask & 0x18) !== 0;
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

  private renderScanline(y: number): void {
    const bgEnabled = (this.mask & 0x08) !== 0;
    const spritesEnabled = (this.mask & 0x10) !== 0;
    const backdrop = (this.paletteRam[0] ?? 0) & 0x3f;

    // bgPixelValue: そのピクセルの背景パターン生値(0=透明/backdrop, 1-3=不透明)。スプライトの優先度判定に使う。
    const bgPixelValue = new Uint8Array(256);
    const colorIndex = new Uint8Array(256).fill(backdrop);

    if (bgEnabled) {
      this.computeBackgroundRow(y, bgPixelValue, colorIndex);
    }
    if (spritesEnabled) {
      this.compositeSpritesRow(y, bgPixelValue, colorIndex);
    }

    for (let x = 0; x < 256; x++) {
      const rgb = NES_PALETTE[(colorIndex[x] ?? backdrop) & 0x3f] ?? 0;
      this.setPixel(x, y, rgb);
    }
  }

  /**
   * $2000-$2FFFの4枚のネームテーブルを、水平2枚×垂直2枚の仮想512x480プレーンとして
   * scrollX/scrollYぶんオフセットして読み出す（実機のスクロールによる折り返しと同じ見え方
   * になる）。実際にどの物理バンクに書き込まれているかはnametableMirror()が別途解決する。
   */
  private computeBackgroundRow(y: number, bgPixelValue: Uint8Array, colorIndex: Uint8Array): void {
    const bgPatternBase = this.ctrl & 0x10 ? 0x1000 : 0x0000;
    const ntSelect = this.ctrl & 0x03;
    const baseHorizBit = ntSelect & 1;
    const baseVertBit = (ntSelect >> 1) & 1;

    const effectiveY = y + this.scrollY;
    const vertFlip = Math.floor(effectiveY / 240) % 2;
    const localY = effectiveY % 240;
    const tileRow = localY >> 3;
    const fineY = localY & 7;

    for (let x = 0; x < 256; x++) {
      const effectiveX = (x + this.scrollX) & 0x1ff; // 0-511（2枚ぶんの仮想幅で折り返す）
      const horizFlip = effectiveX >= 256 ? 1 : 0;
      const localX = effectiveX & 0xff;
      const tileCol = localX >> 3;
      const fineX = localX & 7;

      const finalHorizBit = baseHorizBit ^ horizFlip;
      const finalVertBit = baseVertBit ^ vertFlip;
      const baseNametable = 0x2000 + (finalVertBit * 2 + finalHorizBit) * 0x400;

      const ntAddr = baseNametable + tileRow * 32 + tileCol;
      const tileIndex = this.ppuMemRead(ntAddr);

      const attrAddr = baseNametable + 0x3c0 + Math.floor(tileRow / 4) * 8 + Math.floor(tileCol / 4);
      const attrByte = this.ppuMemRead(attrAddr);
      const row2 = tileRow % 4 >= 2 ? 1 : 0;
      const col2 = tileCol % 4 >= 2 ? 1 : 0;
      const shift = row2 * 4 + col2 * 2;
      const paletteGroup = (attrByte >> shift) & 0x03;

      const patternAddr = bgPatternBase + tileIndex * 16 + fineY;
      const lo = this.ppuMemRead(patternAddr);
      const hi = this.ppuMemRead(patternAddr + 8);
      const bit = 7 - fineX;
      const pixelValue = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);

      bgPixelValue[x] = pixelValue;
      if (pixelValue !== 0) {
        colorIndex[x] = (this.paletteRam[paletteGroup * 4 + pixelValue] ?? 0) & 0x3f;
      }
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
