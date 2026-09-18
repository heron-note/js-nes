import { Nes } from "@js-nes/emulator-core";
import type { NesWorkerInboundMessage, NesWorkerOutboundMessage } from "./nesWorkerProtocol.js";

/**
 * NESエミュレーション本体（Nes.runFrame()のステップ実行）を専用Workerで自走させる。
 * メインスレッドのrequestAnimationFrameループ（描画・DOM操作等で詰まりうる）から
 * 音声生成・配信を完全に切り離すのが目的。音声はAudioWorkletNode.portの所有権を
 * このWorkerへ譲渡してもらい（audio.ts参照）、メインスレッドを一切経由せず直接
 * 配信する（Phase 2）。詳細はプラン
 * C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md 参照。
 *
 * tsconfig.base.jsonのlibにWebWorkerが含まれておらず(DOM libのみ)、`self`はWindow型として
 * 解決されPostMessageのシグネチャが合わないため、Worker型へ局所的にキャストして使う。
 */
const ctx = self as unknown as Worker;

const nes = new Nes();

let audioPort: MessagePort | null = null;
let sampleRateApplied = false;
let loopStarted = false;
let crashed = false;

const FRAME_MS = 1000 / 60;
let nextFrameAt = 0;

function post(message: NesWorkerOutboundMessage, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

function scheduleNext(): void {
  const delay = Math.max(0, nextFrameAt - performance.now());
  setTimeout(tick, delay);
}

/**
 * 絶対目標時刻を使う自己補正ループ。素朴な`setInterval`や連鎖`setTimeout`は
 * tick自体の実行時間ぶんドリフトが蓄積するため、常に「次回はいつ鳴らすべきか」を
 * 絶対時刻で持ち、実行にかかった時間を自動的に埋め合わせる。
 */
function tick(): void {
  if (crashed) return;

  try {
    nes.runFrame();
  } catch (err) {
    crashed = true;
    post({ type: "fatalError", message: err instanceof Error ? err.message : String(err) });
    return; // 決定論的に再現するクラッシュなので再スケジュールしない（ページ再読み込みで復旧）
  }

  const framebuffer = new Uint8ClampedArray(nes.ppu.framebuffer); // PPUの生バッファは転送せず必ずコピー
  const channelSnapshots = [0, 1, 2, 3].map((c) => nes.apu.getChannelState(c as 0 | 1 | 2 | 3));
  post({ type: "frame", framebuffer, channelSnapshots }, [framebuffer.buffer]);

  // audioPort未接続の間（AudioContext起動前のジェスチャー待ち等）はAPU内部の
  // サンプルバッファが無制限に膨らまないよう、届け先が無くても必ず取り出して捨てる。
  const samples = nes.apu.drainSamples();
  if (audioPort && samples.length > 0) {
    // メインスレッドを一切経由せず、Workerから直接AudioWorkletProcessorへ届ける
    // （Phase 2の核心）。これによりメインスレッドの詰まりが音声配信に一切影響しない。
    audioPort.postMessage(samples, [samples.buffer]);
  }

  nextFrameAt += FRAME_MS;
  // スリープ復帰・devtoolsブレーク等で大幅に遅れた場合、無理に追いつこうとせず
  // 現在時刻から仕切り直す（音声の早送りやCPU使い切りスパイラルを避けるため）。
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
        post({ type: "loadRomResult", context: msg.context, ok: true });
        if (!loopStarted) {
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
    case "audioPort": {
      audioPort = msg.port;
      if (!sampleRateApplied) {
        nes.apu.setSampleRate(msg.sampleRate);
        sampleRateApplied = true;
      }
      break;
    }
  }
};
