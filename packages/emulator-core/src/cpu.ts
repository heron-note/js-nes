/**
 * MOS 6502 互換 CPU（Ricoh 2A03）。
 * 公式 56 命令に加え、ホームブリューで使われやすい未公認命令を一部サポートする
 * （現状: AXS/SBX = 0xCB）。
 * サイクル数は「基本サイクル + ページ跨ぎ加算 + 分岐成立加算」で近似する
 * （RMW命令のABXモード等、実機で常に最大値を取るケースは基本サイクル自体に織り込み済み）。
 */

export interface CpuBus {
  cpuRead(addr: number): number;
  cpuWrite(addr: number, value: number): void;
}

export const FLAG = {
  C: 0x01,
  Z: 0x02,
  I: 0x04,
  D: 0x08,
  B: 0x10,
  U: 0x20,
  V: 0x40,
  N: 0x80,
} as const;

export type AddrMode =
  | "IMP"
  | "ACC"
  | "IMM"
  | "ZP0"
  | "ZPX"
  | "ZPY"
  | "REL"
  | "ABS"
  | "ABX"
  | "ABY"
  | "IND"
  | "IZX"
  | "IZY";

interface OpEntry {
  mnemonic: string;
  mode: AddrMode;
  cycles: number;
}

const OPTABLE: (OpEntry | null)[] = new Array(256).fill(null);

function op(code: number, mnemonic: string, mode: AddrMode, cycles: number): void {
  if (OPTABLE[code] !== null) {
    throw new Error(`Duplicate opcode registration: 0x${code.toString(16)}`);
  }
  OPTABLE[code] = { mnemonic, mode, cycles };
}

// --- Load/Store ---
op(0xa9, "LDA", "IMM", 2);
op(0xa5, "LDA", "ZP0", 3);
op(0xb5, "LDA", "ZPX", 4);
op(0xad, "LDA", "ABS", 4);
op(0xbd, "LDA", "ABX", 4);
op(0xb9, "LDA", "ABY", 4);
op(0xa1, "LDA", "IZX", 6);
op(0xb1, "LDA", "IZY", 5);

op(0xa2, "LDX", "IMM", 2);
op(0xa6, "LDX", "ZP0", 3);
op(0xb6, "LDX", "ZPY", 4);
op(0xae, "LDX", "ABS", 4);
op(0xbe, "LDX", "ABY", 4);

op(0xa0, "LDY", "IMM", 2);
op(0xa4, "LDY", "ZP0", 3);
op(0xb4, "LDY", "ZPX", 4);
op(0xac, "LDY", "ABS", 4);
op(0xbc, "LDY", "ABX", 4);

op(0x85, "STA", "ZP0", 3);
op(0x95, "STA", "ZPX", 4);
op(0x8d, "STA", "ABS", 4);
op(0x9d, "STA", "ABX", 5);
op(0x99, "STA", "ABY", 5);
op(0x81, "STA", "IZX", 6);
op(0x91, "STA", "IZY", 6);

op(0x86, "STX", "ZP0", 3);
op(0x96, "STX", "ZPY", 4);
op(0x8e, "STX", "ABS", 4);

op(0x84, "STY", "ZP0", 3);
op(0x94, "STY", "ZPX", 4);
op(0x8c, "STY", "ABS", 4);

// --- Transfers ---
op(0xaa, "TAX", "IMP", 2);
op(0xa8, "TAY", "IMP", 2);
op(0x8a, "TXA", "IMP", 2);
op(0x98, "TYA", "IMP", 2);
op(0xba, "TSX", "IMP", 2);
op(0x9a, "TXS", "IMP", 2);

// --- Stack ---
op(0x48, "PHA", "IMP", 3);
op(0x08, "PHP", "IMP", 3);
op(0x68, "PLA", "IMP", 4);
op(0x28, "PLP", "IMP", 4);

// --- Logic ---
op(0x29, "AND", "IMM", 2);
op(0x25, "AND", "ZP0", 3);
op(0x35, "AND", "ZPX", 4);
op(0x2d, "AND", "ABS", 4);
op(0x3d, "AND", "ABX", 4);
op(0x39, "AND", "ABY", 4);
op(0x21, "AND", "IZX", 6);
op(0x31, "AND", "IZY", 5);

