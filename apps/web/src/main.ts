import { BUTTON, Nes, buildSmokeRom, type ButtonName } from "@js-nes/emulator-core";
import { compile } from "@js-nes/dsl-compiler";
import { downloadRom, packChrRom, packINesRom } from "@js-nes/rom-builder";
import { getTiles, initSpriteEditor, setTiles } from "./spriteEditor.js";
import {
  createProject,
  loadProjectFromLocalStorage,
  parseProject,
  saveProjectToLocalStorage,
  serializeProject,
  ProjectFormatError,
} from "./project.js";
import { AudioEngine, noteIndexToLabel } from "./audio.js";
import { downloadCanvasAsPng, renderCartridgeLabel } from "./cartridgeLabel.js";
import { exportStandaloneHtml } from "./standaloneExport.js";
import { NetplayGuest, NetplayHost } from "./netplay.js";
import * as Blockly from "blockly/core";
import { generateSource, initBlockEditor, loadDefaultWorkspace } from "./blocks/blockEditor.js";

const canvas = document.querySelector<HTMLCanvasElement>("#screen");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const reloadBtn = document.querySelector<HTMLButtonElement>("#reload-btn");
const codeEditor = document.querySelector<HTMLTextAreaElement>("#code-editor");
const buildBtn = document.querySelector<HTMLButtonElement>("#build-btn");
const downloadBtn = document.querySelector<HTMLButtonElement>("#download-btn");
const buildStatus = document.querySelector<HTMLSpanElement>("#build-status");
const buildError = document.querySelector<HTMLPreElement>("#build-error");
const cartTitleInput = document.querySelector<HTMLInputElement>("#cart-title");
const cartAuthorInput = document.querySelector<HTMLInputElement>("#cart-author");
const cartCanvas = document.querySelector<HTMLCanvasElement>("#cartridge-label-canvas");
const cartDownloadBtn = document.querySelector<HTMLButtonElement>("#cart-label-download-btn");
const standaloneExportBtn = document.querySelector<HTMLButtonElement>("#standalone-export-btn");
const standaloneExportStatus = document.querySelector<HTMLSpanElement>("#standalone-export-status");

if (
  !canvas ||
  !statusEl ||
  !reloadBtn ||
  !codeEditor ||
  !buildBtn ||
  !downloadBtn ||
  !buildStatus ||
  !buildError ||
  !cartTitleInput ||
  !cartAuthorInput ||
  !cartCanvas ||
  !cartDownloadBtn ||
  !standaloneExportBtn ||
  !standaloneExportStatus
) {
  throw new Error("必要なDOM要素が見つかりません");
}

initSpriteEditor();

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D描画コンテキストを取得できません");
}

const imageData = ctx.createImageData(256, 240);

const nes = new Nes();
const audio = new AudioEngine();
let audioStarted = false;
function startAudioOnce(): void {
  if (audioStarted) return;
  audioStarted = true;
  audio.resume();
}
window.addEventListener("pointerdown", startAudioOnce, { once: true });
window.addEventListener("keydown", startAudioOnce, { once: true });

