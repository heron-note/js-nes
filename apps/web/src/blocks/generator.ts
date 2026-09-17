/**
 * ブロック→DSLテキストのコードジェネレータ。
 * 生成したテキストは既存の dsl-compiler（compile()）にそのまま渡す。
 */
import * as Blockly from "blockly/core";

const ORDER_ATOMIC = 0;

export const famijsGenerator = new Blockly.Generator("FamiJS");

// Blockly.Generatorの規約: 各ステートメントブロックは「自分自身のコードのみ」を返し、
// 次に接続されたブロックの連結はscrub_が自動的に行う。
famijsGenerator.scrub_ = function (block, code, opt_thisOnly) {
  const nextBlock = block.nextConnection?.targetBlock() ?? null;
  if (nextBlock && !opt_thisOnly) {
    return code + famijsGenerator.blockToCode(nextBlock);
  }
  return code;
};

famijsGenerator.init = function (_workspace: Blockly.Workspace): void {
  // Blockly.Variables等の標準機能は使わないため何もしない。
};

famijsGenerator.finish = function (code: string): string {
  return code;
};

function valueOf(block: Blockly.Block, inputName: string, fallback: string): string {
  const code = famijsGenerator.valueToCode(block, inputName, ORDER_ATOMIC);
  return code || fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const forBlock = famijsGenerator.forBlock as Record<string, (block: Blockly.Block) => string | [string, number]>;

forBlock["fjs_let"] = (block) => {
  const name = block.getFieldValue("NAME") as string;
  const value = block.getFieldValue("VALUE") as number;
  return `let ${name} = ${value};\n`;
};

forBlock["fjs_event_init"] = (block) => {
  const body = famijsGenerator.statementToCode(block, "DO");
  return `function init() {\n${body}}\n\n`;
};

forBlock["fjs_event_update"] = (block) => {
  const body = famijsGenerator.statementToCode(block, "DO");
  return `function update() {\n${body}}\n\n`;
};

forBlock["fjs_assign"] = (block) => {
  const name = block.getFieldValue("NAME") as string;
  const value = valueOf(block, "VALUE", "0");
  return `${name} = ${value};\n`;
};

forBlock["fjs_assign_add"] = (block) => {
  const name = block.getFieldValue("NAME") as string;
  const num = block.getFieldValue("NUM") as number;
  return `${name} += ${num};\n`;
};

forBlock["fjs_assign_sub"] = (block) => {
  const name = block.getFieldValue("NAME") as string;
  const num = block.getFieldValue("NUM") as number;
  return `${name} -= ${num};\n`;
};

forBlock["fjs_if"] = (block) => {
  const cond = valueOf(block, "CONDITION", "btn.right");
  const doCode = famijsGenerator.statementToCode(block, "DO");
  const elseCode = famijsGenerator.statementToCode(block, "ELSE");
  let code = `if (${cond}) {\n${doCode}}`;
  if (elseCode.trim().length > 0) {
    code += ` else {\n${elseCode}}`;
  }
  return `${code}\n`;
};

forBlock["fjs_btn"] = (block): [string, number] => {
  const name = block.getFieldValue("NAME") as string;
  const mode = block.getFieldValue("MODE") as string;
  const suffix = mode === "just" ? "_just_pressed" : "";
  return [`btn.${name}${suffix}`, ORDER_ATOMIC];
};

forBlock["fjs_compare"] = (block): [string, number] => {
  const name = block.getFieldValue("NAME") as string;
  const op = block.getFieldValue("OP") as string;
  const right = valueOf(block, "RIGHT", "0");
  return [`${name} ${op} ${right}`, ORDER_ATOMIC];
};

forBlock["fjs_var_truthy"] = (block): [string, number] => {
  const name = block.getFieldValue("NAME") as string;
  return [name, ORDER_ATOMIC];
};

forBlock["fjs_call_setpalette"] = (block) => {
  const slot = block.getFieldValue("SLOT") as number;
  const c0 = block.getFieldValue("C0") as number;
  const c1 = block.getFieldValue("C1") as number;
  const c2 = block.getFieldValue("C2") as number;
  const c3 = block.getFieldValue("C3") as number;
  return `setPalette(${slot}, ${c0}, ${c1}, ${c2}, ${c3});\n`;
};

forBlock["fjs_call_setspritepalette"] = (block) => {
  const slot = block.getFieldValue("SLOT") as number;
  const c0 = block.getFieldValue("C0") as number;
  const c1 = block.getFieldValue("C1") as number;
  const c2 = block.getFieldValue("C2") as number;
  const c3 = block.getFieldValue("C3") as number;
  return `setSpritePalette(${slot}, ${c0}, ${c1}, ${c2}, ${c3});\n`;
};

forBlock["fjs_call_drawsprite"] = (block) => {
  const id = block.getFieldValue("ID") as number;
  const x = valueOf(block, "X", "0");
  const y = valueOf(block, "Y", "0");
  const tile = block.getFieldValue("TILE") as number;
  const palette = block.getFieldValue("PALETTE") as number;
  return `drawSprite(${id}, ${x}, ${y}, ${tile}, ${palette});\n`;
};

forBlock["fjs_call_playtone"] = (block) => {
  const channel = block.getFieldValue("CHANNEL") as string;
  const note = block.getFieldValue("NOTE") as number;
  const duration = block.getFieldValue("DURATION") as number;
  return `playTone(${channel}, ${note}, ${duration});\n`;
};

forBlock["fjs_number"] = (block): [string, number] => {
  const value = block.getFieldValue("VALUE") as number;
  return [String(value), ORDER_ATOMIC];
};

forBlock["fjs_variable_get"] = (block): [string, number] => {
  const name = block.getFieldValue("NAME") as string;
  return [name, ORDER_ATOMIC];
};

/** ワークスペース全体からDSLソーステキストを生成する。 */
export function generateSource(workspace: Blockly.Workspace): string {
  const globalBlocks = workspace.getBlocksByType("fjs_let", false);
  const globalsCode = globalBlocks
    .map((b) => famijsGenerator.blockToCode(b, true))
    .map((c) => (Array.isArray(c) ? c[0] : c))
    .join("");

  const initBlocks = workspace.getBlocksByType("fjs_event_init", false);
  const updateBlocks = workspace.getBlocksByType("fjs_event_update", false);

  const initCode = initBlocks.length > 0 ? famijsGenerator.blockToCode(initBlocks[0]!) : "function init() {\n}\n\n";
  const updateCode =
    updateBlocks.length > 0 ? famijsGenerator.blockToCode(updateBlocks[0]!) : "function update() {\n}\n\n";

  const initStr = Array.isArray(initCode) ? initCode[0] : initCode;
  const updateStr = Array.isArray(updateCode) ? updateCode[0] : updateCode;

  return `${globalsCode}\n${initStr}${updateStr}`;
}