op(0x09, "ORA", "IMM", 2);
op(0x05, "ORA", "ZP0", 3);
op(0x15, "ORA", "ZPX", 4);
op(0x0d, "ORA", "ABS", 4);
op(0x1d, "ORA", "ABX", 4);
op(0x19, "ORA", "ABY", 4);
op(0x01, "ORA", "IZX", 6);
op(0x11, "ORA", "IZY", 5);

op(0x49, "EOR", "IMM", 2);
op(0x45, "EOR", "ZP0", 3);
op(0x55, "EOR", "ZPX", 4);
op(0x4d, "EOR", "ABS", 4);
op(0x5d, "EOR", "ABX", 4);
op(0x59, "EOR", "ABY", 4);
op(0x41, "EOR", "IZX", 6);
op(0x51, "EOR", "IZY", 5);

op(0x24, "BIT", "ZP0", 3);
op(0x2c, "BIT", "ABS", 4);

// --- Arithmetic ---
op(0x69, "ADC", "IMM", 2);
op(0x65, "ADC", "ZP0", 3);
op(0x75, "ADC", "ZPX", 4);
op(0x6d, "ADC", "ABS", 4);
op(0x7d, "ADC", "ABX", 4);
op(0x79, "ADC", "ABY", 4);
op(0x61, "ADC", "IZX", 6);
op(0x71, "ADC", "IZY", 5);

op(0xe9, "SBC", "IMM", 2);
op(0xe5, "SBC", "ZP0", 3);
op(0xf5, "SBC", "ZPX", 4);
op(0xed, "SBC", "ABS", 4);
op(0xfd, "SBC", "ABX", 4);
op(0xf9, "SBC", "ABY", 4);
op(0xe1, "SBC", "IZX", 6);
op(0xf1, "SBC", "IZY", 5);

op(0xc9, "CMP", "IMM", 2);
op(0xc5, "CMP", "ZP0", 3);
op(0xd5, "CMP", "ZPX", 4);
op(0xcd, "CMP", "ABS", 4);
op(0xdd, "CMP", "ABX", 4);
op(0xd9, "CMP", "ABY", 4);
op(0xc1, "CMP", "IZX", 6);
op(0xd1, "CMP", "IZY", 5);

op(0xe0, "CPX", "IMM", 2);
op(0xe4, "CPX", "ZP0", 3);
op(0xec, "CPX", "ABS", 4);

op(0xc0, "CPY", "IMM", 2);
op(0xc4, "CPY", "ZP0", 3);
op(0xcc, "CPY", "ABS", 4);

// --- Inc/Dec ---
op(0xe6, "INC", "ZP0", 5);
op(0xf6, "INC", "ZPX", 6);
op(0xee, "INC", "ABS", 6);
op(0xfe, "INC", "ABX", 7);

op(0xc6, "DEC", "ZP0", 5);
op(0xd6, "DEC", "ZPX", 6);
op(0xce, "DEC", "ABS", 6);
op(0xde, "DEC", "ABX", 7);

op(0xe8, "INX", "IMP", 2);
op(0xca, "DEX", "IMP", 2);
op(0xc8, "INY", "IMP", 2);
op(0x88, "DEY", "IMP", 2);

// --- Shifts ---
op(0x0a, "ASL", "ACC", 2);
op(0x06, "ASL", "ZP0", 5);
op(0x16, "ASL", "ZPX", 6);
op(0x0e, "ASL", "ABS", 6);
op(0x1e, "ASL", "ABX", 7);

op(0x4a, "LSR", "ACC", 2);
op(0x46, "LSR", "ZP0", 5);
op(0x56, "LSR", "ZPX", 6);
op(0x4e, "LSR", "ABS", 6);
op(0x5e, "LSR", "ABX", 7);

op(0x2a, "ROL", "ACC", 2);
op(0x26, "ROL", "ZP0", 5);
op(0x36, "ROL", "ZPX", 6);
op(0x2e, "ROL", "ABS", 6);
op(0x3e, "ROL", "ABX", 7);

