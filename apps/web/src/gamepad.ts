import type { ButtonName } from "@js-nes/emulator-core";
import { applyDirDiff, quantize8Way, type DirState } from "./virtualStick.js";

export type GamepadButtonState = {
  a: boolean;
  b: boolean;
  start: boolean;
  select: boolean;
  dir: DirState;
};

const EMPTY: GamepadButtonState = {
  a: false,
  b: false,
  start: false,
  select: false,
  dir: { up: false, down: false, left: false, right: false },
};

/**
 * Standard Gamepad マッピング:
 * - 左スティック axes[0]/axes[1] または D-pad buttons 12-15
 * - B0=A, B1=B, B8=SELECT, B9=START
 */
export function readStandardGamepad(pad: Gamepad): GamepadButtonState {
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  let dir = quantize8Way(ax, ay);

  // 十字ボタン（Standard Gamepad: 12=Up, 13=Down, 14=Left, 15=Right）
  const dpadUp = pad.buttons[12]?.pressed ?? false;
  const dpadDown = pad.buttons[13]?.pressed ?? false;
  const dpadLeft = pad.buttons[14]?.pressed ?? false;
  const dpadRight = pad.buttons[15]?.pressed ?? false;
  if (dpadUp || dpadDown || dpadLeft || dpadRight) {
    dir = { up: dpadUp, down: dpadDown, left: dpadLeft, right: dpadRight };
  }

  return {
    a: pad.buttons[0]?.pressed ?? false,
    b: pad.buttons[1]?.pressed ?? false,
    select: pad.buttons[8]?.pressed ?? false,
    start: pad.buttons[9]?.pressed ?? false,
    dir,
  };
}

export function findFirstGamepad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad) return pad;
  }
  return null;
}

/**
 * 前回状態との差分だけ setButton する。接続中パッドが無ければ全解除へ戻す。
 */
export function pollGamepad(
  prev: GamepadButtonState,
  setButton: (name: ButtonName, pressed: boolean) => void,
): { state: GamepadButtonState; connected: boolean; id: string | null } {
  const pad = findFirstGamepad();
  if (!pad) {
    applyDirDiff(prev.dir, EMPTY.dir, setButton);
    if (prev.a) setButton("A", false);
    if (prev.b) setButton("B", false);
    if (prev.start) setButton("START", false);
    if (prev.select) setButton("SELECT", false);
    return {
      state: { a: false, b: false, start: false, select: false, dir: { up: false, down: false, left: false, right: false } },
      connected: false,
      id: null,
    };
  }

  const next = readStandardGamepad(pad);
  applyDirDiff(prev.dir, next.dir, setButton);
  if (prev.a !== next.a) setButton("A", next.a);
  if (prev.b !== next.b) setButton("B", next.b);
  if (prev.start !== next.start) setButton("START", next.start);
  if (prev.select !== next.select) setButton("SELECT", next.select);

  return { state: next, connected: true, id: pad.id };
}
