import { tokenize, type Token, type TokenType } from "./lexer.js";
import type {
  ArgExpr,
  AssignOp,
  CallExpr,
  Cond,
  CompareOp,
  FunctionDecl,
  GlobalDecl,
  IfStmt,
  Program,
  Stmt,
  ValueExpr,
} from "./ast.js";

export class ParseError extends Error {}

const COMPARE_OPS = new Set<TokenType>(["==", "!=", "<", ">", "<=", ">="]);

export function parse(source: string): Program {
  const tokens = tokenize(source);
  let pos = 0;

  function peek(): Token {
    return tokens[pos]!;
  }
  function advance(): Token {
    return tokens[pos++]!;
  }
  function check(type: TokenType): boolean {
    return peek().type === type;
  }
  function checkKeyword(word: string): boolean {
    return check("ident") && peek().value === word;
  }
  function expect(type: TokenType): Token {
    const t = advance();
    if (t.type !== type) {
      throw new ParseError(`${t.line}行目: '${type}' を期待しましたが '${t.value || t.type}' が見つかりました`);
    }
    return t;
  }

  function parseProgram(): Program {
    const globals: GlobalDecl[] = [];
    const functions: FunctionDecl[] = [];
    while (!check("eof")) {
      if (checkKeyword("let")) {
        globals.push(parseGlobalLet());
      } else if (checkKeyword("function")) {
        functions.push(parseFunctionDecl());
      } else {
        throw new ParseError(`${peek().line}行目: トップレベルでは let または function のみ使用できます`);
      }
    }
    return { globals, functions };
  }

  function parseGlobalLet(): GlobalDecl {
    const line = peek().line;
    advance(); // 'let'
    const name = expect("ident").value;
    expect("=");
    const numTok = expect("num");
    expect(";");
    return { name, init: numTok.num!, line };
  }

  function parseFunctionDecl(): FunctionDecl {
    advance(); // 'function'
    const nameTok = expect("ident");
    if (nameTok.value !== "init" && nameTok.value !== "update") {
      throw new ParseError(
        `${nameTok.line}行目: v0では関数は init と update のみ定義できます（'${nameTok.value}' は未対応）`,
      );
    }
    expect("(");
    expect(")");
    const body = parseBlock();
    return { name: nameTok.value, body };
  }

  function parseBlock(): Stmt[] {
    expect("{");
    const body: Stmt[] = [];
    while (!check("}")) body.push(parseStmt());
    expect("}");
    return body;
  }

  function parseStmt(): Stmt {
    if (checkKeyword("if")) return parseIf();

    const t = peek();
    if (t.type !== "ident") {
      throw new ParseError(`${t.line}行目: 文の先頭が不正です（'${t.value || t.type}'）`);
    }

    const savedPos = pos;
    const name = advance().value;

    if (check("(")) {
      pos = savedPos;
      const call = parseCallExpr();
      expect(";");
      return { kind: "callStmt", call };
    }

    if (check("=") || check("+=") || check("-=")) {
      const opTok = advance();
      const value = parseValueExpr();
      expect(";");
      return { kind: "assign", name, op: opTok.type as AssignOp, value, line: t.line };
    }

    throw new ParseError(`${t.line}行目: '${name}' の後には代入か関数呼び出しが必要です`);
  }

  function parseValueExpr(): ValueExpr {
    const t = advance();
    if (t.type === "num") return { kind: "num", value: t.num! };
    if (t.type === "ident") return { kind: "ident", name: t.value };
    throw new ParseError(`${t.line}行目: 数値または変数名が必要です`);
  }

  function parseArg(): ArgExpr {
    return parseValueExpr();
  }

  function parseCallExpr(): CallExpr {
    const nameTok = expect("ident");
    expect("(");
    const args: ArgExpr[] = [];
    if (!check(")")) {
      args.push(parseArg());
      while (check(",")) {
        advance();
        args.push(parseArg());
      }
    }
    expect(")");
    return { kind: "call", callee: nameTok.value, args, line: nameTok.line };
  }

  function parseIf(): IfStmt {
    advance(); // 'if'
    expect("(");
    const test = parseCond();
    expect(")");
    const consequent = parseBlock();
    let alternate: Stmt[] | null = null;
    if (checkKeyword("else")) {
      advance();
      alternate = parseBlock();
    }
    return { kind: "if", test, consequent, alternate };
  }

  function parseCond(): Cond {
    if (checkKeyword("btn")) {
      const objTok = advance();
      expect(".");
      const propTok = expect("ident");
      return { kind: "truthy", expr: { kind: "member", object: objTok.value, property: propTok.value } };
    }

    const leftTok = expect("ident");
    const left = { kind: "ident" as const, name: leftTok.value };

    if (COMPARE_OPS.has(peek().type)) {
      const opTok = advance();
      const right = parseArg();
      return { kind: "compare", op: opTok.type as CompareOp, left, right };
    }

    return { kind: "truthy", expr: left };
  }

  return parseProgram();
}
