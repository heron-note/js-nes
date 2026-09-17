import workletSource from "./audio-worklet-processor.js?raw";

/**
 * emulator-core側のApuが生成する実PCMサンプル（Apu.drainSamples()、Phase 5b）を
 * AudioWorkletへ転送して再生する。以前のOscillatorNodeベースの近似実装
 * （矩形波デューティ比を反映しない、ノイズを事前生成ホワイトノイズで近似する等）は
 * このPhaseで廃止した。APU側の波形合成（デューティ・実LFSRノイズ・DMC含む）が
 * そのまま実際の音として出力される。
 *
 * AudioWorkletは別スレッド（AudioWorkletGlobalScope）で動くモジュールを
 * `audioWorklet.addModule(url)` で登録する必要があるが、本アプリはスタンドアロン
 * HTML書き出し機能（1ファイル配布）を持つため、ネットワーク上の別ファイルには
 * できない。audio-worklet-processor.js のソースを`?raw`でそのまま文字列として
 * バンドルに埋め込み、実行時にBlob URL化してロードすることで、通常のWeb版・
 * スタンドアロンHTML版のどちらでも同じ仕組みで動くようにしている。
 *
 * NESエミュレーション本体はnesWorker.ts（Web Worker）へ移し、メインスレッドの
 * requestAnimationFrameループの詰まりから音声配信を切り離した
 * （C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md 参照）。
 * Phase 1時点ではまだ暫定的にWorker→メインスレッド→AudioWorkletの経路（deliverSamples）
 * を使うが、Phase 2でworklet nodeの`.port`自体をWorkerへ譲渡し、メインスレッドを
 * 一切経由しない直接配信に置き換える。
 */

const CHANNEL_GAIN = 0.13;

/** playTone()の音階テーブル（packages/dsl-compiler/src/notes.ts）と揃えたMIDI換算。C3(48)〜B5(83)の36音。 */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteIndexToFreq(noteIndex: number): number {
  const midi = 48 + noteIndex;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** noteIndex(0-15、実機のノイズ周期テーブルの並び)を、値が大きいほど高い周期＝低い音になる簡易近似で再生速度に変換する。 */
function noiseIndexToPlaybackRate(noteIndex: number): number {
  return 1 + (15 - noteIndex) * 0.25;
}

/** UI表示用のノート名（例: "C3"）。 */
export function noteIndexToLabel(noteIndex: number): string {
  const midi = 48 + noteIndex;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;
  private worker: Worker | null = null;

  /** main.ts起動時、ユーザー操作を待つ前に一度だけ呼ぶ（参照を保持するだけで副作用は無い）。 */
  setWorker(worker: Worker): void {
    this.worker = worker;
  }

  private ensureStarted(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    void this.setupWorklet(ctx);
  }

  private async setupWorklet(ctx: AudioContext): Promise<void> {
    const blob = new Blob([workletSource], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, "nes-audio-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.connect(ctx.destination);
    this.workletNode = node;
    this.workletReady = true;
    // Phase 1暫定: サンプルレートだけをWorkerへ伝える（Phase 2でaudioPort譲渡に統合される）。
    this.worker?.postMessage({ type: "setSampleRate", rate: ctx.sampleRate });
  }

  /** ブラウザの自動再生ポリシー対応のため、ユーザー操作イベント内で呼び出す。 */
  resume(): void {
    this.ensureStarted();
    void this.ctx?.resume();
  }

  /**
   * 「音源」タブの試聴用: DSLの playTone(channel, noteIndex, duration) と同じ音を、
   * ゲーム実行状態（update()によるチャンネル上書き）とは独立に単発再生する。
   * noteIndexの意味はplayTone()と同じ（Pulse/Triangleは0-35の音階、Noiseのみ0-15の周期インデックス）。
   */
  previewTone(channel: 0 | 1 | 2 | 3, noteIndex: number, durationFrames: number): void {
    this.ensureStarted();
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume();

    const now = ctx.currentTime;
    const durationSec = Math.max(1, durationFrames) / 60;
    const gain = ctx.createGain();
    gain.gain.value = CHANNEL_GAIN;
    gain.connect(ctx.destination);
    gain.gain.setTargetAtTime(0, now + durationSec, 0.02);

    if (channel === 3) {
      const bufferSize = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = Math.max(0.05, Math.min(4, noiseIndexToPlaybackRate(noteIndex)));
      source.connect(gain);
      source.start(now);
      source.stop(now + durationSec + 0.1);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = channel === 2 ? "triangle" : "square";
    osc.frequency.value = noteIndexToFreq(noteIndex);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + durationSec + 0.1);
  }

  /**
   * Phase 1限定の暫定経路: nesWorker.tsから届いたPCMサンプル（"audioSamples"メッセージ）
   * をAudioWorkletへ中継する。Phase 2でworklet nodeの`.port`自体をWorkerへ譲渡し、
   * メインスレッドを経由しない直接配信に置き換えたらこのメソッドは削除する。
   */
  deliverSamples(samples: Float32Array): void {
    if (!this.workletReady || !this.workletNode || samples.length === 0) return;
    this.workletNode.port.postMessage(samples, [samples.buffer]);
  }
}
