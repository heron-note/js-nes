import { describe, expect, it } from "vitest";
import { quantize8Way } from "./virtualStick.js";

describe("quantize8Way", () => {
  it("デッドゾーン内は全解除", () => {
    expect(quantize8Way(0.1, 0.1)).toEqual({ up: false, down: false, left: false, right: false });
  });

  it("右・左・上・下を正しく返す", () => {
    expect(quantize8Way(1, 0)).toEqual({ up: false, down: false, left: false, right: true });
    expect(quantize8Way(-1, 0)).toEqual({ up: false, down: false, left: true, right: false });
    expect(quantize8Way(0, -1)).toEqual({ up: true, down: false, left: false, right: false });
    expect(quantize8Way(0, 1)).toEqual({ up: false, down: true, left: false, right: false });
  });

  it("斜めは2方向同時", () => {
    expect(quantize8Way(0.7, -0.7)).toEqual({ up: true, down: false, left: false, right: true });
    expect(quantize8Way(-0.7, 0.7)).toEqual({ up: false, down: true, left: true, right: false });
  });
});
