import { tokenize, type Token, type TokenType } from "./lexer.js";
import type {
  ArgExpr,
  AssignOp,
  BehaviorCallStmt,
  BehaviorDecl,
  CallExpr,
  Cond,
  CompareOp,
  FieldDecl,
  FunctionDecl,
  GlobalDecl,
  IfStmt,
  InstanceDecl,
  PartArgExpr,
  PartAssignTarget,
  PartCallExpr,
  PartCond,
  PartDecl,
  PartStmt,
  PartValueExpr,
  Program,
  SceneDecl,
  SceneFunctionDecl,
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
    const parts: PartDecl[] = [];
    const scenes: SceneDecl[] = [];
    while (!check("eof")) {
      if (checkKeyword("let")) {
        globals.push(parseGlobalLet());
      } else if (checkKeyword("function")) {
        functions.push(parseFunctionDecl());
      } else if (checkKeyword("part")) {
        parts.push(parsePartDecl());
      } else if (checkKeyword("scene")) {
        scenes.push(parseSceneDecl());
      } else {
        throw new ParseError(
          `${peek().line}行目: トップレベルでは let, function, part, scene のみ使用できます`,
        );
      }
    }
    return { globals, functions, parts, scenes };
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

  // --- DSL v1（シーン/パーツ構成モデル）専用のパース関数群 ---
  // v0の parseStmt/parseValueExpr/parseCond/parseCallExpr は一切変更せず、
  // part/scene本体のためだけの並行した関数として追加する（既存コードへの影響を避けるため）。

  function parsePartDecl(): PartDecl {
    const line = peek().line;
    advance(); // 'part'
    const name = expect("ident").value;
    expect("{");
    const fields: FieldDecl[] = [];
    const behaviors: BehaviorDecl[] = [];
    while (!check("}")) {
      if (checkKeyword("field")) {
        fields.push(parseFieldDecl());
      } else if (checkKeyword("behavior")) {
        behaviors.push(parseBehaviorDecl());
      } else {
        throw new ParseError(`${peek().line}行目: partブロック内では field または behavior のみ使用できます`);
      }
    }
    expect("}");
    return { name, fields, behaviors, line };
  }

  function parseFieldDecl(): FieldDecl {
    const line = peek().line;
    advance(); // 'field'
    const name = expect("ident").value;
    expect("=");
    const numTok = expect("num");
    expect(";");
    return { name, init: numTok.num!, line };
  }

  function parseBehaviorDecl(): BehaviorDecl {
    const line = peek().line;
    advance(); // 'behavior'
    const name = expect("ident").value;
    expect("(");
    const selfTok = expect("ident");
    if (selfTok.value !== "self") {
      throw new ParseError(`${selfTok.line}行目: behaviorの引数は 'self' のみ使用できます`);
    }
    expect(")");
    const body = parsePartBlock();
    return { name, body, line };
  }

  function parseSceneDecl(): SceneDecl {
    const line = peek().line;
    advance(); // 'scene'
    const name = expect("ident").value;
    expect("{");
    const instances: InstanceDecl[] = [];
    const functions: SceneFunctionDecl[] = [];
    while (!check("}")) {
      if (checkKeyword("instance")) {
        instances.push(parseInstanceDecl());
      } else if (checkKeyword("function")) {
        functions.push(parseSceneFunctionDecl());
      } else {
        throw new ParseError(`${peek().line}行目: sceneブロック内では instance または function のみ使用できます`);
      }
    }
    expect("}");
    return { name, instances, functions, line };
  }

  function parseInstanceDecl(): InstanceDecl {
    const line = peek().line;
    advance(); // 'instance'
    const name = expect("ident").value;
    expect(":");
    const partType = expect("ident").value;
    expect(";");
    return { name, partType, line };
  }

  function parseSceneFunctionDecl(): SceneFunctionDecl {
    advance(); // 'function'
    const nameTok = expect("ident");
    if (nameTok.value !== "init" && nameTok.value !== "update") {
      throw new ParseError(
        `${nameTok.line}行目: sceneの関数は init と update のみ定義できます（'${nameTok.value}' は未対応）`,
      );
    }
    expect("(");
    expect(")");
    const body = parsePartBlock();
    return { name: nameTok.value, body };
  }

  function parsePartBlock(): PartStmt[] {
    expect("{");
    const body: PartStmt[] = [];
    while (!check("}")) body.push(parsePartStmt());
    expect("}");
    return body;
  }

  function parsePartStmt(): PartStmt {
    if (checkKeyword("if")) return parsePartIf();

    const t = peek();
    if (t.type !== "ident") {
      throw new ParseError(`${t.line}行目: 文の先頭が不正です（'${t.value || t.type}'）`);
    }

    const savedPos = pos;
    const nameTok = advance();

    if (check(".")) {
      advance(); // '.'
      const propTok = expect("ident");

      if (check("(")) {
        // PartType.behaviorName(instanceName); — パーツ種別の振る舞い呼び出し文
        advance(); // '('
        const instanceTok = expect("ident");
        expect(")");
        expect(";");
        const stmt: BehaviorCallStmt = {
          kind: "behaviorCall",
          partType: nameTok.value,
          behaviorName: propTok.value,
          instanceName: instanceTok.value,
          line: nameTok.line,
        };
        return stmt;
      }

      // object.property (= | += | -=) value; — self.field / instanceName.field への代入
      const target: PartAssignTarget = { kind: "member", object: nameTok.value, property: propTok.value };
      if (check("=") || check("+=") || check("-=")) {
        const opTok = advance();
        const value = parsePartValueExpr();
        expect(";");
        return { kind: "assign", target, op: opTok.type as AssignOp, value, line: nameTok.line };
      }
      throw new ParseError(
        `${propTok.line}行目: '${nameTok.value}.${propTok.value}' の後には代入か関数呼び出しが必要です`,
      );
    }

    if (check("(")) {
      pos = savedPos;
      const call = parsePartCallExpr();
      expect(";");
      return { kind: "callStmt", call };
    }

    if (check("=") || check("+=") || check("-=")) {
      const opTok = advance();
      const value = parsePartValueExpr();
      expect(";");
      return {
        kind: "assign",
        target: { kind: "ident", name: nameTok.value },
        op: opTok.type as AssignOp,
        value,
        line: nameTok.line,
      };
    }

    throw new ParseError(`${nameTok.line}行目: '${nameTok.value}' の後には代入か関数呼び出しが必要です`);
  }

  function parsePartIf(): PartStmt {
    advance(); // 'if'
    expect("(");
    const test = parsePartCond();
    expect(")");
    const consequent = parsePartBlock();
    let alternate: PartStmt[] | null = null;
    if (checkKeyword("else")) {
      advance();
      alternate = parsePartBlock();
    }
    return { kind: "if", test, consequent, alternate };
  }

  function parsePartValueExpr(): PartValueExpr {
    const t = advance();
    if (t.type === "num") return { kind: "num", value: t.num! };
    if (t.type === "ident") {
      if (check(".")) {
        advance();
        const propTok = expect("ident");
        if (check("+")) {
          advance();
          const numTok = expect("num");
          return {
            kind: "member_add",
            object: t.value,
            property: propTok.value,
            add: numTok.num!,
          };
        }
        return { kind: "member", object: t.value, property: propTok.value };
      }
      return { kind: "ident", name: t.value };
    }
    throw new ParseError(`${t.line}行目: 数値または変数名が必要です`);
  }

  function parsePartArg(): PartArgExpr {
    return parsePartValueExpr();
  }

  function parsePartCallExpr(): PartCallExpr {
    const nameTok = expect("ident");
    expect("(");
    const args: PartArgExpr[] = [];
    if (!check(")")) {
      args.push(parsePartArg());
      while (check(",")) {
        advance();
        args.push(parsePartArg());
      }
    }
    expect(")");
    return { kind: "call", callee: nameTok.value, args, line: nameTok.line };
  }

  function parsePartCond(): PartCond {
    const leftTok = expect("ident");
    let leftExpr: PartAssignTarget = { kind: "ident", name: leftTok.value };
    if (check(".")) {
      advance();
      const propTok = expect("ident");
      leftExpr = { kind: "member", object: leftTok.value, property: propTok.value };
    }

    if (COMPARE_OPS.has(peek().type)) {
      const opTok = advance();
      const right = parsePartArg();
      return { kind: "compare", op: opTok.type as CompareOp, left: leftExpr, right };
    }

    return { kind: "truthy", expr: leftExpr };
  }

  return parseProgram();
}
