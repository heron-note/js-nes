export { compile, type CompileResult, type CompileAssets } from "./compile.js";
export { parse } from "./parser.js";
export { generate, type SoundSequenceDef, type GenerateOptions } from "./codegen.js";
export { ParseError } from "./parser.js";
export { CodegenError } from "./codegen.js";
export { LexError } from "./lexer.js";
export type { Program, Stmt, GlobalDecl, FunctionDecl } from "./ast.js";
