import { describe, expect, it } from "vitest";
import { createMapper } from "./mapper.js";
import { NromMapper } from "./mappers/nrom.js";
import { Unrom512Mapper } from "./mappers/unrom512.js";
import type { INesRom } from "./ines.js";

function makeRom(mapperId: number): INesRom {
  return {
    prgRom: new Uint8Array(0x4000),
    chrRom: new Uint8Array(0x2000),
    chrIsRam: false,
    mapperId,
    mirroring: "horizontal",
    hasBattery: false,
  };
}

describe("createMapper", () => {
  it("creates a NromMapper for mapperId 0", () => {
    const mapper = createMapper(makeRom(0));
    expect(mapper).toBeInstanceOf(NromMapper);
  });

  it("creates Unrom512Mapper for mapperId 30", () => {
    const mapper = createMapper(makeRom(30));
    expect(mapper).toBeInstanceOf(Unrom512Mapper);
  });

  it("rejects unsupported mapper ids", () => {
    expect(() => createMapper(makeRom(99))).toThrow(/Mapper 99/);
  });
});
