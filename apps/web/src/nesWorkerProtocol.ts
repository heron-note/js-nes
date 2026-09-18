import type { ChannelSnapshot } from "@js-nes/emulator-core";

/**
 * NESエミュレーション本体（Nes.runFrame()のステップ実行）をWeb Workerへ分離するための
 * メッセージプロトコル。apps/web/src/nesWorker.ts（Worker側）とmain.ts（メインスレッド側）
 * の両方から参照する、DOM/Worker固有の型に依存しない純粋な型定義。
 */

/** loadRomの呼び出し元。結果メッセージをどのUI文言に反映するか main.ts 側で分岐するための相関キー。 */
export type LoadRomContext = "demo" | "build" | "embedded" | "upload" | "netplay";

export type NesWorkerInboundMessage =
  | { type: "loadRom"; bytes: Uint8Array; context: LoadRomContext }
  | { type: "button"; controller: 1 | 2; bit: number; pressed: boolean }
  /** コントローラ1バイトを一括セット（ネットプレイ用）。bit0=A ... 従来の BUTTON と同じ並び。 */
  | { type: "controllerByte"; controller: 1 | 2; buttons: number }
  /**
   * ロックステップモード。有効時は自走ループを止め、stepFrame が来るまでフレームを進めない。
   * 無効に戻すと自走を再開する。
   */
  | { type: "lockstepEnable"; enabled: boolean }
  /** 両コントローラ入力を適用してちょうど1フレーム進める（ロックステップ専用）。 */
  | { type: "stepFrame"; p1: number; p2: number; frame: number }
  // AudioWorkletNode.portの所有権をそのままWorkerへ譲渡する。以後Workerはメインスレッドを
  // 一切経由せず、このportへ直接PCMサンプルをpostMessageする。
  | { type: "audioPort"; port: MessagePort; sampleRate: number };

export type NesWorkerOutboundMessage =
  | { type: "frame"; framebuffer: Uint8ClampedArray; channelSnapshots: ChannelSnapshot[]; frame?: number; hash?: number }
  | { type: "loadRomResult"; context: LoadRomContext; ok: boolean; message?: string }
  | { type: "fatalError"; message: string };
