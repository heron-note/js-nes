/**
 * DSLコンパイラのコード生成バックエンド（2パスアセンブラ）。
 * docs/03_DSL_SPEC.md の「コンパイルパイプライン」における
 * 「中間命令列への変換 → 2パスアセンブル → 6502バイト列」を担う。
 *
 * 対応するオペコードは packages/emulator-core の Cpu6502 実装（cpu.ts）と一致させている。
 */

interface Fixup {
  pos: number;
  label: string;
  kind: "abs" | "rel";
}

export interface AssembledCode {
  bytes: Uint8Array;
  labels: ReadonlyMap<string, number>;
}

export class Emitter {
  private readonly bytes: number[] = [];
  private readonly labels = new Map<string, number>();
  private readonly fixups: Fixup[] = [];
  private labelCounter = 0;

  constructor(private readonly origin: number) {}

  private here(): number {
    return this.origin + this.bytes.length;
  }

  uniqueLabel(prefix: string): string {
    return `${prefix}_${this.labelCounter++}`;
  }

  label(name: string): this {
    if (this.labels.has(name)) {
      throw new Error(`duplicate label: ${name}`);
    }
    this.labels.set(name, this.here());
    return this;
  }

  private emit(...values: number[]): this {
    for (const v of values) this.bytes.push(v & 0xff);
    return this;
  }

  private absRef(label: string): this {
    this.fixups.push({ pos: this.bytes.length, label, kind: "abs" });
    return this.emit(0, 0);
  }

  private relRef(label: string): this {
    this.fixups.push({ pos: this.bytes.length, label, kind: "rel" });
    return this.emit(0);
  }

  // --- implied ---
  SEI(): this {
    return this.emit(0x78);
  }
  CLD(): this {
    return this.emit(0xd8);
  }
  TXS(): this {
    return this.emit(0x9a);
  }
  TAX(): this {
    return this.emit(0xaa);
  }
  DEX(): this {
    return this.emit(0xca);
  }
  RTS(): this {
    return this.emit(0x60);
  }
  RTI(): this {
    return this.emit(0x40);
  }
  CLC(): this {
    return this.emit(0x18);
  }
  SEC(): this {
    return this.emit(0x38);
  }
  ASL_ACC(): this {
    return this.emit(0x0a);
  }
  LSR_ACC(): this {
    return this.emit(0x4a);
  }

  // --- immediate ---
  LDA_IMM(v: number): this {
    return this.emit(0xa9, v);
  }
  LDX_IMM(v: number): this {
    return this.emit(0xa2, v);
  }
  CMP_IMM(v: number): this {
    return this.emit(0xc9, v);
  }
  ADC_IMM(v: number): this {
    return this.emit(0x69, v);
  }
  SBC_IMM(v: number): this {
    return this.emit(0xe9, v);
  }
  AND_IMM(v: number): this {
    return this.emit(0x29, v);
  }

  // --- zero page ---
  LDA_ZP(a: number): this {
    return this.emit(0xa5, a);
  }
  LDX_ZP(a: number): this {
    return this.emit(0xa6, a);
  }
  STA_ZP(a: number): this {
    return this.emit(0x85, a);
  }
  CMP_ZP(a: number): this {
    return this.emit(0xc5, a);
  }
  AND_ZP(a: number): this {
    return this.emit(0x25, a);
  }
  EOR_ZP(a: number): this {
    return this.emit(0x45, a);
  }
  INC_ZP(a: number): this {
    return this.emit(0xe6, a);
  }
  DEC_ZP(a: number): this {
    return this.emit(0xc6, a);
  }
  ROL_ZP(a: number): this {
    return this.emit(0x26, a);
  }

  // --- absolute ---
  LDA_ABS(a: number): this {
    return this.emit(0xad, a & 0xff, (a >> 8) & 0xff);
  }
  STA_ABS(a: number): this {
    return this.emit(0x8d, a & 0xff, (a >> 8) & 0xff);
  }
  STA_ABS_X(a: number): this {
    return this.emit(0x9d, a & 0xff, (a >> 8) & 0xff);
  }
  LDA_ABS_X(a: number): this {
    return this.emit(0xbd, a & 0xff, (a >> 8) & 0xff);
  }
  /** LDA abs,X のオペランドをラベル参照（データテーブルの先頭アドレス等）で指定する版。 */
  LDA_ABS_X_LABEL(label: string): this {
    this.emit(0xbd);
    return this.absRef(label);
  }
  BIT_ABS(a: number): this {
    return this.emit(0x2c, a & 0xff, (a >> 8) & 0xff);
  }
  CMP_ABS(a: number): this {
    return this.emit(0xcd, a & 0xff, (a >> 8) & 0xff);
  }
  CMP_ABS_X(a: number): this {
    return this.emit(0xdd, a & 0xff, (a >> 8) & 0xff);
  }

  // --- branches / jumps (ラベル参照) ---
  BEQ(l: string): this {
    this.emit(0xf0);
    return this.relRef(l);
  }
  BNE(l: string): this {
    this.emit(0xd0);
    return this.relRef(l);
  }
  BCC(l: string): this {
    this.emit(0x90);
    return this.relRef(l);
  }
  BCS(l: string): this {
    this.emit(0xb0);
    return this.relRef(l);
  }
  BPL(l: string): this {
    this.emit(0x10);
    return this.relRef(l);
  }
  JMP(l: string): this {
    this.emit(0x4c);
    return this.absRef(l);
  }
  JSR(l: string): this {
    this.emit(0x20);
    return this.absRef(l);
  }

  /** 生バイト列（データテーブル等）を直接埋め込む。 */
  DB(...values: number[]): this {
    return this.emit(...values);
  }

  assemble(): AssembledCode {
    const out = Uint8Array.from(this.bytes);
    for (const fix of this.fixups) {
      const target = this.labels.get(fix.label);
      if (target === undefined) {
        throw new Error(`unresolved label: ${fix.label}`);
      }
      if (fix.kind === "abs") {
        out[fix.pos] = target & 0xff;
        out[fix.pos + 1] = (target >> 8) & 0xff;
      } else {
        const insnEnd = this.origin + fix.pos + 1;
        const offset = target - insnEnd;
        if (offset < -128 || offset > 127) {
          throw new Error(`branch out of range: ${fix.label} (offset=${offset})`);
        }
        out[fix.pos] = offset & 0xff;
      }
    }
    return { bytes: out, labels: this.labels };
  }
}
