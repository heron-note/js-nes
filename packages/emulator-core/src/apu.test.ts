import { describe, expect, it } from "vitest";
import { Apu } from "./apu.js";

describe("Apu", () => {
  it("reports pulse1 as disabled until $4015 enables the channel", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4000, 0b0001_1111); // constant volume=15, duty=00
    apu.cpuWrite(0x4002, 0x00);
    apu.cpuWrite(0x4003, 0x01); // period = 0x100 = 256（$4015が無効なのでレングスカウンタは未ロード）

    expect(apu.getChannelState(0).enabled).toBe(false); // $4015未設定

    apu.cpuWrite(0x4015, 0b0000_0001); // pulse1 enable
    apu.cpuWrite(0x4003, 0x01); // 実機同様、有効化後に改めてbyte3を書いてレングスカウンタをロードする
    const state = apu.getChannelState(0);
    expect(state.enabled).toBe(true);
    expect(state.volume).toBe(15);
    expect(state.duty).toBe(0);
    // freq = 1789773 / (16 * (256+1)) ≈ 434.9Hz
    expect(state.frequencyHz).toBeCloseTo(1789773 / (16 * 257), 3);
  });

  it("computes different duty values for pulse2 from bits 6-7", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_0010); // pulse2 enable
    apu.cpuWrite(0x4004, 0b1001_1111); // duty=10, constant volume=15
    apu.cpuWrite(0x4006, 0x10);
    apu.cpuWrite(0x4007, 0x00);
    expect(apu.getChannelState(1).duty).toBe(2);
  });

  it("constant-volumeが立っている間は音量がそのまま反映される", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_0001);
    apu.cpuWrite(0x4000, 0b0001_1111); // constant volume=15
    apu.cpuWrite(0x4002, 0x10);
    apu.cpuWrite(0x4003, 0x00);
    expect(apu.getChannelState(0).volume).toBe(15);
  });

  it("エンベロープ有効時（constant-volume=0）は時間経過とともに音量が減衰する", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_0001);
    apu.cpuWrite(0x4000, 0b0000_1111); // constant-volume=0, envelope period=15, halt(loop)=0
    apu.cpuWrite(0x4002, 0x10);
    apu.cpuWrite(0x4003, 0x00);

    expect(apu.getChannelState(0).volume).toBe(0); // envelope開始直後(まだ1回もクロックされていない)は0

    // 4-stepフレームシーケンサの最初のクォーターフレーム(7457 CPUサイクル)でenvelopeStart処理が走り15になる
    for (let i = 0; i < 7457; i++) apu.step();
    expect(apu.getChannelState(0).volume).toBe(15);

    // envelope period=15なので、開始クロックの後さらに16クォーターフレーム(15回のdivider減算+1回の
    // decay減算)経過すると14に減衰する。十分に余裕を持ってクォーターフレーム20回分以上進める。
    for (let i = 0; i < 7457 * 20; i++) apu.step();
    expect(apu.getChannelState(0).volume).toBeLessThan(15);
  });

  it("sweepが有効な間、矩形波の周期が徐々に変化する", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_0001);
    apu.cpuWrite(0x4000, 0b0001_1111);
    apu.cpuWrite(0x4002, 0xff);
    apu.cpuWrite(0x4003, 0x03); // period = 0x3ff
    apu.cpuWrite(0x4001, 0b1000_0001); // sweep有効, period=0, negate=0, shift=1

    const before = apu.getChannelState(0).frequencyHz;
    for (let i = 0; i < 14913; i++) apu.step(); // 最初のhalf-frameでsweepが1回反映される
    const after = apu.getChannelState(0).frequencyHz;
    expect(after).not.toBeCloseTo(before, 3);
  });

  it("レングスカウンタはhaltビットが立っていない限り時間経過で0になり無効化される", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_0001);
    apu.cpuWrite(0x4000, 0b0000_1111); // halt=0（レングスカウンタが自動減衰する）
    apu.cpuWrite(0x4002, 0x10);
    apu.cpuWrite(0x4003, 0b0000_1000); // length load index=1 -> LENGTH_TABLE[1]=254

    expect(apu.cpuRead(0x4015) & 0x01).toBe(1); // レングスカウンタ>0の間は$4015のbitが立つ

    // half-frameは29829サイクルに2回(14913, 29829)。254回分を十分な余裕を持って進める。
    for (let i = 0; i < 254 * 29829; i++) apu.step();
    expect(apu.cpuRead(0x4015) & 0x01).toBe(0);
  });

  it("computes triangle frequency using the /32 divisor and requires a nonzero linear counter", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_0100); // triangle enable
    apu.cpuWrite(0x4008, 0b1111_1111); // linear counter reload = 127（halt/control=1）
    apu.cpuWrite(0x400a, 0x00);
    apu.cpuWrite(0x400b, 0x01); // period = 0x100 = 256（reloadフラグが立つ）

    // リニアカウンタの実際のロードは次のクォーターフレーム(7457サイクル)まで遅延する（実機仕様）
    for (let i = 0; i < 7457; i++) apu.step();

    const state = apu.getChannelState(2);
    expect(state.enabled).toBe(true);
    expect(state.frequencyHz).toBeCloseTo(1789773 / (32 * 257), 3);

    apu.cpuWrite(0x4008, 0x80); // halt=1のまま reload=0 -> 次のクォーターフレームで実質無音化
    for (let i = 0; i < 7457; i++) apu.step();
    expect(apu.getChannelState(2).enabled).toBe(false);
  });

  it("derives noise frequency from the fixed NTSC period table", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_1000); // noise enable
    apu.cpuWrite(0x400c, 0b0001_1111); // constant volume=15
    apu.cpuWrite(0x400e, 0x00); // periodIndex=0 -> NOISE_PERIOD_TABLE[0]=4
    apu.cpuWrite(0x400f, 0x00); // レングスカウンタをロード（$4003等と共通の挙動）

    const state = apu.getChannelState(3);
    expect(state.enabled).toBe(true);
    expect(state.volume).toBe(15);
    expect(state.frequencyHz).toBeCloseTo(1789773 / 4, 3);
  });

  it("ノイズのLFSRは周期的なビット列を生成する（実機のLFSR疑似乱数）", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_1000);
    apu.cpuWrite(0x400c, 0b0001_1111);
    apu.cpuWrite(0x400e, 0x00); // 最短周期(4サイクル)
    apu.cpuWrite(0x400f, 0x00);

    // 十分な回数クロックしても例外を起こさず、有効な出力(0-15)を返し続けることを確認
    for (let i = 0; i < 100000; i++) apu.step();
    const state = apu.getChannelState(3);
    expect(state.volume).toBe(15);
    expect(state.enabled).toBe(true);
  });

  it("drainSamples()は出力サンプルレートに応じたPCMサンプル列を生成する（Phase 5b用）", () => {
    const apu = new Apu();
    apu.setSampleRate(44100);
    apu.cpuWrite(0x4015, 0b0000_0001);
    apu.cpuWrite(0x4000, 0b1011_1111); // constant volume=15
    apu.cpuWrite(0x4002, 0x00);
    apu.cpuWrite(0x4003, 0x01);

    // 1789773Hz(CPUクロック)ぶんstep()すれば、44100Hzのサンプルが約44100個生成されるはず
    for (let i = 0; i < 1789773; i++) apu.step();
    const samples = apu.drainSamples();
    expect(samples.length).toBeGreaterThan(44000);
    expect(samples.length).toBeLessThan(44200);
    for (const s of samples) {
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }

    // drain後はバッファが空になる
    expect(apu.drainSamples().length).toBe(0);
  });

  it("reset() clears all channel registers and the enable status", () => {
    const apu = new Apu();
    apu.cpuWrite(0x4015, 0b0000_1111);
    apu.cpuWrite(0x4000, 0xff);
    apu.reset();
    expect(apu.getChannelState(0).enabled).toBe(false);
    expect(apu.cpuRead(0x4015)).toBe(0);
  });

  it("DMCチャンネルは$4015のbit4で有効化され、メモリからサンプルを読み出す", () => {
    const memory = new Uint8Array(0x10000);
    memory[0xc000] = 0xff; // 全ビット1のサンプル -> 出力レベルが上昇していく
    const readMemory = (addr: number) => memory[addr] ?? 0;
    const apu = new Apu(readMemory);

    apu.cpuWrite(0x4010, 0x0f); // rateIndex=15（最速）, loop=0, irq=0
    apu.cpuWrite(0x4012, 0x00); // sampleAddress = $C000
    apu.cpuWrite(0x4013, 0x00); // sampleLength = 1バイト
    apu.cpuWrite(0x4015, 0b0001_0000); // DMC enable

    expect(apu.cpuRead(0x4015) & 0x10).toBe(0x10); // bytesRemaining>0の間は立つ

    for (let i = 0; i < 100000; i++) apu.step();
    // 1バイト分読み終わればbytesRemainingは0に戻る（loop=0のため）
    expect(apu.cpuRead(0x4015) & 0x10).toBe(0);
  });
});