op(0x6a, "ROR", "ACC", 2);
op(0x66, "ROR", "ZP0", 5);
op(0x76, "ROR", "ZPX", 6);
op(0x6e, "ROR", "ABS", 6);
op(0x7e, "ROR", "ABX", 7);

// --- Jumps/Calls ---
op(0x4c, "JMP", "ABS", 3);
op(0x6c, "JMP", "IND", 5);
op(0x20, "JSR", "ABS", 6);
op(0x60, "RTS", "IMP", 6);
op(0x40, "RTI", "IMP", 6);
op(0x00, "BRK", "IMP", 7);
op(0xea, "NOP", "IMP", 2);

// --- Branches (base 2 cycles, +1 taken, +1 more if page crossed) ---
op(0x10, "BPL", "REL", 2);
op(0x30, "BMI", "REL", 2);
op(0x50, "BVC", "REL", 2);
op(0x70, "BVS", "REL", 2);
op(0x90, "BCC", "REL", 2);
op(0xb0, "BCS", "REL", 2);
op(0xd0, "BNE", "REL", 2);
op(0xf0, "BEQ", "REL", 2);

// --- Flags ---
op(0x18, "CLC", "IMP", 2);
op(0x38, "SEC", "IMP", 2);
op(0x58, "CLI", "IMP", 2);
op(0x78, "SEI", "IMP", 2);
op(0xb8, "CLV", "IMP", 2);
op(0xd8, "CLD", "IMP", 2);
op(0xf8, "SED", "IMP", 2);

// --- Undocumented (common on NES) ---
// AXS/SBX: X := (A & X) - #imm。N/Z/C を CMP と同様に更新（V は変更しない）。
op(0xcb, "AXS", "IMM", 2);

const PAGE_CROSS_BONUS_MNEMONICS = new Set([
  "LDA",
  "LDX",
  "LDY",
  "ADC",
  "SBC",
  "AND",
  "ORA",
  "EOR",
  "CMP",
]);

interface ResolvedAddr {
  addr: number;
  pageCrossed: boolean;
}

export class Cpu6502 {
  a = 0;
  x = 0;
  y = 0;
  sp = 0xfd;
  pc = 0;
  p = FLAG.U | FLAG.I;
  totalCycles = 0;

  constructor(private readonly bus: CpuBus) {}

  reset(): void {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xfd;
    this.p = FLAG.U | FLAG.I;
    this.pc = this.readVector(0xfffc);
    this.totalCycles = 0;
  }

  nmi(): void {
    this.push16(this.pc);
    this.push((this.p & ~FLAG.B) | FLAG.U);
    this.setFlag(FLAG.I, true);
    this.pc = this.readVector(0xfffa);
    this.totalCycles += 7;
  }

  irq(): void {
    if (this.getFlag(FLAG.I)) return;
    this.push16(this.pc);
    this.push((this.p & ~FLAG.B) | FLAG.U);
    this.setFlag(FLAG.I, true);
    this.pc = this.readVector(0xfffe);
    this.totalCycles += 7;
  }

  /** 1命令を実行し、消費したサイクル数を返す。 */
  step(): number {
    const opcode = this.bus.cpuRead(this.pc);
    const entry = OPTABLE[opcode];
    if (!entry) {
      throw new Error(
        `Unsupported opcode 0x${opcode.toString(16).padStart(2, "0")} at PC=0x${this.pc
          .toString(16)
          .padStart(4, "0")}`,
      );
    }
    this.pc = (this.pc + 1) & 0xffff;

    const resolved = this.resolveAddress(entry.mode);
    const branchTaken = this.execute(entry.mnemonic, entry.mode, resolved.addr);

    let cycles = entry.cycles;
    if (branchTaken) {
      cycles += 1;
      if (resolved.pageCrossed) cycles += 1;
    } else if (
      resolved.pageCrossed &&
      (entry.mode === "ABX" || entry.mode === "ABY" || entry.mode === "IZY") &&
      PAGE_CROSS_BONUS_MNEMONICS.has(entry.mnemonic)
    ) {
      cycles += 1;
    }

    this.totalCycles += cycles;
    return cycles;
  }

