import { describe, expect, it } from "vitest";
import { Ppu2C02, type PpuBus } from "./ppu.js";
import type { Mirroring } from "./ines.js";

/**
 * PPUのドット精度化プロジェクト Phase 2の最重要ゲート。
 * 真のドット単位背景パイプラインにより、フレーム内で$2005/$2006を書き換えれば
 * 同一フレーム内で以降のスキャンラインへ反映される（ステータスバー分割等のラスター
 * トリック）ことを検証する。加えて、$2006は書き込み2回目で即座にvへ反映されるのに対し、
 * $2005は次スキャンラインのdot257(水平コピー)まで反映されないという実機どおりの
 * タイミング差も確認する。C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md 参照。
 *
 * CPU/ROMを介さず、`Ppu2C02`を直接ドット単位で駆動する（`ppu.test.ts`と同じ手法）。
 * これにより「ちょうどスキャンラインNの先頭で書き換える」という条件をCPU命令タイミングに
 * 依存せず正確に再現できる。
 */

const TILE1 = 1;
const TILE2 = 2;
const SPLIT_ROW = 100;

function buildChr(): Uint8Array {
  const chr = new Uint8Array(0x2000);
  for (let row = 0; row < 8; row++) {
    chr[TILE1 * 16 + row] = 0xff; // タイル1: plane0全ビット1 => pixelValue=1
    chr[TILE1 * 16 + 8 + row] = 0x00;
    chr[TILE2 * 16 + row] = 0x00; // タイル2: pixelValue=2
    chr[TILE2 * 16 + 8 + row] = 0xff;
  }
  return chr;
}

function makePpu(mirroring: Mirroring = "vertical"): Ppu2C02 {
  const chr = buildChr();
  const bus: PpuBus = {
    ppuRead: (addr) => chr[addr] ?? 0,
    ppuWrite: () => {
      // CHR-ROM相当なので書き込みは無視
    },
  };
  return new Ppu2C02(bus, () => mirroring);
}

/** $2006を2回書いて指定アドレスへVRAMポインタを合わせ、$2007へ連続書き込みする。 */
function writeVram(ppu: Ppu2C02, addr: number, values: number[]): void {
  ppu.cpuWrite(0x2006, (addr >> 8) & 0xff);
  ppu.cpuWrite(0x2006, addr & 0xff);
  for (const v of values) ppu.cpuWrite(0x2007, v);
}

/** ネームテーブル960バイト+属性テーブル64バイトを、指定タイルで一様に埋める。 */
function fillNametable(ppu: Ppu2C02, base: number, tile: number): void {
  writeVram(ppu, base, new Array(960).fill(tile));
  writeVram(ppu, base + 0x3c0, new Array(64).fill(0)); // 属性は全象限パレットグループ0
}

/** ネームテーブルを、コラム0-15=tileA・コラム16-31=tileBの2分割で埋める（横方向スクロール検証用）。 */
function fillSplitColumns(ppu: Ppu2C02, base: number, tileA: number, tileB: number): void {
  const row = [...new Array(16).fill(tileA), ...new Array(16).fill(tileB)];
  const full: number[] = [];
  for (let r = 0; r < 30; r++) full.push(...row);
  writeVram(ppu, base, full);
  writeVram(ppu, base + 0x3c0, new Array(64).fill(0));
}

function setPaletteEntry(ppu: Ppu2C02, index: number, value: number): void {
  writeVram(ppu, 0x3f00 + index, [value]);
}

function tickDots(ppu: Ppu2C02, count: number): void {
  for (let i = 0; i < count; i++) ppu.tickOne();
}

/** pre-renderライン(scanline -1)を1本ぶん消化し、scanline0のcycle0まで進める。 */
function finishPreRenderLine(ppu: Ppu2C02): void {
  tickDots(ppu, 341);
}

