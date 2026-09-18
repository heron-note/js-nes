import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { extractNesFromZip, looksLikeNes, resolveRomFromFile } from "./romFromFile.js";

function tinyNes(label = 0): Uint8Array {
  // 最小に近いダミー iNES（16B ヘッダ + 16KB PRG ゼロ）— マジックだけ見れば十分
  const bytes = new Uint8Array(16 + 16384);
  bytes[0] = 0x4e;
  bytes[1] = 0x45;
  bytes[2] = 0x53;
  bytes[3] = 0x1a;
  bytes[4] = 1; // 1×16KB PRG
  bytes[5] = 0;
  bytes[15] = label;
  return bytes;
}

describe("romFromFile", () => {
  it("looksLikeNes", () => {
    expect(looksLikeNes(tinyNes())).toBe(true);
    expect(looksLikeNes(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });

  it("ZIP から .nes を取り出す", () => {
    const nes = tinyNes(1);
    const zip = zipSync({ "games/hello.nes": nes });
    const out = extractNesFromZip(zip);
    expect(out.name).toBe("hello");
    expect(out.bytes).toEqual(nes);
  });

  it("__MACOSX と浅いパスを優先", () => {
    const shallow = tinyNes(2);
    const deep = tinyNes(3);
    const junk = tinyNes(4);
    const zip = zipSync({
      "__MACOSX/._a.nes": junk,
      "folder/deep/a.nes": deep,
      "root.nes": shallow,
    });
    const out = extractNesFromZip(zip);
    expect(out.name).toBe("root");
    expect(out.bytes[15]).toBe(2);
  });

  it("resolveRomFromFile が .nes を通す", async () => {
    const nes = tinyNes();
    const file = new File([new Uint8Array(nes)], "Pong.nes");
    const r = await resolveRomFromFile(file);
    expect(r.name).toBe("Pong");
    expect(r.fromZip).toBe(false);
    expect(looksLikeNes(r.bytes)).toBe(true);
  });

  it("resolveRomFromFile が .zip を展開する", async () => {
    const nes = tinyNes(9);
    const zip = zipSync({ "cart.nes": nes });
    const file = new File([new Uint8Array(zip)], "pack.zip");
    const r = await resolveRomFromFile(file);
    expect(r.name).toBe("cart");
    expect(r.fromZip).toBe(true);
    expect(r.bytes[15]).toBe(9);
  });
});
