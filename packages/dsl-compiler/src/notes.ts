/**
 * playTone() 用の音階テーブル。MIDIノート番号48(C3)〜83(B5)の36音を等平均律で生成し、
 * NES APUのタイマー周期値（チャンネル種別ごとに周波数→周期の換算式が異なる）へ変換する。
 * コンパイル時（TypeScript側）で計算し、PRG-ROMに固定データテーブルとして埋め込む。
 */

const CPU_CLOCK_NTSC = 1789773;
export const NOTE_COUNT = 36;
const MIDI_BASE = 48; // C3

function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function clampPeriod(period: number): number {
  return Math.max(0, Math.min(0x7ff, Math.round(period)));
}

/** 矩形波（Pulse1/Pulse2）用の11bit周期テーブル。freq = CPU_CLOCK / (16 * (period+1)) */
export function buildPulsePeriodTable(): number[] {
  const table: number[] = [];
  for (let i = 0; i < NOTE_COUNT; i++) {
    const freq = midiToFreq(MIDI_BASE + i);
    const period = CPU_CLOCK_NTSC / (16 * freq) - 1;
    table.push(clampPeriod(period));
  }
  return table;
}

/** 三角波（Triangle）用の11bit周期テーブル。freq = CPU_CLOCK / (32 * (period+1)) */
export function buildTrianglePeriodTable(): number[] {
  const table: number[] = [];
  for (let i = 0; i < NOTE_COUNT; i++) {
    const freq = midiToFreq(MIDI_BASE + i);
    const period = CPU_CLOCK_NTSC / (32 * freq) - 1;
    table.push(clampPeriod(period));
  }
  return table;
}

export function lowBytes(periods: number[]): number[] {
  return periods.map((p) => p & 0xff);
}

export function highBytes(periods: number[]): number[] {
  return periods.map((p) => (p >> 8) & 0x07);
}
