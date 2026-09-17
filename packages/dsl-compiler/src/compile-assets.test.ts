import { describe, expect, it } from "vitest";
import { Nes } from "@js-nes/emulator-core";
import { packChrTile } from "@js-nes/rom-builder";
import { compile } from "./compile.js";

/**
 * DSL v1（シーン/パーツ構成モデル）Phase 3の資産リンクゲート。
 * 「ドット絵パーツはそれぞれ独立して描ける（自分のタイルシート内の0起点の番号だけを
 * 意識すればよい）」を実際に検証する。パーツごとに別々のタイルを渡してコンパイルし、
 * (1) CHR-ROMが宣言順に正しく連結されていること、(2) 各behaviorのdrawSprite呼び出しが
 * 実行時に正しいグローバルタイル番号でOAMへ反映されることを確認する。
 * C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md のPhase 3参照。
 */

// 8x8、全ピクセル値1のベタ塗りタイル（Ball用）
const BALL_TILE = new Array(64).fill(1);
// 8x8、全ピクセル値2のベタ塗りタイル（Paddle用、Ballと区別できる別パターン）
const PADDLE_TILE = new Array(64).fill(2);

const SOURCE = `
part Ball {
  field x = 128;
  field y = 120;

  behavior move(self) {
    drawSprite(1, self.x, self.y, 0, 0);
  }
}

part Paddle {
  field y = 100;

  behavior move(self) {
    drawSprite(0, 20, self.y, 0, 0);
  }
}

scene Main {
  instance ball: Ball;
  instance paddle: Paddle;

  function init() {}

  function update() {
    Ball.move(ball);
    Paddle.move(paddle);
  }
}
`;

describe("DSL v1（part/scene）Phase 3: 資産リンク（パーツごとに独立したタイルの結合）", () => {
  it("パーツごとのタイルが宣言順にCHR-ROMへ連結される", () => {
    const { rom, prgRom } = compile(SOURCE, {
      partTiles: { Ball: [BALL_TILE], Paddle: [PADDLE_TILE] },
    });

    const chrRomStart = 16 + prgRom.length;
    const chrRom = rom.slice(chrRomStart);

    // Ball(宣言順1番目)のタイルがオフセット0、Paddle(2番目)のタイルがオフセット16(1タイル分)。
    expect(chrRom.slice(0, 16)).toEqual(packChrTile(BALL_TILE));
    expect(chrRom.slice(16, 32)).toEqual(packChrTile(PADDLE_TILE));
  });

  it("behavior内のdrawSpriteのtile引数(ローカル0起点)が、パーツごとの正しいグローバル番号に自動変換されて実行時のOAMに反映される", () => {
    const { rom } = compile(SOURCE, {
      partTiles: { Ball: [BALL_TILE], Paddle: [PADDLE_TILE] },
    });
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 5; i++) nes.runFrame();

    // Ball: OAM id=1, ローカルtile0 → Ballのオフセット(0) + 0 = グローバルtile 0
    expect(nes.ppu.oam[1 * 4 + 1]).toBe(0);
    // Paddle: OAM id=0, ローカルtile0 → Paddleのオフセット(1) + 0 = グローバルtile 1
    expect(nes.ppu.oam[0 * 4 + 1]).toBe(1);
  });

  it("assetsを渡さない場合は従来どおり空のCHR-ROM(プレースホルダー)になる（後方互換）", () => {
    const { rom, prgRom } = compile(SOURCE);
    const chrRom = rom.slice(16 + prgRom.length);
    expect(chrRom.length).toBe(0x2000);
    expect(chrRom.every((b) => b === 0)).toBe(true);
  });

  it("パーツのタイル数を超える番号を指定するとCodegenErrorになる", () => {
    const overflowSource = `
      part Ball {
        field x = 0;
        behavior move(self) {
          drawSprite(0, 0, 0, 999, 0);
        }
      }
      scene Main {
        instance ball: Ball;
        function init() {}
        function update() { Ball.move(ball); }
      }
    `;
    expect(() =>
      compile(overflowSource, { partTiles: { Ball: [BALL_TILE] } }),
    ).toThrow(/範囲/);
  });
});
