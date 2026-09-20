/**
 * ピアノロール用の音イベント／SoundAsset ヘルパー。
 * 既存の単発 tone（channel/note/duration）は互換のため残し、
 * events があればシーケンスとして扱う。
 */

export type SoundChannel = 0 | 1 | 2 | 3;

/** アセット先頭からの相対フレームで発音する1ノート。 */
export type ToneEvent = {
  t: number;
  channel: SoundChannel;
  note: number;
  duration: number;
};

export const PIANO_ROLL_STEPS_DEFAULT = 32;
export const PIANO_ROLL_FRAMES_PER_STEP = 4;
export const PIANO_ROLL_NOTE_ROWS = 36; // C3–B5（Noise 時は下位 16 のみ使用）

export function defaultLengthFrames(): number {
  return PIANO_ROLL_STEPS_DEFAULT * PIANO_ROLL_FRAMES_PER_STEP;
}

export function isSequenceSound(sound: {
  events?: ToneEvent[];
}): boolean {
  return Array.isArray(sound.events) && sound.events.length > 0;
}

/** 単発 tone フィールドを events 1 本に正規化（表示・試聴用）。 */
export function soundToEvents(sound: {
  channel: SoundChannel;
  note: number;
  duration: number;
  events?: ToneEvent[];
  lengthFrames?: number;
}): ToneEvent[] {
  if (Array.isArray(sound.events) && sound.events.length > 0) {
    return sound.events.map((e) => ({
      t: e.t | 0,
      channel: e.channel,
      note: e.note | 0,
      duration: Math.max(1, e.duration | 0),
    }));
  }
  return [
    {
      t: 0,
      channel: sound.channel,
      note: sound.note | 0,
      duration: Math.max(1, sound.duration | 0),
    },
  ];
}

export function syncToneFieldsFromEvents(sound: {
  channel: SoundChannel;
  note: number;
  duration: number;
  events?: ToneEvent[];
  lengthFrames?: number;
}): void {
  const events = sound.events;
  if (!events || events.length === 0) return;
  const first = events[0]!;
  sound.channel = first.channel;
  sound.note = first.note;
  sound.duration = first.duration;
  const maxEnd = events.reduce((m, e) => Math.max(m, e.t + e.duration), 0);
  sound.lengthFrames = Math.max(sound.lengthFrames ?? defaultLengthFrames(), maxEnd);
}

export function validateToneEvent(e: unknown, label: string): ToneEvent {
  if (typeof e !== "object" || e === null) {
    throw new Error(`${label} がオブジェクトではありません`);
  }
  const o = e as Record<string, unknown>;
  const t = o.t;
  const channel = o.channel;
  const note = o.note;
  const duration = o.duration;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > 255) {
    throw new Error(`${label}.t は 0〜255 の整数である必要があります`);
  }
  if (channel !== 0 && channel !== 1 && channel !== 2 && channel !== 3) {
    throw new Error(`${label}.channel は 0–3 である必要があります`);
  }
  if (typeof note !== "number" || !Number.isInteger(note) || note < 0 || note > 255) {
    throw new Error(`${label}.note が不正です`);
  }
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 0 || duration > 255) {
    throw new Error(`${label}.duration が不正です`);
  }
  return { t, channel, note, duration };
}
