import type { ButtonName } from "@js-nes/emulator-core";

export type DirState = { up: boolean; down: boolean; left: boolean; right: boolean };

const EMPTY_DIR: DirState = { up: false, down: false, left: false, right: false };

/**
 * 正規化ベクトル (x,y) を8方向に量子化する。
 * magnitude が deadzone 未満なら全解除。
 */
export function quantize8Way(x: number, y: number, deadzone = 0.35): DirState {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return { ...EMPTY_DIR };

  // atan2: 右=0, 下=+π/2（画面座標で y は下が正）
  const angle = Math.atan2(y, x);
  // 8セクター: 各45°。右を中心にした -22.5° オフセット
  const sector = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;

  switch (sector) {
    case 0:
      return { up: false, down: false, left: false, right: true };
    case 1:
      return { up: false, down: true, left: false, right: true };
    case 2:
      return { up: false, down: true, left: false, right: false };
    case 3:
      return { up: false, down: true, left: true, right: false };
    case 4:
      return { up: false, down: false, left: true, right: false };
    case 5:
      return { up: true, down: false, left: true, right: false };
    case 6:
      return { up: true, down: false, left: false, right: false };
    case 7:
      return { up: true, down: false, left: false, right: true };
    default:
      return { ...EMPTY_DIR };
  }
}

export function dirStatesEqual(a: DirState, b: DirState): boolean {
  return a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right;
}

export function applyDirDiff(
  prev: DirState,
  next: DirState,
  setButton: (name: ButtonName, pressed: boolean) => void,
): void {
  if (prev.up !== next.up) setButton("UP", next.up);
  if (prev.down !== next.down) setButton("DOWN", next.down);
  if (prev.left !== next.left) setButton("LEFT", next.left);
  if (prev.right !== next.right) setButton("RIGHT", next.right);
}

/**
 * 円形タッチ領域の仮想8方向スティック。
 * pointer イベントでノブを動かし、方向変化時だけコールバックする。
 */
export function bindVirtualStick(
  root: HTMLElement,
  knob: HTMLElement,
  onDirChange: (dir: DirState) => void,
): void {
  let activePointer: number | null = null;
  let prev: DirState = { ...EMPTY_DIR };
  const maxTravel = 28; // px

  const updateFromPoint = (clientX: number, clientY: number): void => {
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxTravel) {
      dx = (dx / dist) * maxTravel;
      dy = (dy / dist) * maxTravel;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / maxTravel;
    const ny = dy / maxTravel;
    const next = quantize8Way(nx, ny);
    if (!dirStatesEqual(prev, next)) {
      onDirChange(next);
      prev = next;
    }
  };

  const release = (): void => {
    activePointer = null;
    root.classList.remove("active");
    knob.style.transform = "translate(0px, 0px)";
    if (!dirStatesEqual(prev, EMPTY_DIR)) {
      onDirChange({ ...EMPTY_DIR });
      prev = { ...EMPTY_DIR };
    }
  };

  root.addEventListener("pointerdown", (e) => {
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    root.setPointerCapture(e.pointerId);
    root.classList.add("active");
    updateFromPoint(e.clientX, e.clientY);
    e.preventDefault();
  });

  root.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointer) return;
    updateFromPoint(e.clientX, e.clientY);
    e.preventDefault();
  });

  root.addEventListener("pointerup", (e) => {
    if (e.pointerId !== activePointer) return;
    release();
    e.preventDefault();
  });

  root.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== activePointer) return;
    release();
  });
}
