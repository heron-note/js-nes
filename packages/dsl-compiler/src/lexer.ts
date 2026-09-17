/**
 * JS風DSLの字句解析器。
 * v0でサポートする字句のみを対象とする（文字列・テンプレートリテラル等は非対応）。
 */

export type TokenType =
  | "num"
  | "ident"
  | "eof"
  | "{"
  | "}"
  | "("
  | ")"
  | ";"
  | ","
  | "."
  | "=="
  | "!="
  | "<="
  | ">="
  | "+="
  | "-="
  | "="
  | "<"
  | ">"
  | "+"
  | "-";

export interface Token {
  type: TokenType;
  value: string;
  num?: number;
  line: number;
}

const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "+=", "-="]);
const ONE_CHAR_OPS = "{}();,.=<>+-";

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

export class LexError extends Error {}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const c = source[i]!;

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    if (isDigit(c)) {
      const start = i;
      if (c === "0" && (source[i + 1] === "x" || source[i + 1] === "X")) {
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(source[i]!)) i++;
        const text = source.slice(start, i);
        tokens.push({ type: "num", value: text, num: parseInt(text, 16), line });
      } else {
        while (i < n && isDigit(source[i]!)) i++;
        const text = source.slice(start, i);
        tokens.push({ type: "num", value: text, num: parseInt(text, 10), line });
      }
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      i++;
      while (i < n && isIdentPart(source[i]!)) i++;
      tokens.push({ type: "ident", value: source.slice(start, i), line });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: two as TokenType, value: two, line });
      i += 2;
      continue;
    }

    if (ONE_CHAR_OPS.includes(c)) {
      tokens.push({ type: c as TokenType, value: c, line });
      i++;
      continue;
    }

    throw new LexError(`${line}行目: 予期しない文字 '${c}' です`);
  }

  tokens.push({ type: "eof", value: "", line });
  return tokens;
}