function loadDemoRom(): void {
  nes.loadRom(buildSmokeRom());
  statusEl!.textContent = "動作確認用ROM（emulator-core smoke test）を実行中";
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- コードエディタ（JS風DSL） ---
// タイル0番＝自機（キー操作）、タイル1番＝もう1体（自動で左右に動く）の2体を表示する。
// 「複数のタイル番号を使えば複数のキャラクターを同時に出せる」ことに加え、
// setSpritePalette()のスロット0と1で別の配色を用意し、drawSprite()の第5引数
// （palette）で使い分ける＝実機同様「スプライトごとに配色を選べる」ことも示す。
const SAMPLE_SOURCE = `let x = 120;
let y = 100;
let ex = 200;
let ey = 50;
let exGoingRight = 0;

function init() {
  setPalette(0, 1, 33, 0, 0);
  setSpritePalette(0, 1, 34, 0, 0);
  setSpritePalette(1, 1, 22, 0, 0);
}

function update() {
  if (btn.right) { x += 1; }
  if (btn.left) { x -= 1; }
  if (btn.up) { y -= 1; }
  if (btn.down) { y += 1; }
  if (btn.a_just_pressed) { playTone(0, 24, 10); }

  if (exGoingRight) { ex += 1; } else { ex -= 1; }
  if (ex > 240) { exGoingRight = 0; }
  if (ex < 16) { exGoingRight = 1; }

  drawSprite(0, x, y, 0, 0);
  drawSprite(1, ex, ey, 1, 1);
}
`;

let lastBuiltRom: Uint8Array | null = null;

function refreshCartridgeLabel(): void {
  renderCartridgeLabel(cartCanvas!, {
    title: cartTitleInput!.value,
    author: cartAuthorInput!.value,
  });
}

function buildAndRun(): void {
  buildError!.hidden = true;
  buildError!.textContent = "";
  try {
    const { prgRom } = compile(codeEditor!.value);
    const chrRom = packChrRom(getTiles());
    const rom = packINesRom(prgRom, chrRom);
    nes.loadRom(rom);
    lastBuiltRom = rom;
    downloadBtn!.disabled = false;
    standaloneExportBtn!.disabled = false;
    statusEl!.textContent = "コードエディタのDSLコード + ドット絵エディタのCHRをコンパイルして実行中";
    buildStatus!.textContent = "ビルド成功";
    refreshCartridgeLabel();

    // ビルド成功のたびにプロジェクト（コード+ドット絵）をlocalStorageへ自動保存する
    // （Phase 5: これまで存在しなかった「プロジェクトの保存」を、ページ再読み込みをまたいで実現する）。
    const project = createProject(codeEditor!.value, getTiles());
    project.title = cartTitleInput!.value;
    project.author = cartAuthorInput!.value;
    saveProjectToLocalStorage(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    buildError!.hidden = false;
    buildError!.textContent = message;
    buildStatus!.textContent = "ビルド失敗";
  }
}

buildBtn.addEventListener("click", buildAndRun);
downloadBtn.addEventListener("click", () => {
  if (lastBuiltRom) downloadRom(lastBuiltRom, "game.nes");
});

cartTitleInput.addEventListener("input", refreshCartridgeLabel);
cartAuthorInput.addEventListener("input", refreshCartridgeLabel);
cartDownloadBtn.addEventListener("click", () => {
  downloadCanvasAsPng(cartCanvas, `${cartTitleInput.value || "cartridge"}.png`);
});
refreshCartridgeLabel();

standaloneExportBtn.addEventListener("click", () => {
  if (!lastBuiltRom) return;
  standaloneExportStatus!.textContent = "書き出し中...";
  exportStandaloneHtml(lastBuiltRom, codeEditor!.value, `${cartTitleInput!.value || "game"}.html`)
    .then(() => {
      standaloneExportStatus!.textContent = "書き出し完了";
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      standaloneExportStatus!.textContent = message;
    });
});

// --- 起動時: スタンドアロン書き出し版として開かれた場合、埋め込みROM/ソースを読み込む ---
interface EmbeddedData {
  rom: string | null;
  source: string | null;
}
const embeddedDataEl = document.querySelector<HTMLScriptElement>("#embedded-data");
let embeddedRomB64: string | null = null;
let embeddedSource: string | null = null;
if (embeddedDataEl?.textContent) {
  try {
    const parsed = JSON.parse(embeddedDataEl.textContent) as EmbeddedData;
    embeddedRomB64 = parsed.rom;
    embeddedSource = parsed.source;
  } catch {
    // 埋め込みデータが壊れている場合は通常起動にフォールバック
  }
}

if (embeddedRomB64) {
  const rom = fromBase64(embeddedRomB64);
  nes.loadRom(rom);
  lastBuiltRom = rom;
  codeEditor.value = embeddedSource ?? SAMPLE_SOURCE;
  downloadBtn.disabled = false;
  standaloneExportBtn.disabled = false;
  statusEl.textContent = "配布用HTMLに同梱されたROMを実行中";
} else {
  // 埋め込みデータが無い通常起動時は、前回ビルド時に自動保存されたプロジェクトがあれば復元する。
  const savedProject = loadProjectFromLocalStorage();
  if (savedProject) {
    codeEditor.value = savedProject.code;
    setTiles(savedProject.tiles);
    if (savedProject.title) cartTitleInput.value = savedProject.title;
    if (savedProject.author) cartAuthorInput.value = savedProject.author;
    buildAndRun();
  } else {
    codeEditor.value = SAMPLE_SOURCE;
    loadDemoRom();
  }
}
reloadBtn.addEventListener("click", loadDemoRom);

// --- プロジェクトのエクスポート/インポート（JSON、Phase 5） ---
const projectExportBtn = document.querySelector<HTMLButtonElement>("#project-export-btn");
const projectImportInput = document.querySelector<HTMLInputElement>("#project-import-input");
const projectIoStatus = document.querySelector<HTMLSpanElement>("#project-io-status");

projectExportBtn?.addEventListener("click", () => {
  const project = createProject(codeEditor!.value, getTiles());
  project.title = cartTitleInput!.value;
  project.author = cartAuthorInput!.value;
  const blob = new Blob([serializeProject(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cartTitleInput!.value || "project"}.famijs.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  if (projectIoStatus) projectIoStatus.textContent = "エクスポート完了";
});

projectImportInput?.addEventListener("change", () => {
  const file = projectImportInput.files?.[0];
  if (!file || !projectIoStatus) return;
  file
    .text()
    .then((text) => {
      const project = parseProject(text);
      codeEditor.value = project.code;
      setTiles(project.tiles);
      if (project.title) cartTitleInput.value = project.title;
      if (project.author) cartAuthorInput.value = project.author;
      buildAndRun();
      projectIoStatus.textContent = `「${file.name}」を読み込みました`;
    })
    .catch((err: unknown) => {
      const message = err instanceof ProjectFormatError ? err.message : err instanceof Error ? err.message : String(err);
      projectIoStatus.textContent = `読み込み失敗: ${message}`;
    });
});

// --- 外部の.nesファイルの読み込み（ホームブリュー等の動作確認用） ---
const romUploadInput = document.querySelector<HTMLInputElement>("#rom-upload-input");
const romUploadStatus = document.querySelector<HTMLSpanElement>("#rom-upload-status");
romUploadInput?.addEventListener("change", () => {
  const file = romUploadInput.files?.[0];
  if (!file || !romUploadStatus) return;
  file
    .arrayBuffer()
    .then((buf) => {
      const bytes = new Uint8Array(buf);
      nes.loadRom(bytes);
      lastBuiltRom = bytes;
      downloadBtn.disabled = false;
      standaloneExportBtn.disabled = false;
      statusEl.textContent = `外部ROM「${file.name}」を実行中`;
      romUploadStatus.textContent = "読み込み成功";
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      romUploadStatus.textContent = `読み込み失敗: ${message}`;
    });
});

// --- 音源(APU)モニタ ---
const CHANNEL_LABELS = ["Pulse1", "Pulse2", "Triangle", "Noise"] as const;
const meterEls: { fill: HTMLDivElement; freq: HTMLSpanElement }[] = [];
const metersContainer = document.querySelector<HTMLDivElement>("#channel-meters");
if (metersContainer) {
  CHANNEL_LABELS.forEach((label) => {
    const row = document.createElement("div");
    row.className = "channel-meter";
    row.innerHTML = `<span>${label}</span><div class="bar-track"><div class="bar-fill"></div></div><span class="freq">-</span>`;
    metersContainer.appendChild(row);
    const fill = row.querySelector<HTMLDivElement>(".bar-fill")!;
    const freq = row.querySelector<HTMLSpanElement>(".freq")!;
    meterEls.push({ fill, freq });
  });
}

function updateChannelMeters(): void {
  const snapshots = audio.getChannelSnapshotsForUi(nes);
  snapshots.forEach((s, i) => {
    const el = meterEls[i];
    if (!el) return;
    el.fill.style.width = `${s.enabled ? (s.volume / 15) * 100 : 0}%`;
    el.freq.textContent = s.enabled ? `${Math.round(s.frequencyHz)}Hz` : "-";
  });
}

function frame(): void {
  nes.runFrame();
  imageData.data.set(nes.ppu.framebuffer);
  ctx!.putImageData(imageData, 0, 0);
  audio.update(nes);
  updateChannelMeters();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- 音源タブ: 試聴（playToneのその場再生） ---
const toneChannelSelect = document.querySelector<HTMLSelectElement>("#tone-channel");
const toneNoteSelect = document.querySelector<HTMLSelectElement>("#tone-note");
const tonePlayBtn = document.querySelector<HTMLButtonElement>("#tone-play-btn");

function refreshToneNoteOptions(): void {
  if (!toneChannelSelect || !toneNoteSelect) return;
  const channel = Number(toneChannelSelect.value);
  const isNoise = channel === 3;
  const count = isNoise ? 16 : 36;
  const previousValue = toneNoteSelect.value;
  toneNoteSelect.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = isNoise ? `周期${i}` : `${i}: ${noteIndexToLabel(i)}`;
    toneNoteSelect.appendChild(opt);
  }
  if (Number(previousValue) < count) toneNoteSelect.value = previousValue;
}

if (toneChannelSelect && toneNoteSelect && tonePlayBtn) {
  refreshToneNoteOptions();
  toneChannelSelect.addEventListener("change", refreshToneNoteOptions);
  tonePlayBtn.addEventListener("click", () => {
    startAudioOnce();
    const channel = Number(toneChannelSelect.value) as 0 | 1 | 2 | 3;
    const noteIndex = Number(toneNoteSelect.value);
    audio.previewTone(channel, noteIndex, 20);
  });
}

// --- 入力（キーボード/仮想パッド共通）。ネットプレイのゲストモード時は
//     ローカルのcontroller1ではなくWebRTC経由でホストへ送る（M8）。 ---
let netplayGuestActive = false;
let guestButtons = 0;

function setLocalButton(name: ButtonName, pressed: boolean): void {
  if (netplayGuestActive) {
    const bit = BUTTON[name];
    if (pressed) guestButtons |= 1 << bit;
    else guestButtons &= ~(1 << bit);
    netplayGuest.sendButtons(guestButtons);
    return;
  }
  nes.controller1.setButton(BUTTON[name], pressed);
}

// --- キーボード入力（PC向け） ---
const KEY_MAP: Record<string, ButtonName> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  KeyZ: "B",
  KeyX: "A",
  Enter: "START",
  ShiftRight: "SELECT",
  ShiftLeft: "SELECT",
};

window.addEventListener("keydown", (e) => {
  const btn = KEY_MAP[e.code];
  if (btn) {
    setLocalButton(btn, true);
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  const btn = KEY_MAP[e.code];
  if (btn) {
    setLocalButton(btn, false);
    e.preventDefault();
  }
});

// --- 仮想パッド（タッチデバイス向け、常時搭載。docs/01_ARCHITECTURE.md 参照） ---
const padButtons = document.querySelectorAll<HTMLButtonElement>("#virtual-pad button[data-btn]");
padButtons.forEach((el) => {
  const name = el.dataset.btn as ButtonName | undefined;
  if (!name || !(name in BUTTON)) return;

  const press = (pressed: boolean) => (ev: Event) => {
    ev.preventDefault();
    setLocalButton(name, pressed);
  };

  el.addEventListener("pointerdown", press(true));
  el.addEventListener("pointerup", press(false));
  el.addEventListener("pointerleave", press(false));
  el.addEventListener("pointercancel", press(false));
});

// --- ブロックエディタ（Scratch風、docs/03_DSL_SPEC.mdのDSLをブロック化） ---
const blockWorkspaceEl = document.querySelector<HTMLDivElement>("#block-workspace");
const blocksBuildBtn = document.querySelector<HTMLButtonElement>("#blocks-build-btn");
const blocksResetBtn = document.querySelector<HTMLButtonElement>("#blocks-reset-btn");
const blocksBuildStatus = document.querySelector<HTMLSpanElement>("#blocks-build-status");

let blockWorkspace: Blockly.WorkspaceSvg | null = null;
if (blockWorkspaceEl && blocksBuildBtn && blocksResetBtn && blocksBuildStatus) {
  blockWorkspace = initBlockEditor(blockWorkspaceEl);
  loadDefaultWorkspace(blockWorkspace);

  blocksBuildBtn.addEventListener("click", () => {
    if (!blockWorkspace) return;
    const source = generateSource(blockWorkspace);
    codeEditor.value = source;
    buildAndRun();
    blocksBuildStatus.textContent = buildStatus.textContent;
  });

  blocksResetBtn.addEventListener("click", () => {
    if (blockWorkspace) loadDefaultWorkspace(blockWorkspace);
  });
}

// --- タブ切り替え ---
const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tabs button[data-tab]");
const panels = document.querySelectorAll<HTMLDivElement>(".panel[data-panel]");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
    if (target === "blocks" && blockWorkspace) {
      Blockly.svgResize(blockWorkspace);
    }
  });
});

