import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";

/**
 * 「シーン/パーツ」構成モデル(DSL v1)導入プロジェクトのPhase -1で採取した回帰確認用フィクスチャ。
 * part/sceneを使わない既存のv0ソースは、以降の全フェーズを通じてバイト単位で同一のROMを
 * 生成し続けることを、ここで機械的に確認する。値が変わった場合、意図した変更でなければ regression。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONG_SOURCE = readFileSync(join(__dirname, "..", "..", "..", "games", "game-01-pong", "main.js"), "utf-8");

const SAMPLE_SOURCE = `
let x = 120;
let y = 100;

function init() {
  setPalette(0, 1, 33, 0, 0);
  setSpritePalette(0, 1, 34, 0, 0);
}

function update() {
  if (btn.right) { x += 1; }
  if (btn.left) { x -= 1; }
  if (btn.up) { y -= 1; }
  if (btn.down) { y += 1; }

  drawSprite(0, x, y, 1, 2);
}
`;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("golden regression fixture（v0のみのソース、part/scene未使用）", () => {
  it("docs/03_DSL_SPEC.md 相当のサンプルが生成するROMバイト列が変わらない", () => {
    const { rom } = compile(SAMPLE_SOURCE);
    expect(bytesToHex(rom)).toMatchSnapshot();
  });

  it("games/game-01-pong/main.js が生成するROMバイト列が変わらない", () => {
    const { rom } = compile(PONG_SOURCE);
    expect(bytesToHex(rom)).toMatchSnapshot();
  });
});
