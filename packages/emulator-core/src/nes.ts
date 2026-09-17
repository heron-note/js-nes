import { Cpu6502, type CpuBus } from "./cpu.js";
import { Ppu2C02, type PpuBus } from "./ppu.js";
import { Apu } from "./apu.js";
import { createMapper, type Mapper } from "./mapper.js";
import { parseINes, type Mirroring } from "./ines.js";
import { Controller } from "./controller.js";

/**
 * NES本体（CPU + PPU + APUレジスタ + マッパー）。
 * PPUはCPU 1サイクルにつき3ドット進む（NTSC仕様）。
 */
export class Nes {
  readonly cpu: Cpu6502;
  readonly ppu: Ppu2C02;
  readonly apu: Apu;
  readonly controller1 = new Controller();
  readonly controller2 = new Controller();

  private readonly ram = new Uint8Array(2048);
  private mapper: Mapper | null = null;
  /** iNESヘッダーのミラーリング。マッパーが動的に制御する場合はgetMirroringOverride()が優先される。 */
  private headerMirroring: Mirroring = "horizontal";

  constructor() {
    const cpuBus: CpuBus = {
      cpuRead: (addr) => this.cpuRead(addr),
      cpuWrite: (addr, value) => this.cpuWrite(addr, value),
    };
    const ppuBus: PpuBus = {
      ppuRead: (addr) => (this.mapper ? this.mapper.ppuRead(addr) : 0),
      ppuWrite: (addr, value) => this.mapper?.ppuWrite(addr, value),
      notifyScanline: (renderingEnabled) => this.mapper?.notifyScanline(renderingEnabled),
    };
    this.cpu = new Cpu6502(cpuBus);
    this.ppu = new Ppu2C02(ppuBus, () => this.mapper?.getMirroringOverride() ?? this.headerMirroring);
    // DMCチャンネルはCPUアドレス空間から直接サンプルを読み出すため、循環importを避けるため
    // コールバック注入で渡す（PpuBus/CpuBusと同じパターン）。
    this.apu = new Apu((addr) => this.cpuRead(addr));
  }

  loadRom(bytes: Uint8Array): void {
    const rom = parseINes(bytes);
    this.mapper = createMapper(rom);
    this.headerMirroring = rom.mirroring;
    this.reset();
  }

  reset(): void {
    this.ram.fill(0);
    this.ppu.reset();
    this.apu.reset();
    this.cpu.reset();
  }

  /** CPUアドレス空間の1バイトを読む。デバッグ・テスト・将来のメモリビューア用の補助API。 */
  readCpuMemory(addr: number): number {
    return this.cpuRead(addr);
  }

  /** CPUアドレス空間の1バイトを書く。デバッグ・テスト用（RAM領域のみ想定、ROM領域への書き込みは無視される）。 */
  writeCpuMemory(addr: number, value: number): void {
    this.cpuWrite(addr, value);
  }

  /** 1フレーム分（PPUがvblankに入り1周するまで）CPU/PPUを進める。 */
  runFrame(): void {
    this.ppu.frameComplete = false;
    let safety = 10_000_000;
    while (!this.ppu.frameComplete) {
      if (safety-- <= 0) {
        throw new Error("runFrame: フレームが完了しないまま安全上限に達しました（無限ループの疑い）");
      }

      const cpuCycles = this.cpu.step();

      for (let i = 0; i < cpuCycles; i++) this.apu.step();

      for (let i = 0; i < cpuCycles * 3; i++) {
        this.ppu.tickOne();
        if (this.ppu.nmiRequested) {
          this.ppu.nmiRequested = false;
          this.cpu.nmi();
        }
        // フレーム境界を超えて次フレーム冒頭のドット（vblank/sprite0ヒット等のフラグクリア）まで
        // 進めてしまわないよう、ここで即座に打ち切る。残りのドットは次回のrunFrame()で処理される。
        if (this.ppu.frameComplete) break;
      }

      // マッパー / APU（フレームIRQ・DMC IRQ）のIRQ線（レベル型）を命令境界ごとにポーリングする。
      // MMC3のスキャンラインカウンタ等がアサートしている間、確認（$E000書き込み等）される
      // まで毎回発火し続ける。
      if (this.mapper?.irqPending() || this.apu.irqPending()) {
        this.cpu.irq();
      }
    }
  }

  private cpuRead(addr: number): number {
    if (addr < 0x2000) return this.ram[addr & 0x07ff] ?? 0;
    if (addr < 0x4000) return this.ppu.cpuRead(0x2000 + (addr & 0x0007));
    if (addr === 0x4015) return this.apu.cpuRead(addr);
    if (addr === 0x4016) return this.controller1.read();
    if (addr === 0x4017) return this.controller2.read();
    if (addr >= 0x6000) return this.mapper ? this.mapper.cpuRead(addr) : 0;
    return 0;
  }

  private cpuWrite(addr: number, value: number): void {
    if (addr < 0x2000) {
      this.ram[addr & 0x07ff] = value & 0xff;
      return;
    }
    if (addr < 0x4000) {
      this.ppu.cpuWrite(0x2000 + (addr & 0x0007), value);
      return;
    }
    if (addr === 0x4014) {
      this.oamDma(value);
      return;
    }
    if (addr === 0x4016) {
      this.controller1.write(value);
      this.controller2.write(value);
      return;
    }
    if (addr >= 0x6000 && this.mapper) {
      this.mapper.cpuWrite(addr, value);
      return;
    }
    if ((addr >= 0x4000 && addr <= 0x4013) || addr === 0x4015 || addr === 0x4017) {
      this.apu.cpuWrite(addr, value);
      return;
    }
  }

  private oamDma(page: number): void {
    const base = (page & 0xff) << 8;
    for (let i = 0; i < 256; i++) {
      this.ppu.oam[(this.ppu.oamAddr + i) & 0xff] = this.cpuRead(base + i);
    }
    // DMA中はCPUが513サイクル分停止する。PPU/APUのみ先行して進めておく（簡易近似）。
    for (let i = 0; i < 513; i++) this.apu.step();
    for (let i = 0; i < 513 * 3; i++) {
      this.ppu.tickOne();
      if (this.ppu.nmiRequested) {
        this.ppu.nmiRequested = false;
        this.cpu.nmi();
      }
    }
  }
}

export { parseINes } from "./ines.js";
export type { INesRom, Mirroring } from "./ines.js";
export { BUTTON } from "./controller.js";