// --- プレイモード（PC向け全画面プレイ。エディタ部分を隠して画面プレビューだけ表示する） ---
const appEl = document.querySelector<HTMLDivElement>(".app");
const playModeBtn = document.querySelector<HTMLButtonElement>("#play-mode-btn");
const exitPlayModeBtn = document.querySelector<HTMLButtonElement>("#exit-play-mode-btn");

function setPlayMode(enabled: boolean): void {
  appEl?.classList.toggle("play-mode", enabled);
  if (exitPlayModeBtn) exitPlayModeBtn.hidden = !enabled;
}

if (appEl && playModeBtn && exitPlayModeBtn) {
  playModeBtn.addEventListener("click", () => {
    setPlayMode(true);
    void appEl.requestFullscreen?.().catch(() => {
      // フルスクリーンAPIが使えない/拒否された環境でも、エディタを隠すプレイモード自体は継続する
    });
  });

  exitPlayModeBtn.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    setPlayMode(false);
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) setPlayMode(false);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && appEl.classList.contains("play-mode")) {
      setPlayMode(false);
    }
  });
}

// --- オンライン対戦（WebRTC、M8 Phase1: 画面ストリーミング型） ---
const netplayHost = new NetplayHost();
const netplayGuest = new NetplayGuest();

const netplayHostStartBtn = document.querySelector<HTMLButtonElement>("#netplay-host-start");
const netplayHostOfferEl = document.querySelector<HTMLTextAreaElement>("#netplay-host-offer");
const netplayHostAnswerEl = document.querySelector<HTMLTextAreaElement>("#netplay-host-answer");
const netplayHostConnectBtn = document.querySelector<HTMLButtonElement>("#netplay-host-connect");
const netplayHostStatusEl = document.querySelector<HTMLParagraphElement>("#netplay-host-status");
const netplayGuestOfferEl = document.querySelector<HTMLTextAreaElement>("#netplay-guest-offer");
const netplayGuestJoinBtn = document.querySelector<HTMLButtonElement>("#netplay-guest-join");
const netplayGuestAnswerEl = document.querySelector<HTMLTextAreaElement>("#netplay-guest-answer");
const netplayGuestStatusEl = document.querySelector<HTMLParagraphElement>("#netplay-guest-status");
const netplayGuestVideoEl = document.querySelector<HTMLVideoElement>("#netplay-guest-video");

