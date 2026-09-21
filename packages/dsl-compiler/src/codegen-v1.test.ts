import { describe, expect, it } from "vitest";
import { BUTTON, Nes } from "@js-nes/emulator-core";
import { compile } from "./compile.js";
import { CodegenError } from "./codegen.js";

/**
 * DSL v1（シーン/パーツ構成モデル）Phase 2の最重要ゲート。
 * 手書きのPong相当ソースをpart/scene構文で実際にコンパイルし、emulator-core上で
 * 正しく動作する（ボールがパドルで跳ね返る＝パーツ横断の相互作用が成立する）ことを
 * 実行検証する。C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md のPhase 2参照。
 */

// RAM(SoA)アロケーション順（part宣言順→フィールド宣言順、PART_RAM_START=$0300起点）に基づく。
const BALL_X = 0x0300;
const BALL_Y = 0x0301;
const BALL_GOING_RIGHT = 0x0302;
const BALL_GOING_DOWN = 0x0303;
const PADDLE_Y = 0x0304;
const PADDLE_BOTTOM = 0x0305;

const PONG_V1_SOURCE = `
part Ball {
  field x = 128;
  field y = 120;
  field goingRight = 1;
  field goingDown = 1;

  behavior move(self) {
    if (self.y < 2) { self.goingDown = 1; }
    if (self.y > 228) { self.goingDown = 0; }
    if (self.x > 248) { self.goingRight = 0; }

    if (self.goingRight) { self.x += 2; } else { self.x -= 2; }
    if (self.goingDown) { self.y += 2; } else { self.y -= 2; }
    drawSprite(1, self.x, self.y, 2, 0);
  }
}

part Paddle {
  field y = 100;
  field bottom = 108;

  behavior move(self) {
    if (btn.up) { self.y -= 2; }
    if (btn.down) { self.y += 2; }
    self.bottom = self.y;
    self.bottom += 8;
    drawSprite(0, 20, self.y, 1, 0);
  }
}

scene Main {
  instance ball: Ball;
  instance paddle: Paddle;

  function init() {
    setPalette(0, 1, 33, 0, 0);
    setSpritePalette(0, 1, 34, 0, 0);
  }

  function update() {
    Paddle.move(paddle);
    Ball.move(ball);

    if (ball.x < 28) {
      if (ball.y > paddle.y) {
        if (ball.y < paddle.bottom) {
          ball.goingRight = 1;
          playTone(0, 28, 5);
        }
      }
    }

    if (ball.x < 4) {
      ball.x = 128;
      ball.y = 120;
      ball.goingRight = 1;
      playTone(1, 12, 15);
    }
  }
}
`;

function stepUntil(nes: Nes, predicate: () => boolean, maxFrames = 20): void {
  for (let i = 0; i < maxFrames; i++) {
    if (predicate()) return;
    nes.runFrame();
  }
  throw new Error("stepUntil: exceeded maxFrames without predicate becoming true");
}

function bootedNes(): Nes {
  const { rom } = compile(PONG_V1_SOURCE);
  const nes = new Nes();
  nes.loadRom(rom);
  stepUntil(nes, () => nes.readCpuMemory(BALL_X) !== 0);
  return nes;
}