  private readVector(addr: number): number {
    const lo = this.bus.cpuRead(addr);
    const hi = this.bus.cpuRead((addr + 1) & 0xffff);
    return (hi << 8) | lo;
  }

  private getFlag(flag: number): boolean {
    return (this.p & flag) !== 0;
  }

  private setFlag(flag: number, value: boolean): void {
    if (value) this.p |= flag;
    else this.p &= ~flag & 0xff;
  }

  private setZN(value: number): void {
    this.setFlag(FLAG.Z, (value & 0xff) === 0);
    this.setFlag(FLAG.N, (value & 0x80) !== 0);
  }

  private push(value: number): void {
    this.bus.cpuWrite(0x0100 + this.sp, value & 0xff);
    this.sp = (this.sp - 1) & 0xff;
  }

  private pop(): number {
    this.sp = (this.sp + 1) & 0xff;
    return this.bus.cpuRead(0x0100 + this.sp);
  }

  private push16(value: number): void {
    this.push((value >> 8) & 0xff);
    this.push(value & 0xff);
  }

  private pop16(): number {
    const lo = this.pop();
    const hi = this.pop();
    return (hi << 8) | lo;
  }

  private resolveAddress(mode: AddrMode): ResolvedAddr {
    switch (mode) {
      case "IMP":
      case "ACC":
        return { addr: -1, pageCrossed: false };

      case "IMM": {
        const addr = this.pc;
        this.pc = (this.pc + 1) & 0xffff;
        return { addr, pageCrossed: false };
      }

      case "ZP0": {
        const addr = this.bus.cpuRead(this.pc) & 0xff;
        this.pc = (this.pc + 1) & 0xffff;
        return { addr, pageCrossed: false };
      }

      case "ZPX": {
        const base = this.bus.cpuRead(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        return { addr: (base + this.x) & 0xff, pageCrossed: false };
      }

      case "ZPY": {
        const base = this.bus.cpuRead(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        return { addr: (base + this.y) & 0xff, pageCrossed: false };
      }

      case "REL": {
        let offset = this.bus.cpuRead(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        if (offset & 0x80) offset -= 0x100;
        const addr = (this.pc + offset) & 0xffff;
        return { addr, pageCrossed: (addr & 0xff00) !== (this.pc & 0xff00) };
      }

      case "ABS": {
        const lo = this.bus.cpuRead(this.pc);
        const hi = this.bus.cpuRead((this.pc + 1) & 0xffff);
        this.pc = (this.pc + 2) & 0xffff;
        return { addr: (hi << 8) | lo, pageCrossed: false };
      }

      case "ABX": {
        const lo = this.bus.cpuRead(this.pc);
        const hi = this.bus.cpuRead((this.pc + 1) & 0xffff);
        this.pc = (this.pc + 2) & 0xffff;
        const base = (hi << 8) | lo;
        const addr = (base + this.x) & 0xffff;
        return { addr, pageCrossed: (addr & 0xff00) !== (base & 0xff00) };
      }

      case "ABY": {
        const lo = this.bus.cpuRead(this.pc);
        const hi = this.bus.cpuRead((this.pc + 1) & 0xffff);
        this.pc = (this.pc + 2) & 0xffff;
        const base = (hi << 8) | lo;
        const addr = (base + this.y) & 0xffff;
        return { addr, pageCrossed: (addr & 0xff00) !== (base & 0xff00) };
      }

      case "IND": {
        const ptrLo = this.bus.cpuRead(this.pc);
        const ptrHi = this.bus.cpuRead((this.pc + 1) & 0xffff);
        this.pc = (this.pc + 2) & 0xffff;
        const ptr = (ptrHi << 8) | ptrLo;
        // 実機の既知のバグ: 下位バイトが0xFFのとき、上位バイトは同一ページ内から読まれる
        const loAddr = ptr;
        const hiAddr = (ptr & 0xff00) | ((ptr + 1) & 0x00ff);
        const lo = this.bus.cpuRead(loAddr);
        const hi = this.bus.cpuRead(hiAddr);
        return { addr: (hi << 8) | lo, pageCrossed: false };
      }

      case "IZX": {
        const zp = this.bus.cpuRead(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        const ptr = (zp + this.x) & 0xff;
        const lo = this.bus.cpuRead(ptr);
        const hi = this.bus.cpuRead((ptr + 1) & 0xff);
        return { addr: (hi << 8) | lo, pageCrossed: false };
      }

      case "IZY": {
        const zp = this.bus.cpuRead(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        const lo = this.bus.cpuRead(zp);
        const hi = this.bus.cpuRead((zp + 1) & 0xff);
        const base = (hi << 8) | lo;
        const addr = (base + this.y) & 0xffff;
        return { addr, pageCrossed: (addr & 0xff00) !== (base & 0xff00) };
      }
    }
  }

  /** 命令を実行する。戻り値は分岐が成立したかどうか（サイクル加算判定に使用）。 */
  private execute(mnemonic: string, mode: AddrMode, addr: number): boolean {
    const read = (): number => (mode === "ACC" ? this.a : this.bus.cpuRead(addr));
    const write = (v: number): void => {
      if (mode === "ACC") this.a = v & 0xff;
      else this.bus.cpuWrite(addr, v & 0xff);
    };

    switch (mnemonic) {
      case "LDA":
        this.a = read();
        this.setZN(this.a);
        return false;
      case "LDX":
        this.x = read();
        this.setZN(this.x);
        return false;
      case "LDY":
        this.y = read();
        this.setZN(this.y);
        return false;
      case "STA":
        write(this.a);
        return false;
      case "STX":
        write(this.x);
        return false;
      case "STY":
        write(this.y);
        return false;

      case "TAX":
        this.x = this.a;
        this.setZN(this.x);
        return false;
      case "TAY":
        this.y = this.a;
        this.setZN(this.y);
        return false;
      case "TXA":
        this.a = this.x;
        this.setZN(this.a);
        return false;
      case "TYA":
        this.a = this.y;
        this.setZN(this.a);
        return false;
      case "TSX":
        this.x = this.sp;
        this.setZN(this.x);
        return false;
      case "TXS":
        this.sp = this.x;
        return false;

      case "PHA":
        this.push(this.a);
        return false;
      case "PHP":
        this.push(this.p | FLAG.B | FLAG.U);
        return false;
      case "PLA":
        this.a = this.pop();
        this.setZN(this.a);
        return false;
      case "PLP":
        this.p = (this.pop() & ~FLAG.B) | FLAG.U;
        return false;

      case "AND":
        this.a &= read();
        this.setZN(this.a);
        return false;
      case "ORA":
        this.a |= read();
        this.setZN(this.a);
        return false;
      case "EOR":
        this.a ^= read();
        this.setZN(this.a);
        return false;
      case "BIT": {
        const v = read();
        this.setFlag(FLAG.Z, (this.a & v) === 0);
        this.setFlag(FLAG.V, (v & 0x40) !== 0);
        this.setFlag(FLAG.N, (v & 0x80) !== 0);
        return false;
      }

      case "ADC": {
        const v = read();
        const carryIn = this.getFlag(FLAG.C) ? 1 : 0;
        const sum = this.a + v + carryIn;
        this.setFlag(FLAG.C, sum > 0xff);
        this.setFlag(FLAG.V, (~(this.a ^ v) & (this.a ^ sum) & 0x80) !== 0);
        this.a = sum & 0xff;
        this.setZN(this.a);
        return false;
      }
      case "SBC": {
        const v = read() ^ 0xff;
        const carryIn = this.getFlag(FLAG.C) ? 1 : 0;
        const sum = this.a + v + carryIn;
        this.setFlag(FLAG.C, sum > 0xff);
        this.setFlag(FLAG.V, (~(this.a ^ v) & (this.a ^ sum) & 0x80) !== 0);
        this.a = sum & 0xff;
        this.setZN(this.a);
        return false;
      }
      case "CMP": {
        const v = read();
        this.setFlag(FLAG.C, this.a >= v);
        this.setZN((this.a - v) & 0xff);
        return false;
      }
      case "CPX": {
        const v = read();
        this.setFlag(FLAG.C, this.x >= v);
        this.setZN((this.x - v) & 0xff);
        return false;
      }
      case "CPY": {
        const v = read();
        this.setFlag(FLAG.C, this.y >= v);
        this.setZN((this.y - v) & 0xff);
        return false;
      }
      case "AXS": {
        // Undocumented: X = (A & X) - imm（借用なし減算）。C は結果が借りなかったとき。
        const imm = this.bus.cpuRead(addr) & 0xff;
        const t = ((this.a & this.x) & 0xff) - imm;
        this.x = t & 0xff;
        this.setFlag(FLAG.C, t >= 0);
        this.setZN(this.x);
        return false;
      }

      case "INC": {
        const v = (read() + 1) & 0xff;
        write(v);
        this.setZN(v);
        return false;
      }
      case "DEC": {
        const v = (read() - 1) & 0xff;
        write(v);
        this.setZN(v);
        return false;
      }
      case "INX":
        this.x = (this.x + 1) & 0xff;
        this.setZN(this.x);
        return false;
      case "DEX":
        this.x = (this.x - 1) & 0xff;
        this.setZN(this.x);
        return false;
      case "INY":
        this.y = (this.y + 1) & 0xff;
        this.setZN(this.y);
        return false;
      case "DEY":
        this.y = (this.y - 1) & 0xff;
        this.setZN(this.y);
        return false;

      case "ASL": {
        const v = read();
        const r = (v << 1) & 0xff;
        this.setFlag(FLAG.C, (v & 0x80) !== 0);
        write(r);
        this.setZN(r);
        return false;
      }
      case "LSR": {
        const v = read();
        const r = (v >> 1) & 0xff;
        this.setFlag(FLAG.C, (v & 0x01) !== 0);
        write(r);
        this.setZN(r);
        return false;
      }
      case "ROL": {
        const v = read();
        const c = this.getFlag(FLAG.C) ? 1 : 0;
        const r = ((v << 1) | c) & 0xff;
        this.setFlag(FLAG.C, (v & 0x80) !== 0);
        write(r);
        this.setZN(r);
        return false;
      }
      case "ROR": {
        const v = read();
        const c = this.getFlag(FLAG.C) ? 0x80 : 0;
        const r = ((v >> 1) | c) & 0xff;
        this.setFlag(FLAG.C, (v & 0x01) !== 0);
        write(r);
        this.setZN(r);
        return false;
      }

      case "JMP":
        this.pc = addr;
        return false;
      case "JSR":
        this.push16((this.pc - 1) & 0xffff);
        this.pc = addr;
        return false;
      case "RTS":
        this.pc = (this.pop16() + 1) & 0xffff;
        return false;
      case "RTI":
        this.p = (this.pop() & ~FLAG.B) | FLAG.U;
        this.pc = this.pop16();
        return false;
      case "BRK": {
        this.pc = (this.pc + 1) & 0xffff;
        this.push16(this.pc);
        this.push(this.p | FLAG.B | FLAG.U);
        this.setFlag(FLAG.I, true);
        this.pc = this.readVector(0xfffe);
        return false;
      }
      case "NOP":
        return false;

      case "CLC":
        this.setFlag(FLAG.C, false);
        return false;
      case "SEC":
        this.setFlag(FLAG.C, true);
        return false;
      case "CLI":
        this.setFlag(FLAG.I, false);
        return false;
      case "SEI":
        this.setFlag(FLAG.I, true);
        return false;
      case "CLV":
        this.setFlag(FLAG.V, false);
        return false;
      case "CLD":
        this.setFlag(FLAG.D, false);
        return false;
      case "SED":
        this.setFlag(FLAG.D, true);
        return false;

      case "BPL":
        if (!this.getFlag(FLAG.N)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BMI":
        if (this.getFlag(FLAG.N)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BVC":
        if (!this.getFlag(FLAG.V)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BVS":
        if (this.getFlag(FLAG.V)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BCC":
        if (!this.getFlag(FLAG.C)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BCS":
        if (this.getFlag(FLAG.C)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BNE":
        if (!this.getFlag(FLAG.Z)) {
          this.pc = addr;
          return true;
        }
        return false;
      case "BEQ":
        if (this.getFlag(FLAG.Z)) {
          this.pc = addr;
          return true;
        }
        return false;

      default:
        throw new Error(`Unimplemented mnemonic: ${mnemonic}`);
    }
  }
}
