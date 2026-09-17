/**
 * 標準コントローラ（$4016 / $4017）のシリアル読み出しエミュレーション。
 */
export const BUTTON = {
  A: 0,
  B: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
} as const;

export type ButtonName = keyof typeof BUTTON;

export class Controller {
  private state = 0;
  private shift = 0;
  private strobe = false;

  setButton(bit: number, pressed: boolean): void {
    if (pressed) this.state |= 1 << bit;
    else this.state &= ~(1 << bit);
  }

  write(value: number): void {
    this.strobe = (value & 1) === 1;
    if (this.strobe) this.shift = this.state;
  }

  read(): number {
    if (this.strobe) this.shift = this.state;
    const bit = this.shift & 1;
    this.shift = (this.shift >> 1) | 0x80; // 8回読み切った後は1を返し続ける実機挙動を簡易再現
    return bit;
  }
}