describe("DSL v1（part/scene）Phase 2: Pong相当ソースのコンパイル・実行検証", () => {
  it("part/scene構文のソースをエラーなくコンパイルできる", () => {
    expect(() => compile(PONG_V1_SOURCE)).not.toThrow();
  });

  it("初期化直後、各パーツのフィールドがinit値でRAMに反映されている", () => {
    const nes = bootedNes();
    expect(nes.readCpuMemory(BALL_X)).toBe(128);
    expect(nes.readCpuMemory(BALL_Y)).toBe(120);
    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(1);
    expect(nes.readCpuMemory(PADDLE_Y)).toBe(100);
    expect(nes.readCpuMemory(PADDLE_BOTTOM)).toBe(108);
  });

  it("パーツの振る舞い(behavior)がself.fieldを正しく読み書きする: パドルがbtn.upで2px上に動く", () => {
    const nes = bootedNes();
    const before = nes.readCpuMemory(PADDLE_Y);
    nes.controller1.setButton(BUTTON.UP, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.UP, false);
    expect(nes.readCpuMemory(PADDLE_Y)).toBe(before - 2);
    // self.bottom = self.y; self.bottom += 8; も同じインスタンスに対して正しく動く
    expect(nes.readCpuMemory(PADDLE_BOTTOM)).toBe(nes.readCpuMemory(PADDLE_Y) + 8);
  });

  it("ボールが自力で壁に跳ね返る（パーツ内で完結する自己完結ロジック）", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(BALL_X, 250);
    nes.writeCpuMemory(BALL_Y, 50);
    nes.writeCpuMemory(BALL_GOING_RIGHT, 1);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(0); // 跳ね返って左向きに
    expect(nes.readCpuMemory(BALL_X)).toBe(248); // 反転後の向きで移動
  });

  it("【最重要】ボールがパドルの範囲内に来ると跳ね返る（シーンレベルのパーツ横断ロジック）", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(PADDLE_BOTTOM, 108);
    nes.writeCpuMemory(BALL_X, 26); // Ball.move()で26に(移動前25?)なるよう少し余裕を見て設定
    nes.writeCpuMemory(BALL_Y, 104); // paddle範囲 [100,108) の内側
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    // Ball.move()がgoingRight=0のまま-2してx=24、シーンのcollisionチェックが
    // (ball.x < 28) かつ (paddle.y < ball.y < paddle.bottom) を満たし、goingRightを1に戻す。
    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(1);
    expect(nes.apu.getChannelState(0).enabled).toBe(true); // 効果音(Pulse1)が鳴っている
  });

  it("ボールがパドルの範囲外だと跳ね返らない", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(PADDLE_BOTTOM, 108);
    nes.writeCpuMemory(BALL_X, 26);
    nes.writeCpuMemory(BALL_Y, 50); // paddle範囲外
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(0); // 跳ね返らない
  });

  it("ボールがパドルを通り過ぎるとミス扱いで中央にリセットされ、別チャンネルの効果音が鳴る", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(PADDLE_BOTTOM, 108);
    nes.writeCpuMemory(BALL_X, 5);
    nes.writeCpuMemory(BALL_Y, 50); // パドル範囲外
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_X)).toBe(128);
    expect(nes.readCpuMemory(BALL_Y)).toBe(120);
    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(1);
    expect(nes.apu.getChannelState(1).enabled).toBe(true); // ミスSE(Pulse2)
  });

  it("多数フレーム、断続的な入力ありでクラッシュせず動き続ける", () => {
    const nes = bootedNes();
    expect(() => {
      for (let i = 0; i < 300; i++) {
        nes.controller1.setButton(BUTTON.UP, i % 4 === 0);
        nes.controller1.setButton(BUTTON.DOWN, i % 4 === 2);
        nes.runFrame();
      }
    }).not.toThrow();
  });

  it("part/sceneとトップレベルのfunction init/updateを同時に使うとCodegenErrorになる", () => {
    const source = `
      part Foo { field x = 0; behavior noop(self) {} }
      scene S { instance f: Foo; function init() {} function update() {} }
      function init() {}
      function update() {}
    `;
    expect(() => compile(source)).toThrow(CodegenError);
  });

  it("sceneが0個だとCodegenError、2個以上はコンパイルできる", () => {
    const zeroScenes = `part Foo { field x = 0; behavior noop(self) {} }`;
    expect(() => compile(zeroScenes)).toThrow(CodegenError);

    const twoScenes = `
      part Foo { field x = 0; behavior noop(self) {} }
      scene A { instance f: Foo; function init() {} function update() {} }
      scene B { instance g: Foo; function init() {} function update() {} }
    `;
    expect(() => compile(twoScenes)).not.toThrow();
  });

  it("gotoScene でアクティブシーンが切り替わる", () => {
    const source = `
      part Marker {
        field x = 10;
        behavior move(self) {
          drawSprite(0, self.x, 100, 0, 0);
        }
      }
      scene Title {
        instance t: Marker;
        function init() { t.x = 10; }
        function update() {
          if (btn.start_just_pressed) { gotoScene(1); }
          Marker.move(t);
        }
      }
      scene Main {
        instance m: Marker;
        function init() { m.x = 200; }
        function update() { Marker.move(m); }
      }
    `;
    const { rom } = compile(source);
    const nes = new Nes();
    nes.loadRom(rom);
    for (let i = 0; i < 3; i++) nes.runFrame();
    expect(nes.readCpuMemory(0x07e5)).toBe(0); // ACTIVE_SCENE = Title
    nes.controller1.setButton(BUTTON.START, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.START, false);
    for (let i = 0; i < 2; i++) nes.runFrame();
    expect(nes.readCpuMemory(0x07e5)).toBe(1); // Main
  });
});
