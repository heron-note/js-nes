/**
 * NES APU（Ricoh 2A03音源部）のサイクル駆動実装（Phase 5a: フルAPU書き換え）。
 *
 * M5時点では「レジスタ生値を保持し、そこから毎フレーム導出したスナップショットを
 * 提供するだけ」の簡易実装だったが、ここでは実機同様にCPUサイクル単位でフレーム
 * シーケンサ・エンベロープ・スイープ・レングスカウンタ・三角波のリニアカウンタ・
 * 実機のLFSRノイズ・DMCチャンネルを内部でクロック駆動する。
 *
 * 外部公開API（cpuRead/cpuWrite/getChannelState/reset）の形は変えていない
 * （呼び出し側のapps/web/src/audio.tsは無改造で動く）。getChannelState()が返す
 * 値の「精度」が上がった（constant-volume=0時の実エンベロープ減衰、スイープ後の
 * 実周波数、実レングスカウンタによる有効/無効判定）のが今回の変更点。
 *
 * 重要な安全制約: packages/dsl-compiler の play_tone/sound_tick ランタイムは、
 * 矩形波/ノイズには常に halt=1 + constant-volume=1、三角波には常に halt=1で
 * レジスタを書く。これは「エンベロープ減衰・レングスカウンタの自動サイレンスを
 * 無効化する」という実機仕様そのものであり、実機同等の実装をすることがそのまま
 * 既存コンテンツの音の安全性と一致する（DSL専用の特別分岐は一切不要）。
 *
 * 既知の簡略化:
 * - DMCのメモリ読み出しによるCPUサイクルの盗み（stall）は再現しない。
 * - フレームシーケンサの書き込み後ディレイ（実機は3-4サイクル後に反映）は
 *   即座反映として近似する。
 */

const CPU_CLOCK_NTSC = 1789773;

/** レングスカウンタのロード値テーブル（$4003等のbit3-7でインデックス、実機固定値）。 */
const LENGTH_TABLE = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16,
  28, 32, 30,
];

/** 矩形波のデューティ比別波形テーブル（8ステップ、1=不透明/出力あり）。 */
const DUTY_TABLE: readonly (readonly number[])[] = [
  [0, 1, 0, 0, 0, 0, 0, 0], // 12.5%
  [0, 1, 1, 0, 0, 0, 0, 0], // 25%
  [0, 1, 1, 1, 1, 0, 0, 0], // 50%
  [1, 0, 0, 1, 1, 1, 1, 1], // 75%(25%の反転)
];

/** 三角波の32ステップシーケンス（15→0→0→15を繰り返す）。 */
const TRIANGLE_SEQUENCE = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

/** NTSC版ノイズチャンネルの周期テーブル（$400Eの下位4ビットでインデックス、実機固定値）。 */
const NOISE_PERIOD_TABLE = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 1524, 2034];

/** NTSC版DMCのレート（再生速度）テーブル（$4010の下位4ビットでインデックス、CPUサイクル単位）。 */
const DMC_RATE_TABLE = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];

export type ApuChannel = 0 | 1 | 2 | 3; // 0=Pulse1, 1=Pulse2, 2=Triangle, 3=Noise

export interface ChannelSnapshot {
  enabled: boolean;
  /** 0-15。constant-volume時はその値、そうでなければ実エンベロープの減衰後の値。 */
  volume: number;
  frequencyHz: number;
  /** Pulseのみ意味を持つ（デューティ比 0-3）。それ以外は0。 */
  duty: number;
}

class PulseUnit {
  duty = 0;
  lengthHalt = false; // レングスカウンタ停止 兼 エンベロープループ
  constantVolume = false;
  volumeOrEnvelopePeriod = 0;

  sweepEnabled = false;
  sweepPeriod = 0;
  sweepNegate = false;
  sweepShift = 0;
  sweepReload = false;
  sweepDivider = 0;

