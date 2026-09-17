import { describe, expect, it } from "vitest";
import { incrementCoarseX, incrementY, transferHorizontal, transferVertical } from "./ppu.js";

/**
 * PPUのドット精度化プロジェクト Phase 1のゲート。
 * loopy v/tレジスタの補助関数を、実際のtickOne()への組み込み前に単体で検証する
 * （最もバグが混入しやすい箇所のため。C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md 参照）。
 */

describe("incrementCoarseX", () => {
  it("coarse Xが31未満なら単純に+1する", () => {
    expect(incrementCoarseX(0)).toBe(1);
    expect(incrementCoarseX(5)).toBe(6);
    expect(incrementCoarseX(30)).toBe(31);
  });

  it("coarse X=31で0へラップし、水平ネームテーブルビット(bit10)を反転する", () => {
    expect(incrementCoarseX(31)).toBe(0x0400);
    expect(incrementCoarseX(0x0400 | 31)).toBe(0);
  });

  it("coarse X以外のビット(coarse Y・fine Y・垂直NTビット)は変化しない", () => {
    const v = 0x7be0 | 15; // fine Y=7, coarse Y=31, 垂直NT=1, coarse X=15
    expect(incrementCoarseX(v) & ~0x041f).toBe(v & ~0x041f);
  });
});

describe("incrementY", () => {
  it("fine Yが7未満なら+0x1000する（coarse Yは変化しない）", () => {
    expect(incrementY(0)).toBe(0x1000);
    expect(incrementY(0x2000)).toBe(0x3000);
  });

  it("fine Y=7かつcoarse Y=29でcoarse Y=0にラップし垂直NTビット(bit11)を反転する", () => {
    const v = 0x7000 | (29 << 5);
    const result = incrementY(v);
    expect((result >> 5) & 0x1f).toBe(0);
    expect(result & 0x7000).toBe(0);
    expect(result & 0x0800).toBe(0x0800);
  });

  it("fine Y=7かつcoarse Y=31でcoarse Y=0にラップするが垂直NTビットは反転しない（実機のアトリビュート領域オーバーフロー挙動）", () => {
    const v = 0x7000 | (31 << 5) | 0x0800;
    const result = incrementY(v);
    expect((result >> 5) & 0x1f).toBe(0);
    expect(result & 0x0800).toBe(0x0800); // 変化しない
  });

  it("fine Y=7かつcoarse Yが29/31以外なら単純にcoarse Y+1しfine Yを0に戻す", () => {
    const v = 0x7000 | (10 << 5);
    const result = incrementY(v);
    expect((result >> 5) & 0x1f).toBe(11);
    expect(result & 0x7000).toBe(0);
  });
});

describe("transferHorizontal", () => {
  it("coarse X(bit0-4)と水平NTビット(bit10)だけをtからvへコピーする", () => {
    const v = 0x7be0 | 5; // coarse X=5, その他は「上書きされるべき残り物」として満たしておく
    const t = 0x0400 | 17; // coarse X=17, 水平NT=1
    const result = transferHorizontal(v, t);
    expect(result & 0x041f).toBe(t & 0x041f);
    expect(result & ~0x041f).toBe(v & ~0x041f); // それ以外はvのまま変化しない
  });
});

describe("transferVertical", () => {
  it("fine Y・coarse Y・垂直NTビットだけをtからvへコピーする", () => {
    const v = 0x041f; // coarse X=31, 水平NT=1(vertCopyMaskの対象外なので保持されるべき)
    const t = 0x7be0; // fine Y=7, coarse Y=31, 垂直NT=1
    const result = transferVertical(v, t);
    expect(result & 0x7be0).toBe(t & 0x7be0);
    expect(result & ~0x7be0).toBe(v & ~0x7be0);
  });
});
