/**
 * JS風DSL v0 の AST 定義。
 * サポート範囲は docs/03_DSL_SPEC.md のv0サブセットに準拠する。
 */

export interface NumLit {
  kind: "num";
  value: number;
}

export interface Ident {
  kind: "ident";
  name: string;
}

export interface MemberExpr {
  kind: "member";
  object: string;
  property: string;
}

/** 数値リテラルまたは変数参照のみ（v0では複合式を認めない） */
export type ArgExpr = NumLit | Ident;
export type ValueExpr = NumLit | Ident;

export interface CallExpr {
  kind: "call";
  callee: string;
  args: ArgExpr[];
  line: number;
}

export type CompareOp = "==" | "!=" | "<" | ">" | "<=" | ">=";

export interface CompareCond {
  kind: "compare";
  op: CompareOp;
  left: Ident;
  right: ArgExpr;
}

export interface TruthyCond {
  kind: "truthy";
  expr: MemberExpr | Ident;
}

export type Cond = CompareCond | TruthyCond;

export type AssignOp = "=" | "+=" | "-=";

export interface AssignStmt {
  kind: "assign";
  name: string;
  op: AssignOp;
  value: ValueExpr;
  line: number;
}

export interface IfStmt {
  kind: "if";
  test: Cond;
  consequent: Stmt[];
  alternate: Stmt[] | null;
}

export interface CallStmt {
  kind: "callStmt";
  call: CallExpr;
}

export type Stmt = AssignStmt | IfStmt | CallStmt;

export interface GlobalDecl {
  name: string;
  init: number;
  line: number;
}

export interface FunctionDecl {
  name: "init" | "update";
  body: Stmt[];
}

export interface Program {
  globals: GlobalDecl[];
  functions: FunctionDecl[];
  parts: PartDecl[];
  scenes: SceneDecl[];
}

/**
 * DSL v1（シーン/パーツ構成モデル）の追加構文。
 * v0の Stmt/ArgExpr/ValueExpr/Cond 系はここでは一切変更せず、part/scene本体専用の
 * 並行した型として追加する（既存のcodegen.tsが一切影響を受けないようにするため）。
 * 詳細: C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md
 */

/** partのフィールド宣言。GlobalDeclと同じ形（name/init/line）を再利用する。 */
export type FieldDecl = GlobalDecl;

/** 数値リテラル・変数参照に加え、self.field / instanceName.field のメンバー参照も許す。 */
export type PartValueExpr = NumLit | Ident | MemberExpr | MemberAddExpr;
export type PartArgExpr = NumLit | Ident | MemberExpr | MemberAddExpr;

/** self.x + 8 のような「メンバー + 即値」のみ（複数タイル描画用）。 */
export interface MemberAddExpr {
  kind: "member_add";
  object: string;
  property: string;
  add: number;
}

export interface PartCallExpr {
  kind: "call";
  callee: string;
  args: PartArgExpr[];
  line: number;
}

export interface PartCompareCond {
  kind: "compare";
  op: CompareOp;
  left: Ident | MemberExpr;
  right: PartArgExpr;
}

/** TruthyCondは元々Ident|MemberExprのみに依存しており、part/scene本体でもそのまま使える。 */
export type PartCond = PartCompareCond | TruthyCond;

export type PartAssignTarget = Ident | MemberExpr;

export interface PartAssignStmt {
  kind: "assign";
  target: PartAssignTarget;
  op: AssignOp;
  value: PartValueExpr;
  line: number;
}

export interface PartIfStmt {
  kind: "if";
  test: PartCond;
  consequent: PartStmt[];
  alternate: PartStmt[] | null;
}

export interface PartCallStmt {
  kind: "callStmt";
  call: PartCallExpr;
}

/** シーン本体からのみ許される、パーツ種別の振る舞い呼び出し文: PartType.behaviorName(instanceName); */
export interface BehaviorCallStmt {
  kind: "behaviorCall";
  partType: string;
  behaviorName: string;
  instanceName: string;
  line: number;
}

export type PartStmt = PartAssignStmt | PartIfStmt | PartCallStmt | BehaviorCallStmt;

export interface BehaviorDecl {
  name: string;
  body: PartStmt[];
  line: number;
}

export interface PartDecl {
  name: string;
  fields: FieldDecl[];
  behaviors: BehaviorDecl[];
  line: number;
}

export interface InstanceDecl {
  name: string;
  partType: string;
  line: number;
}

export interface SceneFunctionDecl {
  name: "init" | "update";
  body: PartStmt[];
}

export interface SceneDecl {
  name: string;
  instances: InstanceDecl[];
  functions: SceneFunctionDecl[];
  line: number;
}