  timerPeriod = 0;
  timer = 0;
  dutyStep = 0;

  lengthCounterLoad = 0;
  lengthCounter = 0;

  envelopeStart = false;
  envelopeDivider = 0;
  envelopeDecay = 0;

  channelEnabled = false; // $4015のこのチャンネルのビット

  constructor(private readonly isChannel1: boolean) {}

  writeReg0(v: number): void {
    this.duty = (v >> 6) & 0x03;
    this.lengthHalt = (v & 0x20) !== 0;
    this.constantVolume = (v & 0x10) !== 0;
    this.volumeOrEnvelopePeriod = v & 0x0f;
  }
  writeReg1(v: number): void {
    this.sweepEnabled = (v & 0x80) !== 0;
    this.sweepPeriod = (v >> 4) & 0x07;
    this.sweepNegate = (v & 0x08) !== 0;
    this.sweepShift = v & 0x07;
    this.sweepReload = true;
  }
  writeReg2(v: number): void {
    this.timerPeriod = (this.timerPeriod & 0x700) | v;
  }
  writeReg3(v: number): void {
    this.timerPeriod = (this.timerPeriod & 0xff) | ((v & 0x07) << 8);
    this.lengthCounterLoad = (v >> 3) & 0x1f;
    if (this.channelEnabled) this.lengthCounter = LENGTH_TABLE[this.lengthCounterLoad] ?? 0;
    this.dutyStep = 0;
    this.envelopeStart = true;
  }

  setChannelEnabled(enabled: boolean): void {
    this.channelEnabled = enabled;
    if (!enabled) this.lengthCounter = 0;
  }

  clockTimer(): void {
    if (this.timer === 0) {
      this.timer = this.timerPeriod;
      this.dutyStep = (this.dutyStep + 1) & 0x07;
    } else {
      this.timer--;
    }
  }

  clockEnvelope(): void {
    if (this.envelopeStart) {
      this.envelopeStart = false;
      this.envelopeDecay = 15;
      this.envelopeDivider = this.volumeOrEnvelopePeriod;
      return;
    }
    if (this.envelopeDivider > 0) {
      this.envelopeDivider--;
      return;
    }
    this.envelopeDivider = this.volumeOrEnvelopePeriod;
    if (this.envelopeDecay > 0) this.envelopeDecay--;
    else if (this.lengthHalt) this.envelopeDecay = 15; // loopビット兼用
  }

  private sweepTargetPeriod(): number {
    const change = this.timerPeriod >> this.sweepShift;
    if (!this.sweepNegate) return this.timerPeriod + change;
    return this.isChannel1 ? this.timerPeriod - change - 1 : this.timerPeriod - change;
  }

  get sweepMuted(): boolean {
    return this.timerPeriod < 8 || this.sweepTargetPeriod() > 0x7ff;
  }

  clockSweep(): void {
    const target = this.sweepTargetPeriod();
    if (this.sweepDivider === 0 && this.sweepEnabled && this.sweepShift > 0 && !this.sweepMuted) {
      this.timerPeriod = target;
    }
    if (this.sweepDivider === 0 || this.sweepReload) {
      this.sweepDivider = this.sweepPeriod;
      this.sweepReload = false;
    } else {
      this.sweepDivider--;
    }
  }

  clockLength(): void {
    if (!this.lengthHalt && this.lengthCounter > 0) this.lengthCounter--;
  }

  get currentVolume(): number {
    return this.constantVolume ? this.volumeOrEnvelopePeriod : this.envelopeDecay;
  }

  get outputLevel(): number {
    if (this.lengthCounter === 0 || this.sweepMuted) return 0;
    if ((DUTY_TABLE[this.duty]?.[this.dutyStep] ?? 0) === 0) return 0;
    return this.currentVolume;
  }

