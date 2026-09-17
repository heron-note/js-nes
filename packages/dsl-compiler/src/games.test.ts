import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUTTON, Nes } from "@js-nes/emulator-core";
import { compile } from "./compile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONG_SOURCE = readFileSync(join(__dirname, "..", "..", "..", "games", "game-01-pong", "main.js"), "utf-8");

// games/game-01-pong/main.js のRAM(SoA)アロケーション順（part宣言順→フィールド宣言順、
// PART_RAM_START=$0300起点）に基づく。part Ball { x, y, goingRight, goingDown } →
// part Paddle { y, bottom }の順。
const BALL_X = 0x0300;
const BALL_Y = 0x0301;
const BALL_GOING_RIGHT = 0x0302;
const BALL_GOING_DOWN = 0x0303;
const PADDLE_Y = 0x0304;
const PADDLE_BOTTOM = 0x0305;

function stepUntil(nes: Nes, predicate: () => boolean, maxFrames = 20): void {
  for (let i = 0; i < maxFrames; i++) {
    if (predicate()) return;
    nes.runFrame();
  }
  throw new Error("stepUntil: exceeded maxFrames without predicate becoming true");
}

function bootedNes(): Nes {
  const { rom } = compile(PONG_SOURCE);
  const nes = new Nes();
  nes.loadRom(rom);
  stepUntil(nes, () => nes.readCpuMemory(BALL_X) !== 0);
  return nes;
}

describe("games/game-01-pong/main.js", () => {
  it("compiles without error", () => {
    expect(() => compile(PONG_SOURCE)).not.toThrow();
  });

  it("moves the paddle by 2px per frame while a direction key is held", () => {
    const nes = bootedNes();
    const before = nes.readCpuMemory(PADDLE_Y);
    nes.controller1.setButton(BUTTON.UP, true);
    nes.runFrame();
    nes.controller1.setButton(BUTTON.UP, false);
    expect(nes.readCpuMemory(PADDLE_Y)).toBe(before - 2);
  });

  it("clamps the paddle at the top of the screen", () => {
    const nes = bootedNes();
    for (let i = 0; i < 100; i++) {
      nes.controller1.setButton(BUTTON.UP, true);
      nes.runFrame();
    }
    nes.controller1.setButton(BUTTON.UP, false);
    expect(nes.readCpuMemory(PADDLE_Y)).toBe(2);
  });

  it("clamps the paddle at the bottom of the screen", () => {
    const nes = bootedNes();
    for (let i = 0; i < 150; i++) {
      nes.controller1.setButton(BUTTON.DOWN, true);
      nes.runFrame();
    }
    nes.controller1.setButton(BUTTON.DOWN, false);
    expect(nes.readCpuMemory(PADDLE_Y)).toBeLessThanOrEqual(225);
    expect(nes.readCpuMemory(PADDLE_Y)).toBeGreaterThanOrEqual(224);
  });

  it("bounces off the bottom wall before moving out of bounds (no 8bit wraparound)", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(BALL_X, 100);
    nes.writeCpuMemory(BALL_Y, 230);
    nes.writeCpuMemory(BALL_GOING_RIGHT, 1);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    // 判定は移動前の位置で行われ、フラグが反転してから移動するため壁を超えない
    expect(nes.readCpuMemory(BALL_GOING_DOWN)).toBe(0);
    expect(nes.readCpuMemory(BALL_Y)).toBe(228);
    expect(nes.readCpuMemory(BALL_X)).toBe(102);
  });

  it("bounces off the top wall before moving out of bounds (no 8bit wraparound)", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(BALL_X, 100);
    nes.writeCpuMemory(BALL_Y, 1);
    nes.writeCpuMemory(BALL_GOING_RIGHT, 1);
    nes.writeCpuMemory(BALL_GOING_DOWN, 0);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_GOING_DOWN)).toBe(1);
    expect(nes.readCpuMemory(BALL_Y)).toBe(3);
  });

  it("bounces off the right wall", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(BALL_X, 250);
    nes.writeCpuMemory(BALL_Y, 50);
    nes.writeCpuMemory(BALL_GOING_RIGHT, 1);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(0);
    expect(nes.readCpuMemory(BALL_X)).toBe(248);
  });

  it("bounces off the paddle when the ball's Y overlaps the paddle's 8px range", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(BALL_X, 25);
    nes.writeCpuMemory(BALL_Y, 104); // paddle範囲 [100,108) の内側
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(1); // 跳ね返って右向きに
    expect(nes.readCpuMemory(BALL_X)).toBe(27); // 反転後の向きで移動する
    expect(nes.apu.getChannelState(0).enabled).toBe(true); // 効果音が鳴っている
  });

  it("does NOT bounce off the paddle when the ball's Y is outside the paddle's range", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(BALL_X, 25);
    nes.writeCpuMemory(BALL_Y, 50); // paddle範囲 [100,108) の外側
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(0); // 跳ね返らない（左向きのまま）
    expect(nes.readCpuMemory(BALL_X)).toBe(23);
  });

  it("resets the ball to the center when it passes the paddle unhit", () => {
    const nes = bootedNes();
    nes.writeCpuMemory(PADDLE_Y, 100);
    nes.writeCpuMemory(BALL_X, 3); // 既にミス判定ライン(<4)の内側
    nes.writeCpuMemory(BALL_Y, 50); // パドル範囲外
    nes.writeCpuMemory(BALL_GOING_RIGHT, 0);
    nes.writeCpuMemory(BALL_GOING_DOWN, 1);

    nes.runFrame();

    // リセット後、その同フレーム内で新しい方向へ1回分移動する
    expect(nes.readCpuMemory(BALL_X)).toBe(130);
    expect(nes.readCpuMemory(BALL_Y)).toBe(122);
    expect(nes.readCpuMemory(BALL_GOING_RIGHT)).toBe(1);
    expect(nes.apu.getChannelState(1).enabled).toBe(true); // ミスSEが鳴っている
  });

  it("runs for many frames with intermittent input without crashing", () => {
    const nes = bootedNes();
    expect(() => {
      for (let i = 0; i < 300; i++) {
        nes.controller1.setButton(BUTTON.UP, i % 4 === 0);
        nes.controller1.setButton(BUTTON.DOWN, i % 4 === 2);
        nes.runFrame();
      }
    }).not.toThrow();
  });
});
