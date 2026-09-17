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
}