  snapshot(): ChannelSnapshot {
    const enabled = this.channelEnabled && this.lengthCounter > 0 && !this.sweepMuted && this.currentVolume > 0;
    const frequencyHz = this.timerPeriod > 0 ? CPU_CLOCK_NTSC / (16 * (this.timerPeriod + 1)) : 0;
    return { enabled, volume: this.currentVolume, frequencyHz, duty: this.duty };
  }
}

class TriangleUnit {
  lengthHalt = false; // = リニアカウンタのcontrolビットと共用
  linearCounterReload = 0;
  linearCounterReloadFlag = false;
  linearCounter = 0;

  timerPeriod = 0;
  timer = 0;
  sequenceStep = 0;

  lengthCounterLoad = 0;
  lengthCounter = 0;
  channelEnabled = false;

  writeReg0(v: number): void {
    this.lengthHalt = (v & 0x80) !== 0;
    this.linearCounterReload = v & 0x7f;
  }
  writeReg2(v: number): void {
    this.timerPeriod = (this.timerPeriod & 0x700) | v;
  }
  writeReg3(v: number): void {
    this.timerPeriod = (this.timerPeriod & 0xff) | ((v & 0x07) << 8);
    this.lengthCounterLoad = (v >> 3) & 0x1f;
    if (this.channelEnabled) this.lengthCounter = LENGTH_TABLE[this.lengthCounterLoad] ?? 0;
    this.linearCounterReloadFlag = true;
  }

  setChannelEnabled(enabled: boolean): void {
    this.channelEnabled = enabled;
    if (!enabled) this.lengthCounter = 0;
  }

  clockTimer(): void {
    if (this.timer === 0) {
      this.timer = this.timerPeriod;
      if (this.lengthCounter > 0 && this.linearCounter > 0) {
        this.sequenceStep = (this.sequenceStep + 1) & 0x1f;
      }
    } else {
      this.timer--;
    }
  }

  clockLinearCounter(): void {
    if (this.linearCounterReloadFlag) {
      this.linearCounter = this.linearCounterReload;
    } else if (this.linearCounter > 0) {
      this.linearCounter--;
    }
    if (!this.lengthHalt) this.linearCounterReloadFlag = false;
  }

  clockLength(): void {
    if (!this.lengthHalt && this.lengthCounter > 0) this.lengthCounter--;
  }

  get outputLevel(): number {
    if (this.lengthCounter === 0 || this.linearCounter === 0) return 0;
    return TRIANGLE_SEQUENCE[this.sequenceStep] ?? 0;
  }

  snapshot(): ChannelSnapshot {
    const enabled = this.channelEnabled && this.lengthCounter > 0 && this.linearCounter > 0;
    const frequencyHz = this.timerPeriod > 0 ? CPU_CLOCK_NTSC / (32 * (this.timerPeriod + 1)) : 0;
    return { enabled, volume: enabled ? 15 : 0, frequencyHz, duty: 0 };
  }
}

class NoiseUnit {
  lengthHalt = false;
  constantVolume = false;
  volumeOrEnvelopePeriod = 0;

  mode = false; // true=short(bit6タップ), false=long(bit1タップ)
  periodIndex = 0;
  timer = 0;
  shiftRegister = 1;

  lengthCounterLoad = 0;
  lengthCounter = 0;
  channelEnabled = false;

  envelopeStart = false;
  envelopeDivider = 0;
  envelopeDecay = 0;

  writeReg0(v: number): void {
    this.lengthHalt = (v & 0x20) !== 0;
    this.constantVolume = (v & 0x10) !== 0;
    this.volumeOrEnvelopePeriod = v & 0x0f;
  }
  writeReg2(v: number): void {
    this.mode = (v & 0x80) !== 0;
    this.periodIndex = v & 0x0f;
  }
  writeReg3(v: number): void {
    this.lengthCounterLoad = (v >> 3) & 0x1f;
    if (this.channelEnabled) this.lengthCounter = LENGTH_TABLE[this.lengthCounterLoad] ?? 0;
    this.envelopeStart = true;
  }

