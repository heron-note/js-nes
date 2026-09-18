// NESオーディオ出力用のAudioWorkletProcessor（Phase 5b）。
// Worker から届く PCM チャンクをキューし、process() で吐き出す。
// AudioContext が suspended のあいだに溜まった遅延が回復不能になるのを防ぐため、
// キュー上限（約 80ms）を超えたら古いデータを捨て、flush メッセージで全クリアする。

class NesAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.chunkIndex = 0;
    this.queuedSamples = 0;
    this.lastSample = 0;
    // sampleRate は AudioWorkletGlobalScope の組み込み
    this.maxQueued = Math.floor(sampleRate * 0.08);
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "flush") {
        this.chunks = [];
        this.chunkIndex = 0;
        this.queuedSamples = 0;
        return;
      }
      if (data && data.length > 0) {
        this.chunks.push(data);
        this.queuedSamples += data.length;
        // 遅延蓄積時は最新だけ残す（ずっと遅れ続けるのを防ぐ）
        while (this.queuedSamples > this.maxQueued && this.chunks.length > 0) {
          if (this.chunks.length === 1) {
            const only = this.chunks[0];
            const remain = only.length - this.chunkIndex;
            if (remain > this.maxQueued) {
              this.chunkIndex = only.length - this.maxQueued;
              this.queuedSamples = this.maxQueued;
            }
            break;
          }
          const dropped = this.chunks.shift();
          this.queuedSamples -= dropped.length;
          this.chunkIndex = 0;
        }
        if (this.queuedSamples < 0) this.queuedSamples = 0;
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
          this.queuedSamples--;
          break;
        }
        this.chunks.shift();
        this.chunkIndex = 0;
      }
      if (this.queuedSamples < 0) this.queuedSamples = 0;
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
