import { Emitter } from "./emitter.js";
import type {
  ArgExpr,
  AssignStmt,
  BehaviorCallStmt,
  CallExpr,
  Cond,
  CompareOp,
  IfStmt,
  MemberExpr,
  PartAssignStmt,
  PartAssignTarget,
  PartCallExpr,
  PartCond,
  PartIfStmt,
  PartStmt,
  PartValueExpr,
  Program,
  Stmt,
  ValueExpr,
} from "./ast.js";
import { buildPulsePeriodTable, buildTrianglePeriodTable, highBytes, lowBytes } from "./notes.js";

/**
 * ゼロページレイアウト（docs/03_DSL_SPEC.md 準拠）:
 *   $00       btnState1（1コンの押下状態キャッシュ。NMIハンドラが毎フレーム更新）
 *   $01       btnState1Prev（直前フレームの押下状態。_just_pressed のエッジ検出用）
 *   $02-$06   ビルトイン関数呼び出し用の引数スクラッチ（最大5引数まで）
 *   $07-$0A   サウンドチャンネル(Pulse1/Pulse2/Triangle/Noise)ごとの残り発音フレーム数
 *   $0B-      ユーザーのグローバル変数（宣言順）
 */
const BTN_STATE_ZP = 0x00;
const BTN_STATE_PREV_ZP = 0x01;
const ARG_BASE = 0x02;
const SOUND_DUR_BASE = 0x07;
const USER_VARS_START = 0x0b;

const JUST_PRESSED_SUFFIX = "_just_pressed";

/**
 * DSL v1（シーン/パーツ構成モデル）専用のレイアウト定数。
 * v0のみのソース（part/scene不使用）ではこの一帯は一切使われず、USER_VARS_STARTも
 * 従来どおり0x0bのままなので、v0の出力はバイト単位で不変に保たれる。
 * 詳細: C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md
 */
const CUR_INSTANCE_ZP = 0x0b; // 「今どのインスタンスを処理中か」を保持するスクラッチセル
const V1_USER_VARS_START = 0x0c; // v1ではCUR_INSTANCEの分だけユーザー変数開始位置がシフトする
const PART_RAM_START = 0x0300; // OAMシャドウ($0200-$02FF)の直後
const PART_RAM_END = 0x0800; // 内蔵RAM末尾（$0800以降はミラー領域）

function behaviorLabel(partType: string, behaviorName: string): string {
  return `behavior_${partType}_${behaviorName}`;
}

/**
 * $4016 の8回シリアル読み出し順（A,B,Select,Start,Up,Down,Left,Right）を
 * ROL方式でキャッシュバイトに詰めた結果のビット割り当て。
 * （read_controller1 ランタイムルーチンの実装と対になっている）
 */
const BTN_BIT_MASK: Record<string, number> = {
  right: 0x01,
  left: 0x02,
  down: 0x04,
  up: 0x08,
  start: 0x10,
  select: 0x20,
  b: 0x40,
  a: 0x80,
};

interface BuiltinDef {
  label: string;
  arity: number;
}

const BUILTINS: Record<string, BuiltinDef> = {
  setPalette: { label: "set_palette", arity: 5 },
  setSpritePalette: { label: "set_sprite_palette", arity: 5 },
  drawSprite: { label: "draw_sprite", arity: 5 },
  playTone: { label: "play_tone", arity: 3 },
};

export class CodegenError extends Error {}

export interface SoundSequenceDef {
  /** ソート済みイベント（t, channel, note, duration）最大 32 */
  events: Array<{ t: number; channel: number; note: number; duration: number }>;
  /** true なら終端後に先頭へ戻して再生を続ける（BGM 用） */
  loop?: boolean;
}

export interface GenerateOptions {
  /**
   * パーツ種別ごとのタイル番号オフセット（Phase 3: 資産リンク）。
   * behavior本体内の drawSprite(...) 呼び出しで、tile引数が数値リテラルの場合のみ、
   * そのパーツ種別の連結後CHR-ROM上の開始位置を自動加算する。これにより各パーツの
   * ドット絵作者は自分のタイルシート内でのローカルな0起点の番号だけを意識すればよい。
   */
  tileOffsets?: ReadonlyMap<string, number>;
  /** playSequence(id) 用テーブル（id は配列インデックス） */
  sequences?: SoundSequenceDef[];
  /**
   * Create ビルド先マッパー。MMC1/MMC3 は起動時にバンク／ミラーを NROM 相当へ揃える初期化を埋め込む。
   */
  mapperId?: number;
  /**
   * true なら背景ネームテーブル描画を有効化し、fillBackground/setScroll/drawBgTile ランタイムと
   * NMI 末尾のスクロール再適用を埋め込む。CHR 先頭に空白タイルを置く前提（compile 側）。
   */
  enableBackground?: boolean;
}

function emitMmc1Control(e: Emitter, value: number): void {
  // シリアル書き込みをリセットしてから LSB 先に 5 bit
  e.LDA_IMM(0x80);
  e.STA_ABS(0x8000);
  for (let i = 0; i < 5; i++) {
    e.LDA_IMM((value >> i) & 1);
    e.STA_ABS(0x8000);
  }
}

function emitMapperBoot(e: Emitter, mapperId: number): void {
  if (mapperId === 1) {
    // horizontal + PRG mode 3 + CHR 8KB（電源時 single-screen を上書き）
    emitMmc1Control(e, 0x0e);
    return;
  }
  if (mapperId === 4) {
    // CHR を 8KB 線形、PRG を R6=0 / R7=1、ミラー horizontal
    const chrRegs = [0, 2, 4, 5, 6, 7];
    for (let r = 0; r < chrRegs.length; r++) {
      e.LDA_IMM(r);
      e.STA_ABS(0x8000);
      e.LDA_IMM(chrRegs[r]!);
      e.STA_ABS(0x8001);
    }
    e.LDA_IMM(6);
    e.STA_ABS(0x8000);
    e.LDA_IMM(0);
    e.STA_ABS(0x8001);
    e.LDA_IMM(7);
    e.STA_ABS(0x8000);
    e.LDA_IMM(1);
    e.STA_ABS(0x8001);
    e.LDA_IMM(1);
    e.STA_ABS(0xa000);
  }
}