  setChannelEnabled(enabled: boolean): void {
    this.channelEnabled = enabled;
    if (!enabled) this.lengthCounter = 0;
  }

  clockTimer(): void {
    if (this.timer === 0) {
      this.timer = NOISE_PERIOD_TABLE[this.periodIndex] ?? 1;
      const bit0 = this.shiftRegister & 1;
      const tapBit = this.mode ? (this.shiftRegister >> 6) & 1 : (this.shiftRegister >> 1) & 1;
      const feedback = bit0 ^ tapBit;
      this.shiftRegister = (this.shiftRegister >> 1) | (feedback << 14);
    } else {
      this.timer--;
    }
  }

  clockEnvelope(): void {
    if (this.envelopeStart) {
      this.envelopeStart = false;
      this.envelopeDecay = 15;
      this.envelopeDivider = this.volumeOrEnvelopePeriod;
      return;
    }
    if (this.envelopeDivider > 0) {
      this.envelopeDivider--;
      return;
    }
    this.envelopeDivider = this.volumeOrEnvelopePeriod;
    if (this.envelopeDecay > 0) this.envelopeDecay--;
    else if (this.lengthHalt) this.envelopeDecay = 15;
  }

  clockLength(): void {
    if (!this.lengthHalt && this.lengthCounter > 0) this.lengthCounter--;
  }

  get currentVolume(): number {
    return this.constantVolume ? this.volumeOrEnvelopePeriod : this.envelopeDecay;
  }

  get outputLevel(): number {
    if (this.lengthCounter === 0) return 0;
    if ((this.shiftRegister & 1) !== 0) return 0; // bit0が1のときは無音
    return this.currentVolume;
  }

  snapshot(): ChannelSnapshot {
    const enabled = this.channelEnabled && this.lengthCounter > 0 && this.currentVolume > 0;
    const periodValue = NOISE_PERIOD_TABLE[this.periodIndex] ?? 1;
    return { enabled, volume: this.currentVolume, frequencyHz: CPU_CLOCK_NTSC / periodValue, duty: 0 };
  }
}

class DmcUnit {
  irqEnabled = false;
  loop = false;
  rateIndex = 0;
  timerPeriod = 428;
  timer = 0;

  sampleAddress = 0xc000;
  sampleLength = 1;
  currentAddress = 0;
  bytesRemaining = 0;

  sampleBuffer = 0;
  sampleBufferEmpty = true;
  shiftRegister = 0;
  bitsRemaining = 8;
  silence = true;

  outputLevel = 0; // 0-127
  irqFlag = false;
  channelEnabled = false;

  constructor(private readonly readMemory: (addr: number) => number) {}

  writeReg0(v: number): void {
    this.irqEnabled = (v & 0x80) !== 0;
    this.loop = (v & 0x40) !== 0;
    this.rateIndex = v & 0x0f;
    this.timerPeriod = DMC_RATE_TABLE[this.rateIndex] ?? 428;
    if (!this.irqEnabled) this.irqFlag = false;
  }
  writeReg1(v: number): void {
    this.outputLevel = v & 0x7f;
  }
  writeReg2(v: number): void {
    this.sampleAddress = 0xc000 + v * 64;
  }
  writeReg3(v: number): void {
    this.sampleLength = v * 16 + 1;
  }

  setChannelEnabled(enabled: boolean): void {
    this.channelEnabled = enabled;
    if (!enabled) {
      this.bytesRemaining = 0;
    } else if (this.bytesRemaining === 0) {
      this.currentAddress = this.sampleAddress;
      this.bytesRemaining = this.sampleLength;
    }
  }

  clockTimer(): void {
    if (this.timer === 0) {
      this.timer = this.timerPeriod;
      this.clockOutput();
    } else {
      this.timer--;
    }
  }