function applyGuestButtons(byte: number): void {
  for (let bit = 0; bit < 8; bit++) {
    nes.controller2.setButton(bit, (byte & (1 << bit)) !== 0);
  }
}

if (
  netplayHostStartBtn &&
  netplayHostOfferEl &&
  netplayHostAnswerEl &&
  netplayHostConnectBtn &&
  netplayHostStatusEl &&
  netplayGuestOfferEl &&
  netplayGuestJoinBtn &&
  netplayGuestAnswerEl &&
  netplayGuestStatusEl &&
  netplayGuestVideoEl
) {
  netplayHostStartBtn.addEventListener("click", () => {
    netplayHostStatusEl.textContent = "招待コードを生成中...";
    netplayHost
      .start(
        canvas,
        (buttons) => applyGuestButtons(buttons),
        (state) => {
          netplayHostStatusEl.textContent = `接続状態: ${state}`;
        },
      )
      .then((offerCode) => {
        netplayHostOfferEl.value = offerCode;
        netplayHostStatusEl.textContent = "招待コードを発行しました。ゲストに送ってください。";
      })
      .catch((err: unknown) => {
        netplayHostStatusEl.textContent = err instanceof Error ? err.message : String(err);
      });
  });

  netplayHostConnectBtn.addEventListener("click", () => {
    netplayHost
      .completeConnection(netplayHostAnswerEl.value)
      .then(() => {
        netplayHostStatusEl.textContent = "応答コードを適用しました。接続中...";
      })
      .catch((err: unknown) => {
        netplayHostStatusEl.textContent = err instanceof Error ? err.message : String(err);
      });
  });

  netplayGuestJoinBtn.addEventListener("click", () => {
    netplayGuestStatusEl.textContent = "応答コードを生成中...";
    netplayGuest
      .join(
        netplayGuestOfferEl.value,
        netplayGuestVideoEl,
        (state) => {
          netplayGuestStatusEl.textContent = `接続状態: ${state}`;
        },
      )
      .then((answerCode) => {
        netplayGuestAnswerEl.value = answerCode;
        netplayGuestStatusEl.textContent = "応答コードを発行しました。ホストに送ってください。";
        netplayGuestActive = true;
      })
      .catch((err: unknown) => {
        netplayGuestStatusEl.textContent = err instanceof Error ? err.message : String(err);
      });
  });
}
