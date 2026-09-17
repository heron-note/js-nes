import type { ChannelSnapshot } from "@js-nes/emulator-core";

/**
 * NESエミュレーション本体（Nes.runFrame()のステップ実行）をWeb Workerへ分離するための
 * メッセージプロトコル。apps/web/src/nesWorker.ts（Worker側）とmain.ts（メインスレッド側）
 * の両方から参照する、DOM/Worker固有の型に依存しない純粋な型定義。
 */

/** loadRomの呼び出し元。結果メッセージをどのUI文言に反映するか main.ts 側で分岐するための相関キー。 */
export type LoadRomContext = "demo" | "build" | "embedded" | "upload";

export type NesWorkerInboundMessage =
  | { type: "loadRom"; bytes: Uint8Array; context: LoadRomContext }
  | { type: "button"; controller: 1 | 2; bit: number; pressed: boolean }
  | { type: "audioPort"; port: MessagePort; sampleRate: number }
  // Phase 1限定の暫定メッセージ: audioPort譲渡(Phase 2)が入るまでの間、
  // AudioContext起動が完了した時点でサンプルレートだけを個別に伝える。
  | { type: "setSampleRate"; rate: number };

export type NesWorkerOutboundMessage =
  | { type: "frame"; framebuffer: Uint8ClampedArray; channelSnapshots: ChannelSnapshot[] }
  | { type: "loadRomResult"; context: LoadRomContext; ok: boolean; message?: string }
  | { type: "fatalError"; message: string }
  // Phase 1限定の暫定メッセージ: audioPort譲渡(Phase 2)が入るまでの間、
  // Workerで生成したPCMサンプルをメインスレッド経由でAudioWorkletへ届ける。
  | { type: "audioSamples"; samples: Float32Array };