  private clockOutput(): void {
    if (this.bitsRemaining === 0) {
      this.bitsRemaining = 8;
      if (this.sampleBufferEmpty) {
        this.silence = true;
      } else {
        this.silence = false;
        this.shiftRegister = this.sampleBuffer;
        this.sampleBufferEmpty = true;
      }
    }
    if (!this.silence) {
      const bit = this.shiftRegister & 1;
      if (bit === 1) {
        if (this.outputLevel <= 125) this.outputLevel += 2;
      } else if (this.outputLevel >= 2) {
        this.outputLevel -= 2;
      }
    }
    this.shiftRegister >>= 1;
    this.bitsRemaining--;

    if (this.sampleBufferEmpty && this.bytesRemaining > 0) {
      this.fetchByte();
    }
  }

  private fetchByte(): void {
    this.sampleBuffer = this.readMemory(this.currentAddress) & 0xff;
    this.sampleBufferEmpty = false;
    this.currentAddress = this.currentAddress === 0xffff ? 0x8000 : this.currentAddress + 1;
    this.bytesRemaining--;
    if (this.bytesRemaining === 0) {
      if (this.loop) {
        this.currentAddress = this.sampleAddress;
        this.bytesRemaining = this.sampleLength;
      } else if (this.irqEnabled) {
        this.irqFlag = true;
      }
    }
  }
}

export class Apu {
  private readonly pulse1 = new PulseUnit(true);
  private readonly pulse2 = new PulseUnit(false);
  private readonly triangle = new TriangleUnit();
  private readonly noise = new NoiseUnit();
  private readonly dmc: DmcUnit;

  private frameMode: 0 | 1 = 0;
  private frameIrqInhibit = false;
  private frameIrqFlag = false;
  private frameCycle = 0;
  private cpuCycleCounter = 0;

  // Phase 5b: PCMサンプル生成（AudioWorklet出力用）。CPUクロックを出力サンプルレートへ
  // ダウンサンプリングするための誤差蓄積式カウンタ（ブレゼンハム法と同じ考え方）。
  private outputSampleRate = 44100;
  private sampleCycleAccumulator = 0;
  private readonly sampleBuffer: number[] = [];
  // 出力サンプル間で経過した全CPUサイクルぶんの合成値を平均する簡易アンチエイリアシング
  // （ボックスフィルタ）。単純に「出力する瞬間の1サイクルだけを点サンプリング」すると、
  // 高音域のパルス波やノイズ波形はCPUサイクル間隔(1.79MHz)で何度も0/1が切り替わるため、
  // 44.1kHzへ間引く際に高調波が折り返してザラついたノイズ的な音になる（エイリアシング）。
  private sampleAccum = 0;
  private sampleAccumCount = 0;

  constructor(readMemory: (addr: number) => number = () => 0) {
    this.dmc = new DmcUnit(readMemory);
  }

  /** 出力サンプルレートを設定する（AudioContext.sampleRateに合わせる）。 */
  setSampleRate(rate: number): void {
    this.outputSampleRate = rate;
  }

  /** 前回の呼び出し以降にstep()で蓄積されたPCMサンプル列を取り出し、内部バッファを空にする。 */
  drainSamples(): Float32Array {
    const out = Float32Array.from(this.sampleBuffer);
    this.sampleBuffer.length = 0;
    return out;
  }

  reset(): void {
    this.pulse1.writeReg0(0);
    this.pulse1.writeReg1(0);
    this.pulse1.writeReg2(0);
    this.pulse1.setChannelEnabled(false);
    this.pulse2.writeReg0(0);
    this.pulse2.writeReg1(0);
    this.pulse2.writeReg2(0);
    this.pulse2.setChannelEnabled(false);
    this.triangle.writeReg0(0);
    this.triangle.writeReg2(0);
    this.triangle.setChannelEnabled(false);
    this.noise.writeReg0(0);
    this.noise.writeReg2(0);
    this.noise.setChannelEnabled(false);
    this.dmc.setChannelEnabled(false);
    this.frameMode = 0;
    this.frameIrqInhibit = false;
    this.frameIrqFlag = false;
    this.frameCycle = 0;
    this.cpuCycleCounter = 0;
    this.sampleCycleAccumulator = 0;
    this.sampleBuffer.length = 0;
    this.sampleAccum = 0;
    this.sampleAccumCount = 0;
  }

