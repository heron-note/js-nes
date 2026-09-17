// NESオーディオ出力用のAudioWorkletProcessor（Phase 5b）。
// メインスレッド側（audio.ts）がnes.apu.drainSamples()で取り出したPCMサンプルの
// チャンク(Float32Array)をpostMessageで送ってくるので、それをキューに溜めて
// process()の呼び出し（128サンプル単位）ごとに順番に取り出して出力する。
// 意図的に素のJavaScriptで書いている（Blob URL経由でロードするため、TypeScriptの
// トランスパイル無しでそのまま実行できる必要がある。apps/web/src/audio.tsが
// `?raw`でこのファイルのソースをそのまま読み込み、Blob化してaddModule()する）。

class NesAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.chunkIndex = 0;
    this.lastSample = 0;
    this.port.onmessage = (event) => {
      if (event.data && event.data.length > 0) {
        this.chunks.push(event.data);
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const channel0 = output && output[0];
    if (!channel0) return true;

    for (let i = 0; i < channel0.length; i++) {
      let sample = this.lastSample;
      while (this.chunks.length > 0) {
        const current = this.chunks[0];
        if (this.chunkIndex < current.length) {
          sample = current[this.chunkIndex];
          this.chunkIndex++;
          break;
        }
        this.chunks.shift();
        this.chunkIndex = 0;
      }
      this.lastSample = sample;
      channel0[i] = sample;
    }
    for (let c = 1; c < output.length; c++) {
      output[c].set(channel0);
    }
    return true;
  }
}

registerProcessor("nes-audio-processor", NesAudioProcessor);
