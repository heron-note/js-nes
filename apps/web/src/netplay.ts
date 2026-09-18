/**
 * WebRTCによるオンライン対戦。
 * - M8 Phase1: 画面ストリーミング型（NetplayHost / NetplayGuest）
 * - M9 骨格: 入力ロックステップ型（LockstepHost / LockstepGuest）
 *   ROM を DataChannel で渡し、双方が同じエミュを stepFrame で進める。
 *
 * signalingサーバーを持たないため、オファー/アンサーをBase64文字列にエンコードし、
 * 手動コピペでやり取りする簡易実装（ICE Trickleなし）。
 */

import {
  DEFAULT_INPUT_DELAY_FRAMES,
  InputDelayBuffer,
  LOCKSTEP_PROTOCOL_VERSION,
  RemoteInputInbox,
  RomReassembler,
  bytesToBase64,
  chunkBase64,
  decodeLockstepMessage,
  encodeLockstepMessage,
  type LockstepMessage,
  type LockstepRole,
} from "./netplayLockstep.js";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

interface CanvasWithCaptureStream extends HTMLCanvasElement {
  captureStream(frameRate?: number): MediaStream;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    function check(): void {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function encodeDescription(desc: RTCSessionDescriptionInit): string {
  return btoa(encodeURIComponent(JSON.stringify(desc)));
}

function decodeDescription(code: string): RTCSessionDescriptionInit {
  return JSON.parse(decodeURIComponent(atob(code.trim()))) as RTCSessionDescriptionInit;
}

export type ConnectionStatusListener = (state: RTCPeerConnectionState) => void;

export class NetplayHost {
  private pc: RTCPeerConnection | null = null;

  async start(
    canvas: HTMLCanvasElement,
    onGuestButtons: (buttons: number) => void,
    onStatus: ConnectionStatusListener,
  ): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onconnectionstatechange = () => onStatus(pc.connectionState);

    const stream = (canvas as CanvasWithCaptureStream).captureStream(30);
    for (const track of stream.getTracks()) pc.addTrack(track, stream);

    const dataChannel = pc.createDataChannel("input");
    dataChannel.onmessage = (ev: MessageEvent<string>) => {
      const buttons = Number(ev.data);
      if (!Number.isNaN(buttons)) onGuestButtons(buttons);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    if (!pc.localDescription) throw new Error("オファーの生成に失敗しました");
    return encodeDescription(pc.localDescription);
  }

  async completeConnection(answerCode: string): Promise<void> {
    if (!this.pc) throw new Error("先にstart()でホストを開始してください");
    await this.pc.setRemoteDescription(decodeDescription(answerCode));
  }

  close(): void {
    this.pc?.close();
    this.pc = null;
  }
}

export class NetplayGuest {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  async join(offerCode: string, videoEl: HTMLVideoElement, onStatus: ConnectionStatusListener): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onconnectionstatechange = () => onStatus(pc.connectionState);
    pc.ontrack = (ev) => {
      videoEl.srcObject = ev.streams[0] ?? null;
    };
    pc.ondatachannel = (ev) => {
      this.dataChannel = ev.channel;
    };

    await pc.setRemoteDescription(decodeDescription(offerCode));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);

    if (!pc.localDescription) throw new Error("応答の生成に失敗しました");
    return encodeDescription(pc.localDescription);
  }

  sendButtons(buttons: number): void {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(String(buttons));
    }
  }

  close(): void {
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
  }
}

// --- M9 ロックステップ ---

export type LockstepHooks = {
  onStatus: ConnectionStatusListener;
  onLog: (message: string) => void;
  /** ROM をローカル Worker に載せる（双方）。 */
  onRom: (bytes: Uint8Array, name: string) => void | Promise<void>;
  /** 1フレーム分の入力が揃ったとき。p1=ホスト, p2=ゲスト。 */
  onStep: (frame: number, p1: number, p2: number) => void;
  /** デシンク検出。 */
  onDesync?: (frame: number, localHash: number, remoteHash: number) => void;
};

type LockstepSessionState = "idle" | "signaling" | "rom" | "running" | "desync";

abstract class LockstepPeer {
  protected pc: RTCPeerConnection | null = null;
  protected dc: RTCDataChannel | null = null;
  protected hooks: LockstepHooks | null = null;
  protected role: LockstepRole;
  protected inputDelay = DEFAULT_INPUT_DELAY_FRAMES;
  protected localBuffer: InputDelayBuffer | null = null;
  protected remoteInbox = new RemoteInputInbox();
  protected localPending = new Map<number, number>();
  protected state: LockstepSessionState = "idle";
  protected rawLocalButtons = 0;
  protected checksumLocal = new Map<number, number>();
  protected checksumRemote = new Map<number, number>();
  private pumpTimer: ReturnType<typeof setInterval> | null = null;

