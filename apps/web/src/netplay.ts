/**
 * WebRTCによるオンライン対戦（M8 Phase1: 画面ストリーミング型）。
 * docs/06_NETPLAY_SPEC.md 参照。signalingサーバーを持たないため、
 * オファー/アンサーをBase64文字列にエンコードし、手動コピペでやり取りする簡易実装。
 *
 * 既知の制約: ICE Trickleを使わず、ICE収集完了を待ってから1本のコードとして
 * オファー/アンサーを生成する（往復のやり取りが1回で済む代わりに接続確立が少し遅くなる）。
 */

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
