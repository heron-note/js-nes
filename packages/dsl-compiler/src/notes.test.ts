import { describe, expect, it } from "vitest";
import { NOTE_COUNT, buildPulsePeriodTable, buildTrianglePeriodTable, highBytes, lowBytes } from "./notes.js";

const CPU_CLOCK_NTSC = 1789773;

describe("note tables", () => {
  it("generates NOTE_COUNT entries within the 11bit period range", () => {
    const pulse = buildPulsePeriodTable();
    const tri = buildTrianglePeriodTable();
    expect(pulse).toHaveLength(NOTE_COUNT);
    expect(tri).toHaveLength(NOTE_COUNT);
    for (const p of [...pulse, ...tri]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(0x7ff);
    }
  });

  it("produces monotonically decreasing periods as notes go up in pitch", () => {
    const pulse = buildPulsePeriodTable();
    for (let i = 1; i < pulse.length; i++) {
      expect(pulse[i]!).toBeLessThan(pulse[i - 1]!);
    }
  });

  it("round-trips the first note (C3, MIDI 48 ≈ 130.8Hz) back to approximately the right frequency", () => {
    const pulse = buildPulsePeriodTable();
    const period = pulse[0]!;
    const freq = CPU_CLOCK_NTSC / (16 * (period + 1));
    expect(freq).toBeCloseTo(130.81, 0);
  });

  it("splits periods into low/high byte tables correctly", () => {
    const table = [0x1ff, 0x001, 0x7ff];
    expect(lowBytes(table)).toEqual([0xff, 0x01, 0xff]);
    expect(highBytes(table)).toEqual([0x01, 0x00, 0x07]);
  });
});
