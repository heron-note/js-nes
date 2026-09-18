import { Nes } from "@js-nes/emulator-core";
import type { NesWorkerInboundMessage, NesWorkerOutboundMessage } from "./nesWorkerProtocol.js";

/**
 * NESエミュレーション本体（Nes.runFrame()のステップ実行）を専用Workerで自走させる。
 * メインスレッドのrequestAnimationFrameループ（描画・DOM操作等で詰まりうる）から
 * 音声生成・配信を完全に切り離すのが目的。音声はAudioWorkletNode.portの所有権を
 * このWorkerへ譲渡してもらい（audio.ts参照）、メインスレッドを一切経由せず直接
 * 配信する（Phase 2）。
 *
 * ロックステップ（M9）時は自走を止め、main からの stepFrame だけで進める。
 */
const ctx = self as unknown as Worker;

const nes = new Nes();

let audioPort: MessagePort | null = null;
let sampleRateApplied = false;
let audioEnabled = false;
let loopStarted = false;
let crashed = false;
let lockstepEnabled = false;

const FRAME_MS = 1000 / 60;
let nextFrameAt = 0;

function post(message: NesWorkerOutboundMessage, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

function applyControllerByte(controller: 1 | 2, buttons: number): void {
  const pad = controller === 1 ? nes.controller1 : nes.controller2;
  const b = buttons & 0xff;
  for (let bit = 0; bit < 8; bit++) {
    pad.setButton(bit, (b & (1 << bit)) !== 0);
  }
}

function scheduleNext(): void {
  if (lockstepEnabled || crashed || !loopStarted) return;
  const delay = Math.max(0, nextFrameAt - performance.now());
  setTimeout(tick, delay);
}

function emitFrame(frame?: number): void {
  const framebuffer = new Uint8ClampedArray(nes.ppu.framebuffer);
  const channelSnapshots = [0, 1, 2, 3].map((c) => nes.apu.getChannelState(c as 0 | 1 | 2 | 3));
  let hash: number | undefined;
  if (frame !== undefined && frame % 60 === 0) {
    let h = 2166136261;
    for (let i = 0; i < framebuffer.length; i += 64) {
      h ^= framebuffer[i]!;
      h = Math.imul(h, 16777619);
    }
    hash = h >>> 0;
  }
  post({ type: "frame", framebuffer, channelSnapshots, frame, hash }, [framebuffer.buffer]);

  const samples = nes.apu.drainSamples();
  if (audioPort && audioEnabled && samples.length > 0) {
    audioPort.postMessage(samples, [samples.buffer]);
  }
}

/**
 * 絶対目標時刻を使う自己補正ループ。素朴な`setInterval`や連鎖`setTimeout`は
 * tick自体の実行時間ぶんドリフトが蓄積するため、常に「次回はいつ鳴らすべきか」を
 * 絶対時刻で持ち、実行にかかった時間を自動的に埋め合わせる。
 */
function tick(): void {
  if (crashed || lockstepEnabled) return;

  try {
    nes.runFrame();
  } catch (err) {
    crashed = true;
    post({ type: "fatalError", message: err instanceof Error ? err.message : String(err) });
    return;
  }

  emitFrame();

  nextFrameAt += FRAME_MS;
  const now = performance.now();
  if (now - nextFrameAt > FRAME_MS * 5) nextFrameAt = now + FRAME_MS;

  scheduleNext();
}

ctx.onmessage = (e: MessageEvent<NesWorkerInboundMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "loadRom": {
      try {
        nes.loadRom(msg.bytes);
        crashed = false;
        post({ type: "loadRomResult", context: msg.context, ok: true });
        if (!loopStarted && !lockstepEnabled) {
          loopStarted = true;
          nextFrameAt = performance.now();
          scheduleNext();
        }
      } catch (err) {
        post({
          type: "loadRomResult",
          context: msg.context,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }
    case "button": {
      const controller = msg.controller === 1 ? nes.controller1 : nes.controller2;
      controller.setButton(msg.bit, msg.pressed);
      break;
    }
    case "controllerByte": {
      applyControllerByte(msg.controller, msg.buttons);
      break;
    }
    case "lockstepEnable": {
      lockstepEnabled = msg.enabled;
      if (!lockstepEnabled && loopStarted && !crashed) {
        nextFrameAt = performance.now();
        scheduleNext();
      }
      break;
    }
    case "stepFrame": {
      if (!lockstepEnabled || crashed) break;
      try {
        applyControllerByte(1, msg.p1);
        applyControllerByte(2, msg.p2);
        nes.runFrame();
        emitFrame(msg.frame);
      } catch (err) {
        crashed = true;
        post({ type: "fatalError", message: err instanceof Error ? err.message : String(err) });
      }
      break;
    }
    case "audioPort": {
      audioPort = msg.port;
      audioEnabled = false;
      if (!sampleRateApplied) {
        nes.apu.setSampleRate(msg.sampleRate);
        sampleRateApplied = true;
      }
      // 接続時点の溜まりは捨てる（再生開始まで送らない）
      nes.apu.drainSamples();
      break;
    }
    case "audioControl": {
      audioEnabled = msg.enabled;
      if (audioEnabled) {
        // 再開時に遅延キューを捨てて「今」から聴こえるようにする
        nes.apu.drainSamples();
        audioPort?.postMessage({ type: "flush" });
      } else {
        nes.apu.drainSamples();
        audioPort?.postMessage({ type: "flush" });
      }
      break;
    }
  }
};
