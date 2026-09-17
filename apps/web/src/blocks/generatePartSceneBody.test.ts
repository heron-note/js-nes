import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { compile } from "@js-nes/dsl-compiler";
import { defineFamiJsBlocks } from "./definitions.js";
import { generatePartBody, generateSceneBody } from "./generator.js";

/**
 * DSL v1（シーン/パーツ構成モデル）Phase 6のゲート。
 * パーツ/シーン専用ワークスペース（`part Name {}`/`scene Name {}`のラッパーを持たない、
 * 「そのワークスペース自体が1つのpart/sceneの中身」というモデル）からのコード生成を検証する。
 */

beforeAll(() => {
  defineFamiJsBlocks();
});

function block(workspace: Blockly.Workspace, type: string): Blockly.Block {
  return workspace.newBlock(type);
}

describe("generatePartBody", () => {
  it("part_decl/scene_declのラッパーなしで、field/behaviorブロックだけからpart本体を生成する", () => {
    const workspace = new Blockly.Workspace();
    const field = block(workspace, "fjs_field_decl");
    field.setFieldValue("x", "NAME");
    field.setFieldValue(10, "VALUE");
    const behavior = block(workspace, "fjs_behavior_decl");
    behavior.setFieldValue("move", "NAME");

    const body = generatePartBody(workspace);
    expect(body).toContain("field x = 10;");
    expect(body).toContain("behavior move(self) {");

    // part {}で包めば実際にコンパイル可能なpart宣言になる
    const source = `part Foo {\n${body}\n}\n\nscene Main {\n instance f: Foo;\n function init() {}\n function update() {}\n}\n`;
    expect(() => compile(source)).not.toThrow();
  });
});

describe("generateSceneBody", () => {
  it("scene_declのラッパーなしで、instance/init/updateブロックだけからscene本体を生成する", () => {
    const workspace = new Blockly.Workspace();
    const instance = block(workspace, "fjs_instance_decl");
    instance.setFieldValue("f", "NAME");
    instance.setFieldValue("Foo", "PARTTYPE");
    const init = block(workspace, "fjs_scene_event_init");
    const update = block(workspace, "fjs_scene_event_update");

    const body = generateSceneBody(workspace);
    expect(body).toContain("instance f: Foo;");
    expect(body).toContain("function init()");
    expect(body).toContain("function update()");

    const source = `part Foo {\n field x = 0;\n behavior noop(self) {}\n}\n\nscene Main {\n${body}\n}\n`;
    expect(() => compile(source)).not.toThrow();
  });

  it("init/updateブロックが無い場合は空のfunctionで補完する", () => {
    const workspace = new Blockly.Workspace();
    const instance = block(workspace, "fjs_instance_decl");
    instance.setFieldValue("f", "NAME");
    instance.setFieldValue("Foo", "PARTTYPE");

    const body = generateSceneBody(workspace);
    expect(body).toContain("function init() {\n}");
    expect(body).toContain("function update() {\n}");
  });
});