  cpuWrite(addr: number, value: number): void {
    const v = value & 0xff;
    if (addr >= 0x4000 && addr <= 0x4003) {
      this.writePulseReg(this.pulse1, addr - 0x4000, v);
      return;
    }
    if (addr >= 0x4004 && addr <= 0x4007) {
      this.writePulseReg(this.pulse2, addr - 0x4004, v);
      return;
    }
    if (addr >= 0x4008 && addr <= 0x400b) {
      const reg = addr - 0x4008;
      if (reg === 0) this.triangle.writeReg0(v);
      else if (reg === 2) this.triangle.writeReg2(v);
      else if (reg === 3) this.triangle.writeReg3(v);
      return;
    }
    if (addr >= 0x400c && addr <= 0x400f) {
      const reg = addr - 0x400c;
      if (reg === 0) this.noise.writeReg0(v);
      else if (reg === 2) this.noise.writeReg2(v);
      else if (reg === 3) this.noise.writeReg3(v);
      return;
    }
    if (addr >= 0x4010 && addr <= 0x4013) {
      const reg = addr - 0x4010;
      if (reg === 0) this.dmc.writeReg0(v);
      else if (reg === 1) this.dmc.writeReg1(v);
      else if (reg === 2) this.dmc.writeReg2(v);
      else if (reg === 3) this.dmc.writeReg3(v);
      return;
    }
    if (addr === 0x4015) {
      this.pulse1.setChannelEnabled((v & 0x01) !== 0);
      this.pulse2.setChannelEnabled((v & 0x02) !== 0);
      this.triangle.setChannelEnabled((v & 0x04) !== 0);
      this.noise.setChannelEnabled((v & 0x08) !== 0);
      this.dmc.setChannelEnabled((v & 0x10) !== 0);
      this.dmc.irqFlag = false;
      return;
    }
    if (addr === 0x4017) {
      this.frameMode = v & 0x80 ? 1 : 0;
      this.frameIrqInhibit = (v & 0x40) !== 0;
      if (this.frameIrqInhibit) this.frameIrqFlag = false;
      this.frameCycle = 0;
      if (this.frameMode === 1) {
        this.clockQuarterFrame();
        this.clockHalfFrame();
      }
      return;
    }
  }

  private writePulseReg(unit: PulseUnit, reg: number, v: number): void {
    if (reg === 0) unit.writeReg0(v);
    else if (reg === 1) unit.writeReg1(v);
    else if (reg === 2) unit.writeReg2(v);
    else if (reg === 3) unit.writeReg3(v);
  }

  cpuRead(addr: number): number {
    if (addr === 0x4015) {
      const v =
        (this.dmc.irqFlag ? 0x80 : 0) |
        (this.frameIrqFlag ? 0x40 : 0) |
        (this.dmc.bytesRemaining > 0 ? 0x10 : 0) |
        (this.noise.lengthCounter > 0 ? 0x08 : 0) |
        (this.triangle.lengthCounter > 0 ? 0x04 : 0) |
        (this.pulse2.lengthCounter > 0 ? 0x02 : 0) |
        (this.pulse1.lengthCounter > 0 ? 0x01 : 0);
      this.frameIrqFlag = false;
      return v;
    }
    return 0;
  }