function pixelRgb(ppu: Ppu2C02, x: number, y: number): [number, number, number] {
  const idx = (y * 256 + x) * 4;
  const fb = ppu.framebuffer;
  return [fb[idx] ?? -1, fb[idx + 1] ?? -1, fb[idx + 2] ?? -1];
}

describe("PPUのドット精度化 Phase 2: ミッドスキャンライン分割", () => {
  it("$2006の書き換えは即座にvへ反映され、書き換えたスキャンライン自身から新しい内容が見える", () => {
    const ppu = makePpu("vertical"); // table0/table2が物理バンク0、table1/table3が物理バンク1
    fillNametable(ppu, 0x2000, TILE1); // 物理バンク0 = タイル1
    fillNametable(ppu, 0x2400, TILE2); // 物理バンク1 = タイル2
    setPaletteEntry(ppu, 0, 0x01); // backdrop
    setPaletteEntry(ppu, 1, 0x21); // グループ0色1(タイル1用)
    setPaletteEntry(ppu, 2, 0x30); // グループ0色2(タイル2用)
    ppu.cpuWrite(0x2000, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2001, 0b0000_1000); // 背景のみ有効

    finishPreRenderLine(ppu);
    tickDots(ppu, SPLIT_ROW * 341); // scanline(SPLIT_ROW)のcycle0まで進める

    // ここでバンク1(タイル2)へ即座に切り替える
    ppu.cpuWrite(0x2006, 0x24);
    ppu.cpuWrite(0x2006, 0x00);

    tickDots(ppu, (240 - SPLIT_ROW) * 341); // 残りの可視スキャンラインを描画

    // x=4(1タイル目)は、切り替え時点で既に前のスキャンライン末尾でプリフェッチ済みの
    // シフトレジスタ内容がそのまま出るため旧内容のまま（実機の1タイル分のパイプライン
    // 遅延どおり）。x=20(3タイル目、cycle0より後に新しいvでフェッチされる)で確認する。
    const before = pixelRgb(ppu, 20, SPLIT_ROW - 1);
    const atSplit = pixelRgb(ppu, 20, SPLIT_ROW); // 切り替えたスキャンライン自身
    const after = pixelRgb(ppu, 20, SPLIT_ROW + 10);

    expect(atSplit).not.toEqual(before); // vが即座に反映され、切り替えた行自身から新内容が見える
    expect(atSplit).toEqual(after);
  });

  it("$2005の書き換えは書き換えたスキャンライン自身には反映されず、次のスキャンラインから反映される", () => {
    const ppu = makePpu("horizontal");
    fillSplitColumns(ppu, 0x2000, TILE1, TILE2); // コラム0-15=タイル1, 16-31=タイル2
    setPaletteEntry(ppu, 0, 0x01);
    setPaletteEntry(ppu, 1, 0x21); // タイル1色
    setPaletteEntry(ppu, 2, 0x30); // タイル2色
    ppu.cpuWrite(0x2000, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2005, 0x00);
    ppu.cpuWrite(0x2001, 0b0000_1000);

    finishPreRenderLine(ppu);
    tickDots(ppu, SPLIT_ROW * 341);

    // x=4はタイル1領域(コラム0)。scrollX=128(コラム16、タイル2領域の先頭)へシフトすると、
    // 以降は元々x=132にあった内容(タイル2)がx=4に見えるようになる……が、$2005は
    // 1回目の書き込み(X方向)だけなのでtにしか反映されず、vは次スキャンラインのdot257まで
    // 更新されない。
    ppu.cpuWrite(0x2005, 128);

    tickDots(ppu, (240 - SPLIT_ROW) * 341);

    const before = pixelRgb(ppu, 4, SPLIT_ROW - 1);
    const atSplit = pixelRgb(ppu, 4, SPLIT_ROW); // 書き換えた行自身 → まだ旧内容のまま
    const afterNextLine = pixelRgb(ppu, 4, SPLIT_ROW + 1); // 次の行から新内容

    expect(atSplit).toEqual(before);
    expect(afterNextLine).not.toEqual(before);
  });
});