  constructor(role: LockstepRole) {
    this.role = role;
  }

  protected send(msg: LockstepMessage): void {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(encodeLockstepMessage(msg));
    }
  }

  protected wireChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      this.hooks?.onLog("DataChannel 開通");
      this.send({
        t: "hello",
        v: LOCKSTEP_PROTOCOL_VERSION,
        role: this.role,
        inputDelay: this.inputDelay,
      });
      if (this.role === "host") this.onChannelReadyAsHost();
    };
    dc.onmessage = (ev: MessageEvent<string>) => {
      const msg = decodeLockstepMessage(String(ev.data));
      if (msg) this.onMessage(msg);
    };
  }

  /** Host のみ: DC 開通後に ROM 送信を始める。 */
  protected onChannelReadyAsHost(): void {
    /* override */
  }

  protected onMessage(msg: LockstepMessage): void {
    switch (msg.t) {
      case "hello":
        if (msg.v !== LOCKSTEP_PROTOCOL_VERSION) {
          this.hooks?.onLog(`プロトコル不一致: peer=v${msg.v}`);
        }
        this.inputDelay = Math.max(this.inputDelay, msg.inputDelay);
        break;
      case "input":
        this.remoteInbox.offer(msg.frame, msg.buttons);
        this.tryAdvance();
        break;
      case "checksum":
        this.onRemoteChecksum(msg.frame, msg.hash);
        break;
      case "desync":
        this.state = "desync";
        this.hooks?.onDesync?.(msg.frame, msg.localHash, msg.remoteHash);
        this.hooks?.onLog(`デシンク通知 frame=${msg.frame}`);
        this.stopPump();
        break;
      default:
        this.onRoleMessage(msg);
    }
  }

  protected abstract onRoleMessage(msg: LockstepMessage): void;

  setLocalButtons(buttons: number): void {
    this.rawLocalButtons = buttons & 0xff;
  }

  /** 描画ハッシュを相手と比較用に送る（Worker の frame.hash から呼ぶ）。 */
  reportFramebufferHash(frame: number, hash: number): void {
    if (this.state !== "running") return;
    this.checksumLocal.set(frame, hash);
    this.send({ t: "checksum", frame, hash });
    this.compareChecksum(frame);
  }

  private onRemoteChecksum(frame: number, remoteHash: number): void {
    this.checksumRemote.set(frame, remoteHash);
    this.compareChecksum(frame);
  }

  private compareChecksum(frame: number): void {
    const local = this.checksumLocal.get(frame);
    const remote = this.checksumRemote.get(frame);
    if (local === undefined || remote === undefined) return;
    this.checksumLocal.delete(frame);
    this.checksumRemote.delete(frame);
    if (local !== remote) {
      this.state = "desync";
      this.send({ t: "desync", frame, localHash: local, remoteHash: remote });
      this.hooks?.onDesync?.(frame, local, remote);
      this.hooks?.onLog(`デシンク検出 frame=${frame} local=${local} remote=${remote}`);
      this.stopPump();
    }
  }

  protected beginRunning(startFrame: number): void {
    this.localBuffer = new InputDelayBuffer(this.inputDelay);
    this.localBuffer.reset(startFrame);
    this.remoteInbox.clear();
    this.localPending.clear();
    this.checksumLocal.clear();
    this.checksumRemote.clear();
    this.state = "running";
    this.hooks?.onLog(`ロックステップ開始（inputDelay=${this.inputDelay}）`);
    this.startPump();
  }

  private startPump(): void {
    this.stopPump();
    // 60Hz 相当で「自分の入力を送り、揃えば step」。相手入力待ちならスキップ。
    this.pumpTimer = setInterval(() => this.pumpLocalInput(), 1000 / 60);
  }

  private stopPump(): void {
    if (this.pumpTimer !== null) {
      clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
  }

  private pumpLocalInput(): void {
    if (this.state !== "running" || !this.localBuffer) return;
    // 未送信のローカル確定入力を1フレーム分だけ進める（追いつきすぎ防止）
    if (this.localPending.size > 8) return;
    const { frame, buttons } = this.localBuffer.pushAndTake(this.rawLocalButtons);
    this.localPending.set(frame, buttons);
    this.send({ t: "input", frame, buttons });
    this.tryAdvance();
  }

  private tryAdvance(): void {
    if (this.state !== "running" || !this.localBuffer) return;
    // 連続で揃っているフレームを消化
    for (;;) {
      const frames = [...this.localPending.keys()].sort((a, b) => a - b);
      const frame = frames[0];
      if (frame === undefined) return;
      if (!this.remoteInbox.has(frame)) return;
      const localButtons = this.localPending.get(frame)!;
      const remoteButtons = this.remoteInbox.take(frame)!;
      this.localPending.delete(frame);

      const p1 = this.role === "host" ? localButtons : remoteButtons;
      const p2 = this.role === "host" ? remoteButtons : localButtons;
      this.hooks?.onStep(frame, p1, p2);
    }
  }

  close(): void {
    this.stopPump();
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.state = "idle";
    this.hooks = null;
  }
}

