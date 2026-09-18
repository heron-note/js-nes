/**
 * M9 入力ロックステップ用のワイヤプロトコルと入力遅延バッファ。
 * 両者が同じ ROM を実行し、毎フレーム 1P/2P のボタン1バイトだけを交換する。
 * 乱数は送らない（同じ入力 → 同じ疑似乱数、が前提）。デシンクはチェックサムで検出する。
 */

export const LOCKSTEP_PROTOCOL_VERSION = 1;
export const DEFAULT_INPUT_DELAY_FRAMES = 2;
export const ROM_CHUNK_CHARS = 12_000; // Base64 約9KB相当。手動シグナリング後の DC 用

export type LockstepRole = "host" | "guest";

/** DataChannel 上の JSON メッセージ（制御・入力・ROM断片）。 */
export type LockstepMessage =
  | {
      t: "hello";
      v: typeof LOCKSTEP_PROTOCOL_VERSION;
      role: LockstepRole;
      inputDelay: number;
    }
  | { t: "rom-begin"; name: string; size: number; chunks: number }
  | { t: "rom-chunk"; i: number; data: string }
  | { t: "rom-end" }
  | { t: "rom-ack" }
  | { t: "start"; startFrame: number }
  | { t: "input"; frame: number; buttons: number }
  | { t: "checksum"; frame: number; hash: number }
  | { t: "desync"; frame: number; localHash: number; remoteHash: number };

export function encodeLockstepMessage(msg: LockstepMessage): string {
  return JSON.stringify(msg);
}

export function decodeLockstepMessage(raw: string): LockstepMessage | null {
  try {
    const msg = JSON.parse(raw) as LockstepMessage;
    if (!msg || typeof msg !== "object" || typeof (msg as { t?: unknown }).t !== "string") return null;
    return msg;
  } catch {
    return null;
  }
}

/** Uint8Array → Base64（大きな ROM をチャンク分割する前処理）。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function chunkBase64(b64: string, chunkChars = ROM_CHUNK_CHARS): string[] {
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += chunkChars) {
    parts.push(b64.slice(i, i + chunkChars));
  }
  return parts.length > 0 ? parts : [""];
}

/**
 * フレームバッファ先頭からの簡易ハッシュ（デシンク検出用）。
 * 暗号強度は不要。ズレたら高確率で食い違う程度でよい。
 */
export function hashFramebuffer(fb: Uint8ClampedArray, sampleStride = 64): number {
  let h = 2166136261;
  for (let i = 0; i < fb.length; i += sampleStride) {
    h ^= fb[i]!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 入力遅延バッファ。
 * frame N の実行には「いまの入力」ではなく delay フレーム前に確定した入力を使う。
 * 自分の操作はローカルでも delay 分遅れるが、相手待ちの見た目ラグを平準化できる。
 */
export class InputDelayBuffer {
  private readonly delay: number;
  private readonly queue: number[] = [];
  private nextFrame = 0;

  constructor(delayFrames: number) {
    this.delay = Math.max(0, delayFrames);
    for (let i = 0; i < this.delay; i++) this.queue.push(0);
  }

  /** 現在の生入力を押し込み、このフレームで使う確定入力を返す。 */
  pushAndTake(rawButtons: number): { frame: number; buttons: number } {
    this.queue.push(rawButtons & 0xff);
    const buttons = this.queue.shift() ?? 0;
    const frame = this.nextFrame;
    this.nextFrame += 1;
    return { frame, buttons };
  }

  get currentFrame(): number {
    return this.nextFrame;
  }

  reset(startFrame = 0): void {
    this.queue.length = 0;
    for (let i = 0; i < this.delay; i++) this.queue.push(0);
    this.nextFrame = startFrame;
  }
}

/**
 * 相手から届いた frame→buttons を溜め、指定フレームが揃ったら取り出す。
 */
export class RemoteInputInbox {
  private readonly pending = new Map<number, number>();

  offer(frame: number, buttons: number): void {
    this.pending.set(frame, buttons & 0xff);
  }

  take(frame: number): number | undefined {
    const v = this.pending.get(frame);
    if (v === undefined) return undefined;
    this.pending.delete(frame);
    return v;
  }

  has(frame: number): boolean {
    return this.pending.has(frame);
  }

  clear(): void {
    this.pending.clear();
  }
}

/** ROM 受信の組み立て。 */
export class RomReassembler {
  private name = "";
  private expectedChunks = 0;
  private chunks: string[] = [];

  begin(name: string, _size: number, chunks: number): void {
    this.name = name;
    this.expectedChunks = chunks;
    this.chunks = new Array(chunks).fill("");
  }

  put(i: number, data: string): void {
    if (i >= 0 && i < this.chunks.length) this.chunks[i] = data;
  }

  finish(): { name: string; bytes: Uint8Array } | null {
    if (this.chunks.length !== this.expectedChunks) return null;
    if (this.chunks.some((c) => c === undefined)) return null;
    return { name: this.name, bytes: base64ToBytes(this.chunks.join("")) };
  }
}
