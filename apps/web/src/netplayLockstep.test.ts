import { describe, expect, it } from "vitest";
import {
  InputDelayBuffer,
  RemoteInputInbox,
  bytesToBase64,
  base64ToBytes,
  chunkBase64,
  decodeLockstepMessage,
  encodeLockstepMessage,
} from "./netplayLockstep.js";

describe("InputDelayBuffer", () => {
  it("delay=2 なら最初の2フレームは0、その後に押し込み順で出る", () => {
    const buf = new InputDelayBuffer(2);
    expect(buf.pushAndTake(0x01)).toEqual({ frame: 0, buttons: 0 });
    expect(buf.pushAndTake(0x02)).toEqual({ frame: 1, buttons: 0 });
    expect(buf.pushAndTake(0x04)).toEqual({ frame: 2, buttons: 0x01 });
    expect(buf.pushAndTake(0x08)).toEqual({ frame: 3, buttons: 0x02 });
  });
});

describe("RemoteInputInbox", () => {
  it("frame 順不同で offer しても take できる", () => {
    const inbox = new RemoteInputInbox();
    inbox.offer(1, 0x11);
    inbox.offer(0, 0x22);
    expect(inbox.take(0)).toBe(0x22);
    expect(inbox.take(1)).toBe(0x11);
    expect(inbox.take(2)).toBeUndefined();
  });
});

describe("ROM base64 chunk", () => {
  it("往復で元に戻る", () => {
    const src = new Uint8Array([1, 2, 3, 250, 255, 0, 9]);
    const parts = chunkBase64(bytesToBase64(src), 4);
    const joined = parts.join("");
    expect([...base64ToBytes(joined)]).toEqual([...src]);
  });
});

describe("LockstepMessage codec", () => {
  it("input を往復できる", () => {
    const raw = encodeLockstepMessage({ t: "input", frame: 12, buttons: 0x5a });
    expect(decodeLockstepMessage(raw)).toEqual({ t: "input", frame: 12, buttons: 0x5a });
  });
});