  /** CPU 1サイクルぶんAPUを進める。Nes.runFrame()からcpu.step()の戻り値サイクル数だけ呼ばれる。 */
  step(): void {
    this.cpuCycleCounter++;
    this.triangle.clockTimer(); // 三角波はCPUと同じレートでクロックされる
    if (this.cpuCycleCounter % 2 === 0) {
      this.pulse1.clockTimer();
      this.pulse2.clockTimer();
      this.noise.clockTimer();
      this.dmc.clockTimer();
    }
    this.clockFrameSequencer();

    // 今回のCPUサイクルの合成値をアンチエイリアシング用に積算しておく。
    this.sampleAccum += this.getMixedSample();
    this.sampleAccumCount++;

    // CPUクロック(1789773Hz)を出力サンプルレートへダウンサンプリングする。
    // 誤差を蓄積し、CPU_CLOCK_NTSC分溜まるたびに1サンプル出力することで、
    // 割り切れない比率でも長期的に正しい平均レートになる。出力するサンプル自体は
    // その瞬間の1点だけでなく、直前の出力からの全CPUサイクル分の平均値
    // （ボックスフィルタ）にすることで、点サンプリングによる高調波の折り返し
    // （エイリアシング＝ザラついたノイズ的な音）を抑える。
    this.sampleCycleAccumulator += this.outputSampleRate;
    if (this.sampleCycleAccumulator >= CPU_CLOCK_NTSC) {
      this.sampleCycleAccumulator -= CPU_CLOCK_NTSC;
      this.sampleBuffer.push(this.sampleAccum / this.sampleAccumCount);
      this.sampleAccum = 0;
      this.sampleAccumCount = 0;
    }
  }

  private clockFrameSequencer(): void {
    this.frameCycle++;
    if (this.frameMode === 0) {
      switch (this.frameCycle) {
        case 7457:
          this.clockQuarterFrame();
          break;
        case 14913:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          break;
        case 22371:
          this.clockQuarterFrame();
          break;
        case 29829:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          if (!this.frameIrqInhibit) this.frameIrqFlag = true;
          this.frameCycle = 0;
          break;
      }
    } else {
      switch (this.frameCycle) {
        case 7457:
          this.clockQuarterFrame();
          break;
        case 14913:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          break;
        case 22371:
          this.clockQuarterFrame();
          break;
        case 37281:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          this.frameCycle = 0;
          break;
      }
    }
  }

  private clockQuarterFrame(): void {
    this.pulse1.clockEnvelope();
    this.pulse2.clockEnvelope();
    this.noise.clockEnvelope();
    this.triangle.clockLinearCounter();
  }

  private clockHalfFrame(): void {
    this.pulse1.clockLength();
    this.pulse2.clockLength();
    this.triangle.clockLength();
    this.noise.clockLength();
    this.pulse1.clockSweep();
    this.pulse2.clockSweep();
  }

  /** フレームIRQ・DMC IRQ（どちらもレベル型でCPUの共通IRQ線を共有する）。 */
  irqPending(): boolean {
    return this.frameIrqFlag || this.dmc.irqFlag;
  }

  getChannelState(channel: ApuChannel): ChannelSnapshot {
    switch (channel) {
      case 0:
        return this.pulse1.snapshot();
      case 1:
        return this.pulse2.snapshot();
      case 2:
        return this.triangle.snapshot();
      case 3:
        return this.noise.snapshot();
    }
  }

  /**
   * 現在の瞬間の合成済み出力サンプル（0.0-1.0程度、実機のミキサー式に基づく非線形合成）。
   * Phase 5b（AudioWorklet出力）で使用する。
   */
  getMixedSample(): number {
    const p1 = this.pulse1.outputLevel;
    const p2 = this.pulse2.outputLevel;
    const t = this.triangle.outputLevel;
    const n = this.noise.outputLevel;
    const d = this.dmc.outputLevel;

    const pulseSum = p1 + p2;
    const pulseOut = pulseSum > 0 ? 95.88 / (8128 / pulseSum + 100) : 0;

    const tndSum = t / 8227 + n / 12241 + d / 22638;
    const tndOut = tndSum > 0 ? 159.79 / (1 / tndSum + 100) : 0;

    return pulseOut + tndOut;
  }
}