export function generate(program: Program, options: GenerateOptions = {}): Uint8Array {
  const { tileOffsets, sequences = [], mapperId = 0, enableBackground = false } = options;
  const isV1 = program.parts.length > 0 || program.scenes.length > 0;
  const builtins: Record<string, BuiltinDef> = { ...BUILTINS };
  if (sequences.length > 0) {
    builtins.playSequence = { label: "play_sequence", arity: 1 };
  }
  if (enableBackground) {
    builtins.fillBackground = { label: "fill_background", arity: 1 };
    builtins.setScroll = { label: "set_scroll", arity: 2 };
    builtins.drawBgTile = { label: "draw_bg_tile", arity: 3 };
  }
  /** スクロール値（NMI で $2005 へ再書き込み）。シーケンス／シーン領域の直後。 */
  const SCROLL_X = 0x07e6;
  const SCROLL_Y = 0x07e7;

  if (isV1) {
    if (program.functions.length > 0) {
      throw new CodegenError(
        "part/sceneを使用する場合、トップレベルの function init/update は使用できません（sceneのinit/updateを使ってください）",
      );
    }
    if (program.scenes.length < 1) {
      throw new CodegenError(
        `sceneは1つ以上定義する必要があります（現在: ${program.scenes.length}個）`,
      );
    }
    builtins.gotoScene = { label: "goto_scene", arity: 1 };
  }

  const zp = new Map<string, number>();
  let nextAddr = isV1 ? V1_USER_VARS_START : USER_VARS_START;
  for (const g of program.globals) {
    if (zp.has(g.name)) {
      throw new CodegenError(`${g.line}行目: 変数 '${g.name}' が重複して宣言されています`);
    }
    if (nextAddr > 0xff) {
      throw new CodegenError(
        `${g.line}行目: ゼロページ（256バイト）がパンクしました！ 変数の数を減らしてください`,
      );
    }
    zp.set(g.name, nextAddr);
    nextAddr++;
  }

  // --- v1（シーン/パーツ構成モデル）専用: インスタンス配置とRAM(SoA)アロケーション ---
  // 全シーンの instance を合算して確保する（アクティブな1シーンだけが毎フレーム動く）。
  const scenes = isV1 ? program.scenes : [];
  const instanceInfo = new Map<string, { partType: string; index: number }>();
  const partInstanceCount = new Map<string, number>();
  const partFieldAddr = new Map<string, number>(); // key: `${partType}.${fieldName}` -> RAM先頭アドレス
  /** 現在のアクティブシーン番号（gotoScene / update 分岐用）。シーケンス領域の直後。 */
  const ACTIVE_SCENE = 0x07e5;

  if (isV1 && scenes.length > 0) {
    for (const scene of scenes) {
      for (const inst of scene.instances) {
        if (instanceInfo.has(inst.name)) {
          throw new CodegenError(
            `${inst.line}行目: インスタンス名 '${inst.name}' が重複しています（シーンをまたいでも一意にしてください）`,
          );
        }
        if (!program.parts.some((p) => p.name === inst.partType)) {
          throw new CodegenError(`${inst.line}行目: 未知のパーツ種別 '${inst.partType}' が参照されています`);
        }
        const count = partInstanceCount.get(inst.partType) ?? 0;
        instanceInfo.set(inst.name, { partType: inst.partType, index: count });
        partInstanceCount.set(inst.partType, count + 1);
      }
    }

    let ramAddr = PART_RAM_START;
    for (const part of program.parts) {
      // 未配置のパーツ種別も振る舞い自体はコンパイルする（未使用でもエラーにしない）ため、
      // 最低1インスタンス分は必ず確保しておく。
      const count = Math.max(partInstanceCount.get(part.name) ?? 0, 1);
      for (const field of part.fields) {
        if (ramAddr + count > PART_RAM_END) {
          throw new CodegenError(`${field.line}行目: パーツ用のRAM（$0300-$07FF）が不足しました`);
        }
        partFieldAddr.set(`${part.name}.${field.name}`, ramAddr);
        ramAddr += count;
      }
    }
  }

  function resolveGlobal(name: string, line: number): number {
    const addr = zp.get(name);
    if (addr === undefined) {
      throw new CodegenError(`${line}行目: 未宣言の変数 '${name}' が使用されています`);
    }
    return addr;
  }

  function resolvePartFieldAddr(partType: string, fieldName: string, line: number): number {
    const addr = partFieldAddr.get(`${partType}.${fieldName}`);
    if (addr === undefined) {
      throw new CodegenError(`${line}行目: パーツ '${partType}' にフィールド '${fieldName}' が見つかりません`);
    }
    return addr;
  }

  interface PartGenCtx {
    /** behavior本体をコンパイル中はそのパーツ種別名、scene本体をコンパイル中はnull（selfは使えない）。 */
    selfPartType: string | null;
  }

  function loadPartValueIntoA(v: PartValueExpr, ctx: PartGenCtx, line: number): void {
    if (v.kind === "num") {
      e.LDA_IMM(v.value);
      return;
    }
    if (v.kind === "ident") {
      e.LDA_ZP(resolveGlobal(v.name, line));
      return;
    }
    if (v.kind === "member_add") {
      loadPartValueIntoA({ kind: "member", object: v.object, property: v.property }, ctx, line);
      e.CLC();
      e.ADC_IMM(v.add & 0xff);
      return;
    }
    if (v.object === "self") {
      if (!ctx.selfPartType) {
        throw new CodegenError(`${line}行目: 'self' はbehavior内でのみ使用できます`);
      }
      const base = resolvePartFieldAddr(ctx.selfPartType, v.property, line);
      e.LDX_ZP(CUR_INSTANCE_ZP);
      e.LDA_ABS_X(base);
      return;
    }
    const inst = instanceInfo.get(v.object);
    if (inst) {
      const base = resolvePartFieldAddr(inst.partType, v.property, line);
      e.LDA_ABS(base + inst.index);
      return;
    }
    throw new CodegenError(`${line}行目: 未知のオブジェクト '${v.object}' が参照されています`);
  }

  function cmpPartValue(v: MemberExpr, ctx: PartGenCtx, line: number): void {
    if (v.object === "self") {
      if (!ctx.selfPartType) {
        throw new CodegenError(`${line}行目: 'self' はbehavior内でのみ使用できます`);
      }
      const base = resolvePartFieldAddr(ctx.selfPartType, v.property, line);
      e.LDX_ZP(CUR_INSTANCE_ZP);
      e.CMP_ABS_X(base);
      return;
    }
    const inst = instanceInfo.get(v.object);
    if (inst) {
      const base = resolvePartFieldAddr(inst.partType, v.property, line);
      e.CMP_ABS(base + inst.index);
      return;
    }
    throw new CodegenError(`${line}行目: 未知のオブジェクト '${v.object}' が参照されています`);
  }

  function storePartValueFromA(target: PartAssignTarget, ctx: PartGenCtx, line: number): void {
    if (target.kind === "ident") {
      e.STA_ZP(resolveGlobal(target.name, line));
      return;
    }
    if (target.object === "self") {
      if (!ctx.selfPartType) {
        throw new CodegenError(`${line}行目: 'self' はbehavior内でのみ使用できます`);
      }
      const base = resolvePartFieldAddr(ctx.selfPartType, target.property, line);
      e.LDX_ZP(CUR_INSTANCE_ZP);
      e.STA_ABS_X(base);
      return;
    }
    const inst = instanceInfo.get(target.object);
    if (inst) {
      const base = resolvePartFieldAddr(inst.partType, target.property, line);
      e.STA_ABS(base + inst.index);
      return;
    }
    throw new CodegenError(`${line}行目: 未知のオブジェクト '${target.object}' が参照されています`);
  }

  function genPartAssign(stmt: PartAssignStmt, ctx: PartGenCtx): void {
    if (stmt.op === "=") {
      loadPartValueIntoA(stmt.value, ctx, stmt.line);
      storePartValueFromA(stmt.target, ctx, stmt.line);
      return;
    }
    if (stmt.value.kind !== "num") {
      throw new CodegenError(`${stmt.line}行目: '+=' / '-=' の右辺は数値リテラルのみ対応しています（v0の制約）`);
    }
    loadPartValueIntoA(stmt.target, ctx, stmt.line);
    if (stmt.op === "+=") {
      e.CLC();
      e.ADC_IMM(stmt.value.value);
    } else {
      e.SEC();
      e.SBC_IMM(stmt.value.value);
    }
    storePartValueFromA(stmt.target, ctx, stmt.line);
  }

  function genPartCondSkip(cond: PartCond, ctx: PartGenCtx, skipLabel: string): void {
    if (cond.kind === "truthy") {
      if (cond.expr.kind === "member" && cond.expr.object === "btn") {
        const isJustPressed = cond.expr.property.endsWith(JUST_PRESSED_SUFFIX);
        const buttonName = isJustPressed
          ? cond.expr.property.slice(0, -JUST_PRESSED_SUFFIX.length)
          : cond.expr.property;
        const mask = BTN_BIT_MASK[buttonName];
        if (mask === undefined) {
          throw new CodegenError(`未知のボタン 'btn.${cond.expr.property}' が参照されています`);
        }
        if (isJustPressed) {
          e.LDA_ZP(BTN_STATE_ZP);
          e.EOR_ZP(BTN_STATE_PREV_ZP);
          e.AND_ZP(BTN_STATE_ZP);
        } else {
          e.LDA_ZP(BTN_STATE_ZP);
        }
        e.AND_IMM(mask);
        e.BEQ(skipLabel);
        return;
      }
      loadPartValueIntoA(cond.expr, ctx, 0);
      e.BEQ(skipLabel);
      return;
    }

    loadPartValueIntoA(cond.left, ctx, 0);
    if (cond.right.kind === "num") {
      e.CMP_IMM(cond.right.value);
    } else if (cond.right.kind === "ident") {
      e.CMP_ZP(resolveGlobal(cond.right.name, 0));
    } else if (cond.right.kind === "member_add") {
      throw new CodegenError(`比較の右辺に 'obj.field + N' は使えません（drawSprite 等の引数専用）`);
    } else if (cond.right.kind === "member") {
      cmpPartValue(cond.right, ctx, 0);
    }
    genCompareSkip(cond.op, skipLabel);
  }

  function genPartCall(call: PartCallExpr, ctx: PartGenCtx): void {
    const def = builtins[call.callee];
    if (!def) {
      throw new CodegenError(`${call.line}行目: 未知の関数 '${call.callee}' が呼び出されています`);
    }
    if (call.args.length !== def.arity) {
      throw new CodegenError(
        `${call.line}行目: '${call.callee}' の引数の数が正しくありません（期待:${def.arity}, 実際:${call.args.length}）`,
      );
    }
    call.args.forEach((arg, i) => {
      // drawSprite(id, x, y, tile, palette) の tile(index=3) が数値リテラルの場合のみ、
      // behavior内であればそのパーツ種別のタイルオフセットを自動加算する（Phase 3: 資産リンク）。
      const isDrawSpriteTileArg = call.callee === "drawSprite" && i === 3;
      if (isDrawSpriteTileArg && arg.kind === "num" && ctx.selfPartType && tileOffsets) {
        const offset = tileOffsets.get(ctx.selfPartType) ?? 0;
        const tile = arg.value + offset;
        if (tile > 0xff) {
          throw new CodegenError(
            `${call.line}行目: パーツ '${ctx.selfPartType}' のタイル番号がCHR-ROMの範囲(0-255)を超えました（計算値: ${tile}）`,
          );
        }
        e.LDA_IMM(tile);
      } else {
        loadPartValueIntoA(arg, ctx, call.line);
      }
      e.STA_ZP(ARG_BASE + i);
    });
    e.JSR(def.label);
  }

  function genBehaviorCall(stmt: BehaviorCallStmt): void {
    const inst = instanceInfo.get(stmt.instanceName);
    if (!inst) {
      throw new CodegenError(`${stmt.line}行目: 未知のインスタンス '${stmt.instanceName}' が参照されています`);
    }
    if (inst.partType !== stmt.partType) {
      throw new CodegenError(
        `${stmt.line}行目: インスタンス '${stmt.instanceName}' はパーツ種別 '${inst.partType}' であり、'${stmt.partType}' ではありません`,
      );
    }
    const part = program.parts.find((p) => p.name === stmt.partType);
    if (!part || !part.behaviors.some((b) => b.name === stmt.behaviorName)) {
      throw new CodegenError(
        `${stmt.line}行目: パーツ '${stmt.partType}' に振る舞い '${stmt.behaviorName}' が見つかりません`,
      );
    }
    e.LDA_IMM(inst.index);
    e.STA_ZP(ARG_BASE + 0);
    e.JSR(behaviorLabel(stmt.partType, stmt.behaviorName));
  }

  function genPartIf(stmt: PartIfStmt, ctx: PartGenCtx): void {
    const skipLabel = e.uniqueLabel("if_skip");
    genPartCondSkip(stmt.test, ctx, skipLabel);
    for (const s of stmt.consequent) genPartStmt(s, ctx);
    if (stmt.alternate) {
      const endLabel = e.uniqueLabel("if_end");
      e.JMP(endLabel);
      e.label(skipLabel);
      for (const s of stmt.alternate) genPartStmt(s, ctx);
      e.label(endLabel);
    } else {
      e.label(skipLabel);
    }
  }

  function genPartStmt(stmt: PartStmt, ctx: PartGenCtx): void {
    if (stmt.kind === "assign") genPartAssign(stmt, ctx);
    else if (stmt.kind === "if") genPartIf(stmt, ctx);
    else if (stmt.kind === "behaviorCall") genBehaviorCall(stmt);
    else genPartCall(stmt.call, ctx);
  }

  const initFn = isV1 ? null : program.functions.find((f) => f.name === "init");
  const updateFn = isV1 ? null : program.functions.find((f) => f.name === "update");
  if (!isV1 && !initFn) throw new CodegenError("init() 関数が見つかりません（必須です）");
  if (!isV1 && !updateFn) throw new CodegenError("update() 関数が見つかりません（必須です）");

  const e = new Emitter(0x8000);

  function resolveVar(name: string, line: number): number {
    const addr = zp.get(name);
    if (addr === undefined) {
      throw new CodegenError(`${line}行目: 未宣言の変数 '${name}' が使用されています`);
    }
    return addr;
  }

  function loadValueIntoA(v: ValueExpr, line: number): void {
    if (v.kind === "num") e.LDA_IMM(v.value);
    else e.LDA_ZP(resolveVar(v.name, line));
  }

  function genCall(call: CallExpr): void {
    const def = builtins[call.callee];
    if (!def) {
      throw new CodegenError(`${call.line}行目: 未知の関数 '${call.callee}' が呼び出されています`);
    }
    if (call.args.length !== def.arity) {
      throw new CodegenError(
        `${call.line}行目: '${call.callee}' の引数の数が正しくありません（期待:${def.arity}, 実際:${call.args.length}）`,
      );
    }
    call.args.forEach((arg: ArgExpr, i: number) => {
      loadValueIntoA(arg, call.line);
      e.STA_ZP(ARG_BASE + i);
    });
    e.JSR(def.label);
  }

  function genCompareSkip(op: CompareOp, skipLabel: string): void {
    switch (op) {
      case "==":
        e.BNE(skipLabel);
        return;
      case "!=":
        e.BEQ(skipLabel);
        return;
      case "<":
        e.BCS(skipLabel);
        return;
      case ">=":
        e.BCC(skipLabel);
        return;
      case ">":
        e.BCC(skipLabel);
        e.BEQ(skipLabel);
        return;
      case "<=": {
        const okLabel = e.uniqueLabel("le_ok");
        e.BCC(okLabel);
        e.BEQ(okLabel);
        e.JMP(skipLabel);
        e.label(okLabel);
        return;
      }
    }
  }

  function genCondSkip(cond: Cond, skipLabel: string): void {
    if (cond.kind === "truthy") {
      if (cond.expr.kind === "member") {
        if (cond.expr.object !== "btn") {
          throw new CodegenError(`未対応のオブジェクト '${cond.expr.object}' が参照されています（'btn'のみ対応）`);
        }
        const isJustPressed = cond.expr.property.endsWith(JUST_PRESSED_SUFFIX);
        const buttonName = isJustPressed
          ? cond.expr.property.slice(0, -JUST_PRESSED_SUFFIX.length)
          : cond.expr.property;
        const mask = BTN_BIT_MASK[buttonName];
        if (mask === undefined) {
          throw new CodegenError(`未知のボタン 'btn.${cond.expr.property}' が参照されています`);
        }
        if (isJustPressed) {
          // 「現在押されている」かつ「直前フレームでは押されていなかった」ビットのみ抽出する
          e.LDA_ZP(BTN_STATE_ZP);
          e.EOR_ZP(BTN_STATE_PREV_ZP);
          e.AND_ZP(BTN_STATE_ZP);
        } else {
          e.LDA_ZP(BTN_STATE_ZP);
        }
        e.AND_IMM(mask);
        e.BEQ(skipLabel);
      } else {
        e.LDA_ZP(resolveVar(cond.expr.name, 0));
        e.BEQ(skipLabel);
      }
      return;
    }

    e.LDA_ZP(resolveVar(cond.left.name, 0));
    if (cond.right.kind === "num") e.CMP_IMM(cond.right.value);
    else e.CMP_ZP(resolveVar(cond.right.name, 0));
    genCompareSkip(cond.op, skipLabel);
  }

  function genAssign(stmt: AssignStmt): void {
    const addr = resolveVar(stmt.name, stmt.line);
    if (stmt.op === "=") {
      loadValueIntoA(stmt.value, stmt.line);
      e.STA_ZP(addr);
      return;
    }
    if (stmt.value.kind !== "num") {
      throw new CodegenError(`${stmt.line}行目: '+=' / '-=' の右辺は数値リテラルのみ対応しています（v0の制約）`);
    }
    if (stmt.op === "+=") {
      if (stmt.value.value === 1) {
        e.INC_ZP(addr);
      } else {
        e.LDA_ZP(addr);
        e.CLC();
        e.ADC_IMM(stmt.value.value);
        e.STA_ZP(addr);
      }
    } else {
      if (stmt.value.value === 1) {
        e.DEC_ZP(addr);
      } else {
        e.LDA_ZP(addr);
        e.SEC();
        e.SBC_IMM(stmt.value.value);
        e.STA_ZP(addr);
      }
    }
  }

  function genIf(stmt: IfStmt): void {
    const skipLabel = e.uniqueLabel("if_skip");
    genCondSkip(stmt.test, skipLabel);
    for (const s of stmt.consequent) genStmt(s);
    if (stmt.alternate) {
      const endLabel = e.uniqueLabel("if_end");
      e.JMP(endLabel);
      e.label(skipLabel);
      for (const s of stmt.alternate) genStmt(s);
      e.label(endLabel);
    } else {
      e.label(skipLabel);
    }
  }

  function genStmt(stmt: Stmt): void {
    if (stmt.kind === "assign") genAssign(stmt);
    else if (stmt.kind === "if") genIf(stmt);
    else genCall(stmt.call);
  }

  // --- reset ルーチン ---
  const needsMapperBoot = mapperId === 1 || mapperId === 4;
  if (needsMapperBoot) {
    e.label("boot");
    emitMapperBoot(e, mapperId);
  }
  e.label("reset");
  e.SEI();
  e.CLD();
  e.LDX_IMM(0xff);
  e.TXS();
  e.LDA_IMM(0x00);
  e.STA_ABS(0x2000);
  e.STA_ABS(0x2001);
  e.label("vblankwait1");
  e.BIT_ABS(0x2002);
  e.BPL("vblankwait1");
  e.label("vblankwait2");
  e.BIT_ABS(0x2002);
  e.BPL("vblankwait2");

  for (const g of program.globals) {
    e.LDA_IMM(g.init);
    e.STA_ZP(zp.get(g.name)!);
  }

  if (isV1) {
    // v1: パーツ種別ごとのフィールド初期値を、配置された各インスタンス分だけRAMへ書き込む。
    for (const part of program.parts) {
      const count = Math.max(partInstanceCount.get(part.name) ?? 0, 1);
      for (const field of part.fields) {
        const base = partFieldAddr.get(`${part.name}.${field.name}`)!;
        for (let i = 0; i < count; i++) {
          e.LDA_IMM(field.init);
          e.STA_ABS(base + i);
        }
      }
    }
  }

  e.LDA_IMM(0b0000_1111); // $4015: Pulse1/Pulse2/Triangle/Noiseを有効化
  e.STA_ABS(0x4015);
  if (sequences.length > 0) {
    e.LDA_IMM(0);
    e.STA_ABS(0x07e0); // SEQ_ACTIVE クリア
  }

  if (enableBackground) {
    e.LDA_IMM(0);
    e.STA_ABS(SCROLL_X);
    e.STA_ABS(SCROLL_Y);
    // ネームテーブル0をタイル0（空白）で塗り、属性も0に
    e.LDA_IMM(0);
    e.STA_ZP(ARG_BASE + 0);
    e.JSR("fill_background");
  }

  // OAMシャドウ($0200-$02FF)を$FFで埋めておく。drawSprite()で使わなかったスプライト
  // （Y座標が0のまま）は画面上端に表示されてしまうため、Y=$FF（画面外）にして
  // 明示的にdrawSprite()されるまで非表示にする。
  e.LDA_IMM(0xff);
  e.LDX_IMM(0x00);
  e.label("clear_oam_loop");
  e.DEX();
  e.STA_ABS_X(0x0200);
  e.BNE("clear_oam_loop");

  e.JSR("init_user");
  e.LDA_IMM(0b1000_0000); // PPUCTRL: NMI有効、ネームテーブル0
  e.STA_ABS(0x2000);
  // $2006/$2007 で v が汚れるため、描画有効化直前にスクロールを明示リセット
  e.LDA_ABS(0x2002); // w リセット
  if (enableBackground) {
    e.LDA_ABS(SCROLL_X);
    e.STA_ABS(0x2005);
    e.LDA_ABS(SCROLL_Y);
    e.STA_ABS(0x2005);
    // PPUMASK: 背景＋スプライト（左端8pxも表示）
    e.LDA_IMM(0b0001_1110);
  } else {
    e.LDA_IMM(0);
    e.STA_ABS(0x2005);
    e.STA_ABS(0x2005);
    // PPUMASK: スプライトのみ（背景ネームテーブル未使用時の既定）
    e.LDA_IMM(0b0001_0000);
  }
  e.STA_ABS(0x2001);
  e.label("forever");
  e.JMP("forever");

  // --- NMIハンドラ ---
  // メインループは何もしないだけなので、A/X/Yレジスタの退避は不要（割り込み元が状態を参照しないため）。
  e.label("nmi_handler");
  e.LDA_ZP(BTN_STATE_ZP);
  e.STA_ZP(BTN_STATE_PREV_ZP); // _just_pressed判定用に、上書きされる前の状態を退避
  e.JSR("read_controller1");
  e.JSR("sound_tick");
  if (sequences.length > 0) {
    e.JSR("seq_tick");
  }
  e.JSR("update_user");
  e.LDA_IMM(0x02); // OAMシャドウ($0200-$02FF)のページ番号
  e.STA_ABS(0x4014); // OAM DMA発火（drawSpriteの結果をPPU側OAMへ反映）
  if (enableBackground) {
    e.LDA_ABS(0x2002);
    e.LDA_IMM(0b1000_0000);
    e.STA_ABS(0x2000);
    e.LDA_ABS(SCROLL_X);
    e.STA_ABS(0x2005);
    e.LDA_ABS(SCROLL_Y);
    e.STA_ABS(0x2005);
  }
  e.RTI();

  // --- ランタイム: 標準コントローラ読み取り ---
  e.label("read_controller1");
  e.LDA_IMM(0x01);
  e.STA_ABS(0x4016);
  e.LDA_IMM(0x00);
  e.STA_ABS(0x4016);
  e.LDX_IMM(0x08);
  e.label("read_controller1_loop");
  e.LDA_ABS(0x4016);
  e.LSR_ACC();
  e.ROL_ZP(BTN_STATE_ZP);
  e.DEX();
  e.BNE("read_controller1_loop");
  e.RTS();

  // --- ランタイム: drawSprite(id, x, y, tile, palette) ---
  // OAMシャドウ($0200-$02FF)へ書き込み、NMIハンドラ末尾のOAM DMA($4014)でPPU側OAMへ反映される。
  // 画面上へのスプライト描画（PPU側のOAM読み出し・合成）自体はM4で対応する。
  // palette（0-3）は属性バイトのbit0-1にそのまま入り、setSpritePalette()で設定した
  // 4つのスプライトパレットのどれを使うかを実機同様スプライトごとに選べる。
  e.label("draw_sprite");
  e.LDA_ZP(ARG_BASE + 0); // id
  e.ASL_ACC();
  e.ASL_ACC(); // id * 4
  e.TAX();
  e.LDA_ZP(ARG_BASE + 2); // y
  e.STA_ABS_X(0x0200);
  e.LDA_ZP(ARG_BASE + 3); // tile
  e.STA_ABS_X(0x0201);
  e.LDA_ZP(ARG_BASE + 4); // palette(0-3)
  e.AND_IMM(0x03);
  e.STA_ABS_X(0x0202);
  e.LDA_ZP(ARG_BASE + 1); // x
  e.STA_ABS_X(0x0203);
  e.RTS();

  // --- ランタイム: setPalette(slot, c0, c1, c2, c3) ---
  // slotは実機の制約どおり0-3の4パレットのみ（AND #$03でマスクし、範囲外指定が
  // スプライトパレット領域$3F10以降を巻き込んで壊すことのないようにする）。
  e.label("set_palette");
  e.LDA_IMM(0x3f);
  e.STA_ABS(0x2006);
  e.LDA_ZP(ARG_BASE + 0); // slot
  e.AND_IMM(0x03);
  e.ASL_ACC();
  e.ASL_ACC(); // slot * 4
  e.STA_ABS(0x2006);
  e.LDA_ZP(ARG_BASE + 1);
  e.STA_ABS(0x2007);
  e.LDA_ZP(ARG_BASE + 2);
  e.STA_ABS(0x2007);
  e.LDA_ZP(ARG_BASE + 3);
  e.STA_ABS(0x2007);
  e.LDA_ZP(ARG_BASE + 4);
  e.STA_ABS(0x2007);
  e.RTS();

  // --- ランタイム: setSpritePalette(slot, c0, c1, c2, c3) ---
  // スプライト用パレットは $3F10 起点（背景パレットの $3F00 起点に +$10 したアドレス）。
  // slotは実機の制約どおり0-3の4パレットのみ（AND #$03でマスクし、範囲外指定が
  // パレットRAMの32バイトを巻いて背景パレット領域を壊すことのないようにする）。
  e.label("set_sprite_palette");
  e.LDA_IMM(0x3f);
  e.STA_ABS(0x2006);
  e.LDA_ZP(ARG_BASE + 0); // slot
  e.AND_IMM(0x03);
  e.ASL_ACC();
  e.ASL_ACC(); // slot * 4
  e.CLC();
  e.ADC_IMM(0x10);
  e.STA_ABS(0x2006);
  e.LDA_ZP(ARG_BASE + 1);
  e.STA_ABS(0x2007);
  e.LDA_ZP(ARG_BASE + 2);
  e.STA_ABS(0x2007);
  e.LDA_ZP(ARG_BASE + 3);
  e.STA_ABS(0x2007);
  e.LDA_ZP(ARG_BASE + 4);
  e.STA_ABS(0x2007);
  e.RTS();

  // --- ランタイム: fillBackground(tile) / setScroll(x,y) / drawBgTile(tx,ty,tile) ---
  // enableBackground 時のみ埋め込む（未使用なら PRG を食わない）。
  if (enableBackground) {
    // ネームテーブル0（$2000）の 1024 バイト（32x30 タイル + 属性64）を同一タイルで埋める
    e.label("fill_background");
    e.LDA_IMM(0x20);
    e.STA_ABS(0x2006);
    e.LDA_IMM(0x00);
    e.STA_ABS(0x2006);
    e.LDA_ZP(ARG_BASE + 0);
    e.LDX_IMM(0x00);
    e.label("fill_bg_outer");
    e.LDY_IMM(0x00);
    e.label("fill_bg_inner");
    e.STA_ABS(0x2007);
    e.DEY();
    e.BNE("fill_bg_inner");
    e.INX();
    e.CPX_IMM(0x04);
    e.BNE("fill_bg_outer");
    e.RTS();

    e.label("set_scroll");
    e.LDA_ZP(ARG_BASE + 0);
    e.STA_ABS(SCROLL_X);
    e.LDA_ZP(ARG_BASE + 1);
    e.STA_ABS(SCROLL_Y);
    e.RTS();

    // drawBgTile(tx, ty, tile): tx=0..31, ty=0..29 → PPUADDR = $2000 + ty*32 + tx
    e.label("draw_bg_tile");
    e.LDA_ZP(ARG_BASE + 1); // ty
    e.ASL_ACC();
    e.ASL_ACC();
    e.ASL_ACC();
    e.ASL_ACC();
    e.ASL_ACC(); // ty * 32（下位）
    e.CLC();
    e.ADC_ZP(ARG_BASE + 0); // + tx
    e.STA_ZP(ARG_BASE + 3); // lo scratch
    e.LDA_ZP(ARG_BASE + 1);
    e.LSR_ACC();
    e.LSR_ACC();
    e.LSR_ACC(); // ty >> 3 = high bits of ty*32
    e.CLC();
    e.ADC_IMM(0x20);
    e.STA_ABS(0x2006);
    e.LDA_ZP(ARG_BASE + 3);
    e.STA_ABS(0x2006);
    e.LDA_ZP(ARG_BASE + 2);
    e.STA_ABS(0x2007);
    e.RTS();
  }

  // --- ランタイム: サウンド発音時間の管理（毎NMIで1回呼ばれる） ---
  // playTone()はハードウェアのレングスカウンタを使わず（halt/loopビットで自動減衰を無効化した上で）、
  // ここでソフトウェア的にフレーム数をカウントダウンし、0になったチャンネルを無音化する。
  const DUR0 = SOUND_DUR_BASE + 0; // Pulse1
  const DUR1 = SOUND_DUR_BASE + 1; // Pulse2
  const DUR2 = SOUND_DUR_BASE + 2; // Triangle
  const DUR3 = SOUND_DUR_BASE + 3; // Noise

  e.label("sound_tick");

  e.LDA_ZP(DUR0);
  e.BEQ("sound_tick_ch0_done");
  e.DEC_ZP(DUR0);
  e.BNE("sound_tick_ch0_done");
  e.LDA_IMM(0b0011_0000); // halt=1, constant volume=1, volume=0
  e.STA_ABS(0x4000);
  e.label("sound_tick_ch0_done");

  e.LDA_ZP(DUR1);
  e.BEQ("sound_tick_ch1_done");
  e.DEC_ZP(DUR1);
  e.BNE("sound_tick_ch1_done");
  e.LDA_IMM(0b0011_0000);
  e.STA_ABS(0x4004);
  e.label("sound_tick_ch1_done");

  e.LDA_ZP(DUR2);
  e.BEQ("sound_tick_ch2_done");
  e.DEC_ZP(DUR2);
  e.BNE("sound_tick_ch2_done");
  e.LDA_IMM(0b1000_0000); // halt=1, linear counter reload=0（実質無音化）
  e.STA_ABS(0x4008);
  e.label("sound_tick_ch2_done");

  e.LDA_ZP(DUR3);
  e.BEQ("sound_tick_ch3_done");
  e.DEC_ZP(DUR3);
  e.BNE("sound_tick_ch3_done");
  e.LDA_IMM(0b0011_0000);
  e.STA_ABS(0x400c);
  e.label("sound_tick_ch3_done");

  e.RTS();

  // --- ランタイム: playTone(channel, noteIndex, duration) ---
  // channel: 0=Pulse1, 1=Pulse2, 2=Triangle, 3=Noise
  // noteIndex: 0-35（Pulse/Triangleは音階テーブル参照）、Noiseのみ0-15の実機ノイズ周期インデックス直指定
  // duration: 発音を継続するフレーム数（約1/60秒単位）。0を指定するとその場で無音化される。
  e.label("play_tone");
  e.LDA_ZP(ARG_BASE + 0);
  e.CMP_IMM(0);
  e.BEQ("play_tone_ch0");
  e.CMP_IMM(1);
  e.BEQ("play_tone_ch1");
  e.CMP_IMM(2);
  e.BEQ("play_tone_ch2");
  e.JMP("play_tone_ch3");

  e.label("play_tone_ch0");
  e.LDA_IMM(0b1011_1111); // duty=10(50%), halt=1, constant volume=1, volume=15
  e.STA_ABS(0x4000);
  e.LDA_ZP(ARG_BASE + 1); // noteIndex(0-35)がそのままテーブルのオフセット
  e.TAX();
  e.LDA_ABS_X_LABEL("pulse_period_lo");
  e.STA_ABS(0x4002);
  e.LDA_ABS_X_LABEL("pulse_period_hi");
  e.STA_ABS(0x4003);
  e.LDA_ZP(ARG_BASE + 2);
  e.STA_ZP(DUR0);
  e.RTS();

  e.label("play_tone_ch1");
  e.LDA_IMM(0b1011_1111);
  e.STA_ABS(0x4004);
  e.LDA_ZP(ARG_BASE + 1);
  e.TAX();
  e.LDA_ABS_X_LABEL("pulse_period_lo");
  e.STA_ABS(0x4006);
  e.LDA_ABS_X_LABEL("pulse_period_hi");
  e.STA_ABS(0x4007);
  e.LDA_ZP(ARG_BASE + 2);
  e.STA_ZP(DUR1);
  e.RTS();

  e.label("play_tone_ch2");
  e.LDA_IMM(0b1111_1111); // halt=1, linear counter reload=127(最大, 常時再生)
  e.STA_ABS(0x4008);
  e.LDA_ZP(ARG_BASE + 1);
  e.TAX();
  e.LDA_ABS_X_LABEL("tri_period_lo");
  e.STA_ABS(0x400a);
  e.LDA_ABS_X_LABEL("tri_period_hi");
  e.STA_ABS(0x400b);
  e.LDA_ZP(ARG_BASE + 2);
  e.STA_ZP(DUR2);
  e.RTS();

  e.label("play_tone_ch3");
  e.LDA_IMM(0b0011_1111); // halt=1, constant volume=1, volume=15
  e.STA_ABS(0x400c);
  e.LDA_ZP(ARG_BASE + 1); // noteIndexをそのままノイズ周期インデックス(0-15)として使用
  e.AND_IMM(0x0f);
  e.STA_ABS(0x400e);
  // $400Fへの書き込みは、ノイズ自体のパラメータとしては意味を持たないが、実機は
  // この書き込みでレングスカウンタをロードする（$4003/$4007/$400B等と共通の仕様）。
  // これを書かないとレングスカウンタが0のままチャンネルが無音扱いになってしまうため、
  // duration管理はhaltビットでソフトウェア(sound_tick)側に委ねつつも、この一撃は必要。
  e.STA_ABS(0x400f);
  e.LDA_ZP(ARG_BASE + 2);
  e.STA_ZP(DUR3);
  e.RTS();

  // --- シーケンス再生（ピアノロール）。シーケンス資産があるときだけ埋め込む ---
  if (sequences.length > 0) {
    const SEQ_PTR = 0xfe;
    const SEQ_ACTIVE = 0x07e0;
    const SEQ_FRAME = 0x07e1;
    const SEQ_LEFT = 0x07e2;
    const SEQ_ID = 0x07e3;
    const SEQ_LOOP = 0x07e4;

    e.label("seq_tick");
    e.LDA_ABS(SEQ_ACTIVE);
    e.BEQ("seq_tick_done");
    e.label("seq_tick_fire");
    e.LDA_ABS(SEQ_LEFT);
    e.BEQ("seq_tick_finish");
    e.LDY_IMM(0);
    e.LDA_IND_Y(SEQ_PTR);
    e.CMP_ABS(SEQ_FRAME);
    e.BNE("seq_tick_advance_frame");
    e.LDY_IMM(1);
    e.LDA_IND_Y(SEQ_PTR);
    e.STA_ZP(ARG_BASE + 0);
    e.LDY_IMM(2);
    e.LDA_IND_Y(SEQ_PTR);
    e.STA_ZP(ARG_BASE + 1);
    e.LDY_IMM(3);
    e.LDA_IND_Y(SEQ_PTR);
    e.STA_ZP(ARG_BASE + 2);
    e.JSR("play_tone");
    e.CLC();
    e.LDA_ZP(SEQ_PTR);
    e.ADC_IMM(4);
    e.STA_ZP(SEQ_PTR);
    e.LDA_ZP(SEQ_PTR + 1);
    e.ADC_IMM(0);
    e.STA_ZP(SEQ_PTR + 1);
    e.LDA_ABS(SEQ_LEFT);
    e.SEC();
    e.SBC_IMM(1);
    e.STA_ABS(SEQ_LEFT);
    e.JMP("seq_tick_fire");
    e.label("seq_tick_advance_frame");
    e.INC_ABS(SEQ_FRAME);
    e.RTS();
    e.label("seq_tick_finish");
    e.LDA_ABS(SEQ_LOOP);
    e.BEQ("seq_tick_stop");
    e.LDA_ABS(SEQ_ID);
    e.STA_ZP(ARG_BASE + 0);
    e.JMP("play_sequence");
    e.label("seq_tick_stop");
    e.LDA_IMM(0);
    e.STA_ABS(SEQ_ACTIVE);
    e.label("seq_tick_done");
    e.RTS();

    e.label("play_sequence");
    e.LDA_ZP(ARG_BASE + 0);
    e.STA_ABS(SEQ_ID);
    e.ASL_ACC();
    e.TAX();
    e.LDA_ABS_X_LABEL("seq_ptrs");
    e.STA_ZP(SEQ_PTR);
    e.INX();
    e.LDA_ABS_X_LABEL("seq_ptrs");
    e.STA_ZP(SEQ_PTR + 1);
    e.LDX_ZP(ARG_BASE + 0);
    e.LDA_ABS_X_LABEL("seq_loop_flags");
    e.STA_ABS(SEQ_LOOP);
    e.LDY_IMM(0);
    e.LDA_IND_Y(SEQ_PTR);
    e.STA_ABS(SEQ_LEFT);
    e.CLC();
    e.LDA_ZP(SEQ_PTR);
    e.ADC_IMM(1);
    e.STA_ZP(SEQ_PTR);
    e.LDA_ZP(SEQ_PTR + 1);
    e.ADC_IMM(0);
    e.STA_ZP(SEQ_PTR + 1);
    e.LDA_IMM(0);
    e.STA_ABS(SEQ_FRAME);
    e.LDA_IMM(1);
    e.STA_ABS(SEQ_ACTIVE);
    e.RTS();
  }

  // --- データ: 音階→APU周期テーブル（コンパイル時に生成、docs/03_DSL_SPEC.md参照） ---
  const pulsePeriods = buildPulsePeriodTable();
  const trianglePeriods = buildTrianglePeriodTable();
  e.label("pulse_period_lo");
  e.DB(...lowBytes(pulsePeriods));
  e.label("pulse_period_hi");
  e.DB(...highBytes(pulsePeriods));
  e.label("tri_period_lo");
  e.DB(...lowBytes(trianglePeriods));
  e.label("tri_period_hi");
  e.DB(...highBytes(trianglePeriods));

  // シーケンステーブル
  if (sequences.length > 0) {
    for (let i = 0; i < sequences.length; i++) {
      const events = sequences[i]!.events.slice(0, 32).sort((a, b) => a.t - b.t);
      e.label(`seq_data_${i}`);
      e.DB(events.length);
      for (const ev of events) {
        e.DB(ev.t & 0xff, ev.channel & 0xff, ev.note & 0xff, ev.duration & 0xff);
      }
    }
    e.label("seq_ptrs");
    for (let i = 0; i < sequences.length; i++) {
      e.DW_LABEL(`seq_data_${i}`);
    }
    e.label("seq_loop_flags");
    e.DB(...sequences.map((s) => (s.loop ? 1 : 0)));
  }

  // --- ユーザー関数 ---
  if (isV1) {
    // パーツ種別ごとの振る舞いサブルーチンを1本ずつコンパイルする（再帰なしJSR/RTS、
    // 「今どのインスタンスを処理中か」はARG_BASE+0経由でCUR_INSTANCEへ渡される規約）。
    for (const part of program.parts) {
      for (const behavior of part.behaviors) {
        e.label(behaviorLabel(part.name, behavior.name));
        e.LDA_ZP(ARG_BASE + 0);
        e.STA_ZP(CUR_INSTANCE_ZP);
        for (const s of behavior.body) genPartStmt(s, { selfPartType: part.name });
        e.RTS();
      }
    }

    for (let si = 0; si < scenes.length; si++) {
      const sc = scenes[si]!;
      const sceneInitFn = sc.functions.find((f) => f.name === "init");
      const sceneUpdateFn = sc.functions.find((f) => f.name === "update");
      if (!sceneInitFn) {
        throw new CodegenError(`scene '${sc.name}' に init() 関数が見つかりません（必須です）`);
      }
      if (!sceneUpdateFn) {
        throw new CodegenError(`scene '${sc.name}' に update() 関数が見つかりません（必須です）`);
      }

      e.label(`scene_init_${si}`);
      for (const s of sceneInitFn.body) genPartStmt(s, { selfPartType: null });
      e.RTS();

      e.label(`scene_update_${si}`);
      for (const s of sceneUpdateFn.body) genPartStmt(s, { selfPartType: null });
      e.RTS();
    }

    e.label("goto_scene");
    e.LDA_ZP(ARG_BASE + 0);
    e.STA_ABS(ACTIVE_SCENE);
    for (let si = 0; si < scenes.length; si++) {
      e.LDA_ABS(ACTIVE_SCENE);
      e.CMP_IMM(si);
      e.BNE(`goto_scene_skip_${si}`);
      e.JSR(`scene_init_${si}`);
      e.RTS();
      e.label(`goto_scene_skip_${si}`);
    }
    e.RTS();

    // 起動時は先頭シーン（宣言順0）をアクティブにして init する
    e.label("init_user");
    e.LDA_IMM(0);
    e.STA_ABS(ACTIVE_SCENE);
    e.JSR("scene_init_0");
    e.RTS();

    e.label("update_user");
    for (let si = 0; si < scenes.length; si++) {
      e.LDA_ABS(ACTIVE_SCENE);
      e.CMP_IMM(si);
      e.BNE(`update_user_skip_${si}`);
      e.JSR(`scene_update_${si}`);
      e.RTS();
      e.label(`update_user_skip_${si}`);
    }
    e.RTS();
  } else {
    e.label("init_user");
    for (const s of initFn!.body) genStmt(s);
    e.RTS();

    e.label("update_user");
    for (const s of updateFn!.body) genStmt(s);
    e.RTS();
  }

  const { bytes, labels } = e.assemble();
  if (bytes.length > 0x3ffa) {
    throw new CodegenError("生成されたコードが大きすぎます（割り込みベクタ領域と衝突しました）");
  }

  const prgRom = new Uint8Array(0x4000);
  prgRom.set(bytes, 0);
  const resetAddr = labels.get(needsMapperBoot ? "boot" : "reset")!;
  const nmiAddr = labels.get("nmi_handler")!;
  prgRom[0x3ffa] = nmiAddr & 0xff;
  prgRom[0x3ffb] = (nmiAddr >> 8) & 0xff;
  prgRom[0x3ffc] = resetAddr & 0xff;
  prgRom[0x3ffd] = (resetAddr >> 8) & 0xff;
  prgRom[0x3ffe] = resetAddr & 0xff; // IRQ/BRKは未使用のためresetにフォールバック
  prgRom[0x3fff] = (resetAddr >> 8) & 0xff;

  return prgRom;
}
