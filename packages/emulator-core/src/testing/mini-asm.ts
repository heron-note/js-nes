/**
 * 開発・テスト専用の最小6502アセンブラヘルパー。
 *
 * 注意: これは将来の `packages/dsl-compiler`（JS風DSL→6502バイナリ）とは別物。
 * ここでは emulator-core 自体の単体テスト・スモークテスト用ROMを、
 * 手計算のバイトオフセットに頼らずラベル解決付きで組み立てるためだけに使う。
 */

interface Fixup {
  pos: number;
  label: string;
  kind: "abs" | "rel";
}

export interface AssembledProgram {
  bytes: Uint8Array;
  labels: ReadonlyMap<string, number>;
}

export class Asm {
  private readonly bytes: number[] = [];
  private readonly labels = new Map<string, number>();
  private readonly fixups: Fixup[] = [];

  constructor(private readonly origin: number) {}

  private here(): number {
    return this.origin + this.bytes.length;
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

  private emitAbsRef(label: string): this {
    this.fixups.push({ pos: this.bytes.length, label, kind: "abs" });
    return this.emit(0, 0);
  }

  private emitRelRef(label: string): this {
    this.fixups.push({ pos: this.bytes.length, label, kind: "rel" });
    return this.emit(0);
  }

  SEI(): this {
    return this.emit(0x78);
  }
  CLI(): this {
    return this.emit(0x58);
  }
  CLD(): this {
    return this.emit(0xd8);
  }
  TXS(): this {
    return this.emit(0x9a);
  }
  INX(): this {
    return this.emit(0xe8);
  }
  DEY(): this {
    return this.emit(0x88);
  }
  RTI(): this {
    return this.emit(0x40);
  }

  LDA_IMM(v: number): this {
    return this.emit(0xa9, v);
  }
  LDX_IMM(v: number): this {
    return this.emit(0xa2, v);
  }
  LDY_IMM(v: number): this {
    return this.emit(0xa0, v);
  }
  CPX_IMM(v: number): this {
    return this.emit(0xe0, v);
  }

  STA_ABS(addr: number): this {
    return this.emit(0x8d, addr & 0xff, (addr >> 8) & 0xff);
  }
  LDA_ABS(addr: number): this {
    return this.emit(0xad, addr & 0xff, (addr >> 8) & 0xff);
  }
  BIT_ABS(addr: number): this {
    return this.emit(0x2c, addr & 0xff, (addr >> 8) & 0xff);
  }

  BPL(label: string): this {
    this.emit(0x10);
    return this.emitRelRef(label);
  }
  BNE(label: string): this {
    this.emit(0xd0);
    return this.emitRelRef(label);
  }
  BEQ(label: string): this {
    this.emit(0xf0);
    return this.emitRelRef(label);
  }
  JMP(label: string): this {
    this.emit(0x4c);
    return this.emitAbsRef(label);
  }

  /**
   * MMC1(Mapper 1)のシリアルシフトレジスタ書き込みを1回分（5回のLDA_IMM+STA_ABS）に
   * 展開する。1ビットずつLSB→MSBの順で書き込むと、5回目でvalueの下位5bitがそのまま
   * 対象レジスタにコミットされる（1回ずつ手書きすると非常に冗長になるため）。
   */
  MMC1_WRITE(addr: number, value: number): this {
    for (let k = 0; k < 5; k++) {
      const bit = (value >> k) & 1;
      this.LDA_IMM(bit).STA_ABS(addr);
    }
    return this;
  }

  assemble(): AssembledProgram {
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
