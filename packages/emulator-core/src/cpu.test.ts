import { describe, expect, it } from "vitest";
import { Cpu6502, FLAG } from "./cpu.js";
import { MemoryBus } from "./testing/memory-bus.js";

function makeCpu(program: number[], start = 0x8000) {
  const bus = new MemoryBus();
  bus.mem.set(program, start);
  bus.mem[0xfffc] = start & 0xff;
  bus.mem[0xfffd] = (start >> 8) & 0xff;
  const cpu = new Cpu6502(bus);
  cpu.reset();
  return { cpu, bus };
}

describe("Cpu6502", () => {
  it("LDA immediate sets A and the Zero flag for 0", () => {
    const { cpu } = makeCpu([0xa9, 0x00]);
    const cycles = cpu.step();
    expect(cpu.a).toBe(0);
    expect(cpu.p & FLAG.Z).toBeTruthy();
    expect(cycles).toBe(2);
  });

  it("LDA immediate sets the Negative flag for values >= 0x80", () => {
    const { cpu } = makeCpu([0xa9, 0x80]);
    cpu.step();
    expect(cpu.a).toBe(0x80);
    expect(cpu.p & FLAG.N).toBeTruthy();
  });

  it("ADC sets Carry and Overflow correctly on signed overflow", () => {
    // LDA #$7F ; ADC #$01  => 127 + 1 = 128 (符号オーバーフロー、キャリーは立たない)
    const { cpu } = makeCpu([0xa9, 0x7f, 0x69, 0x01]);
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x80);
    expect(cpu.p & FLAG.V).toBeTruthy();
    expect(cpu.p & FLAG.C).toBeFalsy();
  });

  it("ADC sets Carry without Overflow on unsigned wraparound", () => {
    // LDA #$FF ; ADC #$01 => 255 + 1 = 0 (キャリー成立、符号オーバーフローなし)
    const { cpu } = makeCpu([0xa9, 0xff, 0x69, 0x01]);
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x00);
    expect(cpu.p & FLAG.C).toBeTruthy();
    expect(cpu.p & FLAG.V).toBeFalsy();
    expect(cpu.p & FLAG.Z).toBeTruthy();
  });

  it("STA/LDA round-trips a value through zero page", () => {
    // LDA #$42 ; STA $10 ; LDA #$00 ; LDA $10
    const { cpu, bus } = makeCpu([0xa9, 0x42, 0x85, 0x10, 0xa9, 0x00, 0xa5, 0x10]);
    cpu.step();
    cpu.step();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x42);
    expect(bus.mem[0x10]).toBe(0x42);
  });

  it("branch: not taken costs base cycles only", () => {
    // LDA #$01 ; BEQ +2 (Zフラグ立たないので分岐しない)
    const { cpu } = makeCpu([0xa9, 0x01, 0xf0, 0x02]);
    cpu.step();
    const cycles = cpu.step();
    expect(cycles).toBe(2);
  });

  it("branch: taken within the same page costs one extra cycle", () => {
    // LDA #$00 ; BEQ +0 (Zフラグが立つので分岐、同一ページ内)
    const { cpu } = makeCpu([0xa9, 0x00, 0xf0, 0x00]);
    cpu.step();
    const cycles = cpu.step();
    expect(cycles).toBe(3);
  });

  it("JSR/RTS round-trip preserves the return address", () => {
    // $8000: JSR $8006 / $8003: NOP NOP NOP / $8006: RTS
    const { cpu } = makeCpu([0x20, 0x06, 0x80, 0xea, 0xea, 0xea, 0x60]);
    cpu.step();
    expect(cpu.pc).toBe(0x8006);
    cpu.step();
    expect(cpu.pc).toBe(0x8003);
  });

  it("INX/DEX wrap around 8bit boundaries", () => {
    // LDX #$FF ; INX ; INX
    const { cpu } = makeCpu([0xa2, 0xff, 0xe8, 0xe8]);
    cpu.step();
    cpu.step();
    expect(cpu.x).toBe(0x00);
    cpu.step();
    expect(cpu.x).toBe(0x01);
  });

  it("throws a descriptive error for an unregistered opcode", () => {
    const { cpu } = makeCpu([0x02]); // 未定義命令(KIL系)は未実装
    expect(() => cpu.step()).toThrow(/Unsupported opcode/);
  });

  it("irq() pushes PC/P, sets the I flag, and jumps to the $FFFE vector", () => {
    const { cpu, bus } = makeCpu([0xea]); // NOP（IRQ発生前のPC確認用）
    bus.mem[0xfffe] = 0x00;
    bus.mem[0xffff] = 0x90; // IRQベクタ = $9000
    cpu.p &= ~FLAG.I; // reset()直後はIフラグが立っているため、IRQを受理できる状態にする
    const pcBefore = cpu.pc;
    const pBefore = cpu.p;
    cpu.irq();
    expect(cpu.pc).toBe(0x9000);
    expect(cpu.p & FLAG.I).toBeTruthy();
    // スタックに積まれたPC/Pを直接確認（push16は上位バイト→下位バイトの順、
    // その後Pをpushするので、スタック上は [PC上位, PC下位, P] の順で並ぶ）
    const sp = cpu.sp;
    expect(bus.mem[0x0100 + ((sp + 1) & 0xff)]).toBe(pBefore & ~FLAG.B & 0xff);
    expect(bus.mem[0x0100 + ((sp + 2) & 0xff)]).toBe(pcBefore & 0xff);
    expect(bus.mem[0x0100 + ((sp + 3) & 0xff)]).toBe((pcBefore >> 8) & 0xff);
  });

  it("irq() is a no-op when the I flag is already set (IRQ disabled)", () => {
    const { cpu, bus } = makeCpu([0xea]);
    bus.mem[0xfffe] = 0x00;
    bus.mem[0xffff] = 0x90;
    cpu.p |= FLAG.I;
    const pcBefore = cpu.pc;
    const spBefore = cpu.sp;
    cpu.irq();
    expect(cpu.pc).toBe(pcBefore); // ジャンプしない
    expect(cpu.sp).toBe(spBefore); // スタックにも積まれない
  });
});
