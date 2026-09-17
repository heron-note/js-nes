import type { CpuBus } from "../cpu.js";

/** テスト用の単純な64KBフラットメモリバス。 */
export class MemoryBus implements CpuBus {
  readonly mem = new Uint8Array(0x10000);

  cpuRead(addr: number): number {
    return this.mem[addr & 0xffff] ?? 0;
  }

  cpuWrite(addr: number, value: number): void {
    this.mem[addr & 0xffff] = value & 0xff;
  }
}