export class LockstepHost extends LockstepPeer {
  private romBytes: Uint8Array | null = null;
  private romName = "cart.nes";
  private guestAcked = false;

  constructor() {
    super("host");
  }

  async start(romBytes: Uint8Array, romName: string, hooks: LockstepHooks): Promise<string> {
    this.close();
    this.hooks = hooks;
    this.romBytes = romBytes;
    this.romName = romName || "cart.nes";
    this.guestAcked = false;
    this.state = "signaling";

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onconnectionstatechange = () => hooks.onStatus(pc.connectionState);

    const dc = pc.createDataChannel("lockstep", { ordered: true });
    this.wireChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    if (!pc.localDescription) throw new Error("オファーの生成に失敗しました");
    return encodeDescription(pc.localDescription);
  }

  async completeConnection(answerCode: string): Promise<void> {
    if (!this.pc) throw new Error("先にstart()でホストを開始してください");
    await this.pc.setRemoteDescription(decodeDescription(answerCode));
  }

  protected override onChannelReadyAsHost(): void {
    void this.sendRom();
  }

  private async sendRom(): Promise<void> {
    if (!this.romBytes || !this.hooks) return;
    this.state = "rom";
    this.hooks.onLog(`ROM送信中（${this.romBytes.length} bytes）...`);
    await this.hooks.onRom(this.romBytes, this.romName);

    const b64 = bytesToBase64(this.romBytes);
    const chunks = chunkBase64(b64);
    this.send({ t: "rom-begin", name: this.romName, size: this.romBytes.length, chunks: chunks.length });
    for (let i = 0; i < chunks.length; i++) {
      this.send({ t: "rom-chunk", i, data: chunks[i]! });
    }
    this.send({ t: "rom-end" });
    this.hooks.onLog(`ROM送信完了（${chunks.length} chunks）。ゲストの ack 待ち`);
  }

  protected onRoleMessage(msg: LockstepMessage): void {
    if (msg.t === "rom-ack") {
      this.guestAcked = true;
      this.hooks?.onLog("ゲストが ROM を受信");
      this.send({ t: "start", startFrame: 0 });
      this.beginRunning(0);
    }
  }
}

export class LockstepGuest extends LockstepPeer {
  private reassembler = new RomReassembler();

  constructor() {
    super("guest");
  }

  async join(offerCode: string, hooks: LockstepHooks): Promise<string> {
    this.close();
    this.hooks = hooks;
    this.reassembler = new RomReassembler();
    this.state = "signaling";

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onconnectionstatechange = () => hooks.onStatus(pc.connectionState);
    pc.ondatachannel = (ev) => {
      this.wireChannel(ev.channel);
    };

    await pc.setRemoteDescription(decodeDescription(offerCode));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    if (!pc.localDescription) throw new Error("応答の生成に失敗しました");
    return encodeDescription(pc.localDescription);
  }

  protected onRoleMessage(msg: LockstepMessage): void {
    switch (msg.t) {
      case "rom-begin":
        this.state = "rom";
        this.reassembler.begin(msg.name, msg.size, msg.chunks);
        this.hooks?.onLog(`ROM受信開始（${msg.size} bytes, ${msg.chunks} chunks）`);
        break;
      case "rom-chunk":
        this.reassembler.put(msg.i, msg.data);
        break;
      case "rom-end": {
        const rom = this.reassembler.finish();
        if (!rom) {
          this.hooks?.onLog("ROM組み立て失敗");
          return;
        }
        void Promise.resolve(this.hooks?.onRom(rom.bytes, rom.name)).then(() => {
          this.send({ t: "rom-ack" });
          this.hooks?.onLog("ROM受信完了・ack 送信");
        });
        break;
      }
      case "start":
        this.beginRunning(msg.startFrame);
        break;
      default:
        break;
    }
  }
}
