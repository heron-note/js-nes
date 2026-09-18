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
 * AudioWorkletNodeの`.port`自体の所有権をWorkerへ譲渡することで、以後は
 * メインスレッドを一切経由せずWorker→AudioWorkletProcessorへ直接配信される
 * （Phase 2、Web.dev「audio worklet design pattern: state and worker」等で
 * 確立されたパターン）。譲渡後はメインスレッド側で`workletNode.port`を
 * 使うことはできなくなる（意図的）。
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
  private worker: Worker | null = null;
  private workletSetup: Promise<void> | null = null;
  private workletReady = false;

  /** main.ts起動時、ユーザー操作を待つ前に一度だけ呼ぶ（参照を保持するだけで副作用は無い）。 */
  setWorker(worker: Worker): void {
    this.worker = worker;
  }

  private createContext(): AudioContext {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error("AudioContext 非対応");
    return new AC();
  }

  /** iOS Safari: ユーザー操作の同期スタック内で無音を1サンプル鳴らしてアンロックする。 */
  private unlockSync(ctx: AudioContext): void {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // ignore
    }
  }

  private setAudioStreaming(enabled: boolean): void {
    this.worker?.postMessage({ type: "audioControl", enabled });
  }

  private bindContextState(ctx: AudioContext): void {
    ctx.onstatechange = () => {
      this.setAudioStreaming(ctx.state === "running");
    };
  }

  private ensureStarted(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.createContext();
      this.bindContextState(this.ctx);
      this.setAudioStreaming(false);
    }
    if (!this.workletSetup) {
      this.workletSetup = this.setupWorklet(this.ctx).catch((err) => {
        this.workletSetup = null;
        console.error("[audio] worklet setup failed", err);
        throw err;
      });
    }
    return this.ctx;
  }

  private async setupWorklet(ctx: AudioContext): Promise<void> {
    if (this.workletReady) return;
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
    // worklet nodeの`.port`の所有権をそのままWorkerへ譲渡する。これ以降Workerは
    // メインスレッドを一切経由せず、このportへ直接PCMサンプルをpostMessageできる。
    // 送信開始は audioControl(enabled:true) まで待つ（suspended 中の遅延蓄積防止）。
    this.worker?.postMessage({ type: "audioPort", port: node.port, sampleRate: ctx.sampleRate }, [
      node.port,
    ]);
    this.workletReady = true;
    if (ctx.state === "running") {
      this.setAudioStreaming(true);
    }
  }

  /**
   * モバイル自動再生ポリシー対応。必ずタップ／キー操作のイベント内から呼ぶ。
   * iOS は await 後にユーザー活性化が切れることがあるため、同期でアンロックしてから resume する。
   */
  async resume(): Promise<void> {
    const ctx = this.ensureStarted();
    this.unlockSync(ctx);
    if (ctx.state === "suspended") {
      this.setAudioStreaming(false);
      try {
        await ctx.resume();
      } catch (err) {
        console.warn("[audio] resume failed", err);
      }
    }
    try {
      await this.workletSetup;
    } catch {
      // setupWorklet が失敗しても、再タップでリトライできるよう workletSetup はクリア済み
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }
    this.setAudioStreaming(ctx.state === "running");
  }

  /** まだ suspended なら再試行（パッド操作のたびに呼んでよい）。 */
  kick(): void {
    const ctx = this.ctx;
    if (!ctx) {
      void this.resume();
      return;
    }
    this.unlockSync(ctx);
    if (ctx.state === "suspended") {
      this.setAudioStreaming(false);
      void ctx.resume().then(() => {
        this.setAudioStreaming(this.ctx?.state === "running");
      });
    } else if (ctx.state === "running") {
      this.setAudioStreaming(true);
    }
    if (!this.workletReady && !this.workletSetup) {
      void this.resume();
    }
  }

  /**
   * 「音源」タブの試聴用: DSLの playTone(channel, noteIndex, duration) と同じ音を、
   * ゲーム実行状態（update()によるチャンネル上書き）とは独立に単発再生する。
   * noteIndexの意味はplayTone()と同じ（Pulse/Triangleは0-35の音階、Noiseのみ0-15の周期インデックス）。
   */
  previewTone(channel: 0 | 1 | 2 | 3, noteIndex: number, durationFrames: number): void {
    void this.resume().then(() => {
      const ctx = this.ctx;
      if (!ctx) return;

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
    });
  }
}
