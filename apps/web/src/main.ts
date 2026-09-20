import { BUTTON, parseINes, type ButtonName, type ChannelSnapshot } from "@js-nes/emulator-core";
import { buildBootRom } from "./bootRom.js";
import { compile } from "@js-nes/dsl-compiler";
import { downloadRom } from "@js-nes/rom-builder";
import { getTiles, initSpriteEditor, setTiles } from "./spriteEditor.js";
import { AudioEngine, noteIndexToLabel } from "./audio.js";
import { downloadCanvasAsPng, renderCartridgeLabel } from "./cartridgeLabel.js";
import { exportStandaloneHtml } from "./standaloneExport.js";
import { LockstepGuest, LockstepHost, NetplayGuest, NetplayHost } from "./netplay.js";
import NesWorkerCtor from "./nesWorker.ts?worker&inline";
import type { LoadRomContext, NesWorkerOutboundMessage } from "./nesWorkerProtocol.js";
import { pollGamepad, type GamepadButtonState } from "./gamepad.js";
import { applyDirDiff, bindVirtualStick, type DirState } from "./virtualStick.js";
import * as Blockly from "blockly/core";
import {
  generatePartBody,
  generateSceneBody,
  initBlockEditor,
  isEmptyBlockState,
  loadDefaultMainSceneBlocks,
  loadDefaultMoverPartBlocks,
  loadDefaultPlayerPartBlocks,
} from "./blocks/blockEditor.js";
import { PART_TOOLBOX, SCENE_TOOLBOX } from "./blocks/toolbox.js";
import {
  createEmptyProject,
  loadProjectFromLocalStorage,
  parseProject,
  saveProjectToLocalStorage,
  serializeProject,
  ProjectFormatError,
  type Project,
  type ProjectPart,
  type ProjectScene,
} from "./project.js";
import {
  loadProjectV3FromLocalStorage,
  migrateProjectV2toV3,
  saveProjectV3ToLocalStorage,
} from "./projectV3.js";
import { mountCreateExplorer, type CreateExplorerHandle } from "./createExplorer.js";
import { ensureV3SampleBlocks } from "./ensureV3SampleBlocks.js";
import { projectV3ToV2, ProjectV3BuildError } from "./projectBuildV3.js";
import { resolveRomFromFile } from "./romFromFile.js";
import { fetchSampleRomBytes, loadSampleCatalog, type SampleRomEntry } from "./sampleRoms.js";
import { buildProjectAssets, buildProjectSource, ProjectBuildError } from "./projectBuild.js";
import {
  clearStoredToken,
  fetchGithubUser,
  GithubAuthError,
  loadStoredToken,
  loginWithDeviceFlow,
  type GithubUser,
} from "./githubAuth.js";
import {
  ensureCloudRepo,
  listCloudProjects,
  listCloudRoms,
  loadCloudFileBytes,
  loadCloudFileText,
  saveCloudProject,
  saveCloudRom,
  type CloudFileEntry,
} from "./githubCloud.js";
import { isGithubCloudConfigured } from "./githubConfig.js";
import { applyPlayI18n, getPlayLocale, t } from "./playI18n.js";

applyPlayI18n();

const canvas = document.querySelector<HTMLCanvasElement>("#screen");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const reloadBtn = document.querySelector<HTMLButtonElement>("#reload-btn");
const buildBtn = document.querySelector<HTMLButtonElement>("#build-btn");
const downloadBtn = document.querySelector<HTMLButtonElement>("#download-btn");
const buildStatus = document.querySelector<HTMLSpanElement>("#build-status");
const buildError = document.querySelector<HTMLPreElement>("#build-error");
const buildSourcePreview = document.querySelector<HTMLTextAreaElement>("#build-source-preview");

const appVersionEl = document.querySelector<HTMLParagraphElement>("#app-version");
if (appVersionEl) {
  const ver = import.meta.env.VITE_APP_VERSION || "0.0.0";
  appVersionEl.textContent = `へろコン v${ver}`;
}
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
  !buildBtn ||
  !downloadBtn ||
  !buildStatus ||
  !buildError ||
  !buildSourcePreview ||
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

// --- NESエミュレーション本体はWeb Worker（nesWorker.ts）で自走させる。 ---
// メインスレッドのrequestAnimationFrameループ（描画・DOM操作等で詰まりうる）から
// 音声生成・配信を切り離すのが目的（C:\Users\alleng06\.claude\plans\refactored-cuddling-kay.md）。
const nesWorker = new NesWorkerCtor();
const audio = new AudioEngine();
audio.setWorker(nesWorker);

let audioUnlocked = false;
function startAudioOnce(): void {
  void audio.resume().then(() => {
    audioUnlocked = true;
  });
}
function kickAudioFromGesture(): void {
  if (!audioUnlocked) startAudioOnce();
  else audio.kick();
}
window.addEventListener("pointerdown", kickAudioFromGesture, { capture: true });
window.addEventListener("touchstart", kickAudioFromGesture, { capture: true, passive: true });
window.addEventListener("keydown", kickAudioFromGesture, { capture: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") audio.kick();
});

// Workerから届く最新の映像/音源メーター情報。rAFループはこれをベストエフォートで
// 描画するだけで、Worker側の実際のペースとは無関係。
let latestFramebuffer: Uint8ClampedArray | null = null;
let latestChannelSnapshots: ChannelSnapshot[] = [];
const loadRomResultHandlers: Partial<Record<LoadRomContext, (ok: boolean, message?: string) => void>> = {};

nesWorker.onmessage = (e: MessageEvent<NesWorkerOutboundMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "frame":
      latestFramebuffer = msg.framebuffer;
      latestChannelSnapshots = msg.channelSnapshots;
      if (
        msg.frame !== undefined &&
        msg.hash !== undefined &&
        (lockstepHostActive || lockstepGuestActive)
      ) {
        const peer = lockstepHostActive ? lockstepHost : lockstepGuest;
        peer.reportFramebufferHash(msg.frame, msg.hash);
      }
      break;
    case "loadRomResult":
      loadRomResultHandlers[msg.context]?.(msg.ok, msg.message);
      break;
    case "fatalError":
      statusEl!.textContent = t("status.workerCrash", { message: msg.message });
      break;
  }
};
nesWorker.onerror = (ev: ErrorEvent) => {
  statusEl!.textContent = t("status.workerError", { message: ev.message });
};

function loadRomInWorker(bytes: Uint8Array, context: LoadRomContext): void {
  nesWorker.postMessage({ type: "loadRom", bytes, context });
}

loadRomResultHandlers.demo = (ok, message) => {
  statusEl!.textContent = ok ? t("status.bootOk") : t("status.bootFail", { message: message ?? "" });
};
/** カセット未挿入時の電源ON／抜いたあと用。本体に組み込まれたブート画面。 */
function loadBootRom(): void {
  loadRomInWorker(buildBootRom(), "demo");
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- デフォルトプロジェクト（初回起動時のサンプル） ---
/** 8×8 タイルに簡単なシルエットを描く（全部 0 だと画面上で見えない）。 */
function makeSimpleTile(pattern: "player" | "mover"): number[] {
  const t = new Array(64).fill(0);
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < 8 && y >= 0 && y < 8) t[y * 8 + x] = c;
  };
  if (pattern === "player") {
    // 頭＋胴
    for (let x = 2; x <= 5; x++) put(x, 1, 3);
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) put(x, y, 2);
    put(3, 6, 1);
    put(4, 6, 1);
  } else {
    // 横長の敵っぽい形
    for (let x = 1; x <= 6; x++) put(x, 3, 3);
    for (let x = 2; x <= 5; x++) put(x, 4, 2);
    put(1, 3, 1);
    put(6, 3, 1);
  }
  return t;
}

// タイル0番＝自機（キー操作）、タイル1番＝もう1体（自動で左右に往復）の2パーツ構成。
// 「パーツにドット絵+振る舞いをセットで持たせ、シーンに配置する」という
// プロジェクト式そのものをサンプルとして示す。
function createDefaultProject(): Project {
  const project = createEmptyProject();
  project.title = "サンプル";
  project.parts.push({
    name: "Player",
    tiles: [makeSimpleTile("player")],
    code: [
      "field x = 120;",
      "field y = 100;",
      "",
      "behavior move(self) {",
      "  if (btn.right) { self.x += 1; }",
      "  if (btn.left) { self.x -= 1; }",
      "  if (btn.up) { self.y -= 1; }",
      "  if (btn.down) { self.y += 1; }",
      "  if (btn.a_just_pressed) { playSound(Jump); }",
      "  drawSprite(0, self.x, self.y, 0, 0);",
      "}",
    ].join("\n"),
  });
  project.parts.push({
    name: "Mover",
    tiles: [makeSimpleTile("mover")],
    code: [
      "field x = 200;",
      "field y = 50;",
      "field goingRight = 0;",
      "",
      "behavior move(self) {",
      "  if (self.goingRight) { self.x += 1; } else { self.x -= 1; }",
      "  if (self.x > 240) { self.goingRight = 0; }",
      "  if (self.x < 16) { self.goingRight = 1; }",
      "  drawSprite(1, self.x, self.y, 0, 1);",
      "}",
    ].join("\n"),
  });
  project.scenes.push({
    name: "Main",
    code: [
      "instance player: Player;",
      "instance mover: Mover;",
      "",
      "function init() {",
      "  setPalette(0, 1, 33, 0, 0);",
      "  setSpritePalette(0, 1, 34, 0, 0);",
      "  setSpritePalette(1, 1, 22, 0, 0);",
      "}",
      "",
      "function update() {",
      "  Player.move(player);",
      "  Mover.move(mover);",
      "}",
    ].join("\n"),
  });
  project.sounds.push({ name: "Jump", channel: 0, note: 24, duration: 10 });
  return project;
}

// --- プロジェクト（パーツ/シーン/サウンドの集まり）の状態管理 ---
let project: Project = createDefaultProject();
let currentPartIndex = -1;
let currentSceneIndex = -1;

const partSelect = document.querySelector<HTMLSelectElement>("#part-select");
const partAddBtn = document.querySelector<HTMLButtonElement>("#part-add-btn");
const partRenameBtn = document.querySelector<HTMLButtonElement>("#part-rename-btn");
const partDeleteBtn = document.querySelector<HTMLButtonElement>("#part-delete-btn");
const partEditorEl = document.querySelector<HTMLDivElement>("#part-editor");
const partCodeEditor = document.querySelector<HTMLTextAreaElement>("#part-code-editor");
const partBlockWorkspaceEl = document.querySelector<HTMLDivElement>("#part-block-workspace");
const partBlocksBuildBtn = document.querySelector<HTMLButtonElement>("#part-blocks-build-btn");
const partBlocksStatus = document.querySelector<HTMLSpanElement>("#part-blocks-status");

const sceneSelect = document.querySelector<HTMLSelectElement>("#scene-select");
const sceneAddBtn = document.querySelector<HTMLButtonElement>("#scene-add-btn");
const sceneRenameBtn = document.querySelector<HTMLButtonElement>("#scene-rename-btn");
const sceneDeleteBtn = document.querySelector<HTMLButtonElement>("#scene-delete-btn");
const sceneEditorEl = document.querySelector<HTMLDivElement>("#scene-editor");
const sceneCodeEditor = document.querySelector<HTMLTextAreaElement>("#scene-code-editor");
const sceneBlockWorkspaceEl = document.querySelector<HTMLDivElement>("#scene-block-workspace");
const sceneBlocksBuildBtn = document.querySelector<HTMLButtonElement>("#scene-blocks-build-btn");
const sceneBlocksStatus = document.querySelector<HTMLSpanElement>("#scene-blocks-status");

let partBlockWorkspace: Blockly.WorkspaceSvg | null = null;
let sceneBlockWorkspace: Blockly.WorkspaceSvg | null = null;
if (partBlockWorkspaceEl) partBlockWorkspace = initBlockEditor(partBlockWorkspaceEl, PART_TOOLBOX);
if (sceneBlockWorkspaceEl) sceneBlockWorkspace = initBlockEditor(sceneBlockWorkspaceEl, SCENE_TOOLBOX);

/** デフォルトサンプルに、コードと対になるブロックを載せる（ブロック＝主編集面）。 */
function seedDefaultProjectBlocks(proj: Project): void {
  if (!partBlockWorkspace || !sceneBlockWorkspace) return;
  if (proj.title !== "サンプル") return;
  const player = proj.parts.find((p) => p.name === "Player");
  const mover = proj.parts.find((p) => p.name === "Mover");
  const main = proj.scenes.find((s) => s.name === "Main");
  if (player && isEmptyBlockState(player.blocks)) {
    loadDefaultPlayerPartBlocks(partBlockWorkspace);
    player.blocks = Blockly.serialization.workspaces.save(partBlockWorkspace);
    player.code = generatePartBody(partBlockWorkspace);
  }
  if (mover && isEmptyBlockState(mover.blocks)) {
    loadDefaultMoverPartBlocks(partBlockWorkspace);
    mover.blocks = Blockly.serialization.workspaces.save(partBlockWorkspace);
    mover.code = generatePartBody(partBlockWorkspace);
  }
  if (main && isEmptyBlockState(main.blocks)) {
    loadDefaultMainSceneBlocks(sceneBlockWorkspace);
    main.blocks = Blockly.serialization.workspaces.save(sceneBlockWorkspace);
    main.code = generateSceneBody(sceneBlockWorkspace);
  }
  partBlockWorkspace.clear();
  sceneBlockWorkspace.clear();
}

const VALID_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function promptForName(message: string, existing: string[], initial = ""): string | null {
  const name = window.prompt(message, initial);
  if (name === null) return null;
  if (!VALID_NAME_RE.test(name)) {
    window.alert("名前は英字またはアンダースコアで始まり、英数字とアンダースコアのみが使えます");
    return null;
  }
  if (existing.includes(name)) {
    window.alert(`「${name}」は既に使われています`);
    return null;
  }
  return name;
}

/**
 * ドット絵エディタは常に256枚固定のバッファを持つが、実機のCHR-ROMは全パーツ合計で
 * 256枚（スプライト用パターンテーブル1枚分）しか入らない。ここで保存する際は
 * 「実際に絵が描かれた最後のタイル」までに切り詰め、複数パーツを作っても
 * すぐに枠を使い切ってしまわないようにする。
 */
function trimBlankTiles(allTiles: Uint8Array[]): number[][] {
  let lastNonBlank = -1;
  allTiles.forEach((t, i) => {
    if (t.some((v) => v !== 0)) lastNonBlank = i;
  });
  const count = Math.max(lastNonBlank + 1, 1);
  return allTiles.slice(0, count).map((t) => Array.from(t));
}

// --- パーツ: 現在編集中の内容をProjectへ書き戻す/選択を切り替える ---
function syncCurrentPartFromEditors(): void {
  if (currentPartIndex < 0) return;
  const part = project.parts[currentPartIndex];
  if (!part) return;
  if (partCodeEditor) part.code = partCodeEditor.value;
  part.tiles = trimBlankTiles(getTiles());
  if (partBlockWorkspace) {
    part.blocks = Blockly.serialization.workspaces.save(partBlockWorkspace);
  }
}

function loadPartIntoEditors(part: ProjectPart): void {
  if (partCodeEditor) partCodeEditor.value = part.code;
  setTiles(part.tiles);
  if (partBlockWorkspace) {
    partBlockWorkspace.clear();
    if (part.blocks) {
      Blockly.serialization.workspaces.load(part.blocks as never, partBlockWorkspace);
    }
  }
}

function refreshPartSelect(): void {
  if (!partSelect) return;
  partSelect.innerHTML = "";
  project.parts.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.name;
    partSelect.appendChild(opt);
  });
  const hasParts = project.parts.length > 0;
  if (partEditorEl) partEditorEl.hidden = !hasParts;
  if (partRenameBtn) partRenameBtn.disabled = !hasParts;
  if (partDeleteBtn) partDeleteBtn.disabled = !hasParts;
}

function selectPart(index: number): void {
  syncCurrentPartFromEditors();
  currentPartIndex = index;
  if (partSelect) partSelect.value = String(index);
  const part = project.parts[index];
  if (part) loadPartIntoEditors(part);
}

partSelect?.addEventListener("change", () => {
  const i = Number(partSelect.value);
  if (!Number.isNaN(i)) selectPart(i);
});

partAddBtn?.addEventListener("click", () => {
  const name = promptForName(
    "新しいパーツの名前（例: Ball）",
    project.parts.map((p) => p.name),
  );
  if (!name) return;
  syncCurrentPartFromEditors();
  project.parts.push({ name, tiles: [new Array(64).fill(0)], code: "" });
  refreshPartSelect();
  selectPart(project.parts.length - 1);
});

partRenameBtn?.addEventListener("click", () => {
  if (currentPartIndex < 0) return;
  const part = project.parts[currentPartIndex];
  if (!part) return;
  const name = promptForName(
    "パーツの新しい名前",
    project.parts.filter((_p, i) => i !== currentPartIndex).map((p) => p.name),
    part.name,
  );
  if (!name) return;
  part.name = name;
  refreshPartSelect();
  if (partSelect) partSelect.value = String(currentPartIndex);
});

partDeleteBtn?.addEventListener("click", () => {
  if (currentPartIndex < 0) return;
  const part = project.parts[currentPartIndex];
  if (!part) return;
  if (!window.confirm(`パーツ「${part.name}」を削除しますか？`)) return;
  project.parts.splice(currentPartIndex, 1);
  currentPartIndex = -1;
  refreshPartSelect();
  if (project.parts.length > 0) selectPart(0);
});

partBlocksBuildBtn?.addEventListener("click", () => {
  if (!partBlockWorkspace || !partCodeEditor) return;
  if (partBlockWorkspace.getAllBlocks(false).length === 0) {
    if (partBlocksStatus) partBlocksStatus.textContent = "ブロックがありません。左のカテゴリから置いてください";
    return;
  }
  partCodeEditor.value = generatePartBody(partBlockWorkspace);
  if (partBlocksStatus) partBlocksStatus.textContent = "コードを生成しました（「コード」タブで確認できます）";
});

// --- シーン: 現在編集中の内容をProjectへ書き戻す/選択を切り替える ---
function syncCurrentSceneFromEditors(): void {
  if (currentSceneIndex < 0) return;
  const scene = project.scenes[currentSceneIndex];
  if (!scene) return;
  if (sceneCodeEditor) scene.code = sceneCodeEditor.value;
  if (sceneBlockWorkspace) {
    scene.blocks = Blockly.serialization.workspaces.save(sceneBlockWorkspace);
  }
}

function loadSceneIntoEditors(scene: ProjectScene): void {
  if (sceneCodeEditor) sceneCodeEditor.value = scene.code;
  if (sceneBlockWorkspace) {
    sceneBlockWorkspace.clear();
    if (scene.blocks) {
      Blockly.serialization.workspaces.load(scene.blocks as never, sceneBlockWorkspace);
    }
  }
}

function refreshSceneSelect(): void {
  if (!sceneSelect) return;
  sceneSelect.innerHTML = "";
  project.scenes.forEach((s, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = s.name;
    sceneSelect.appendChild(opt);
  });
  const hasScenes = project.scenes.length > 0;
  if (sceneEditorEl) sceneEditorEl.hidden = !hasScenes;
  if (sceneRenameBtn) sceneRenameBtn.disabled = !hasScenes;
  if (sceneDeleteBtn) sceneDeleteBtn.disabled = !hasScenes;
  // codegen.tsの制約（シーンはちょうど1つ）に合わせ、既に1つあれば追加を封じる
  if (sceneAddBtn) sceneAddBtn.disabled = project.scenes.length >= 1;
}

function selectScene(index: number): void {
  syncCurrentSceneFromEditors();
  currentSceneIndex = index;
  if (sceneSelect) sceneSelect.value = String(index);
  const scene = project.scenes[index];
  if (scene) loadSceneIntoEditors(scene);
}

sceneSelect?.addEventListener("change", () => {
  const i = Number(sceneSelect.value);
  if (!Number.isNaN(i)) selectScene(i);
});

sceneAddBtn?.addEventListener("click", () => {
  if (project.scenes.length >= 1) {
    window.alert("シーンは現在ちょうど1つまでしか使えません");
    return;
  }
  const name = promptForName(
    "新しいシーンの名前（例: Main）",
    project.scenes.map((s) => s.name),
    "Main",
  );
  if (!name) return;
  syncCurrentSceneFromEditors();
  project.scenes.push({ name, code: "function init() {}\nfunction update() {}\n" });
  refreshSceneSelect();
  selectScene(project.scenes.length - 1);
});

sceneRenameBtn?.addEventListener("click", () => {
  if (currentSceneIndex < 0) return;
  const scene = project.scenes[currentSceneIndex];
  if (!scene) return;
  const name = promptForName(
    "シーンの新しい名前",
    project.scenes.filter((_s, i) => i !== currentSceneIndex).map((s) => s.name),
    scene.name,
  );
  if (!name) return;
  scene.name = name;
  refreshSceneSelect();
  if (sceneSelect) sceneSelect.value = String(currentSceneIndex);
});

sceneDeleteBtn?.addEventListener("click", () => {
  if (currentSceneIndex < 0) return;
  const scene = project.scenes[currentSceneIndex];
  if (!scene) return;
  if (!window.confirm(`シーン「${scene.name}」を削除しますか？`)) return;
  project.scenes.splice(currentSceneIndex, 1);
  currentSceneIndex = -1;
  refreshSceneSelect();
  if (project.scenes.length > 0) selectScene(0);
});

sceneBlocksBuildBtn?.addEventListener("click", () => {
  if (!sceneBlockWorkspace || !sceneCodeEditor) return;
  if (sceneBlockWorkspace.getAllBlocks(false).length === 0) {
    if (sceneBlocksStatus) sceneBlocksStatus.textContent = "ブロックがありません。左のカテゴリから置いてください";
    return;
  }
  sceneCodeEditor.value = generateSceneBody(sceneBlockWorkspace);
  if (sceneBlocksStatus) sceneBlocksStatus.textContent = "コードを生成しました（「コード」タブで確認できます）";
});

// --- パーツ/シーン共通: コード⇔ブロックのサブタブ切り替え ---
function wireSubtabs(panelSelector: string): void {
  const panel = document.querySelector<HTMLDivElement>(panelSelector);
  if (!panel) return;
  const subtabButtons = panel.querySelectorAll<HTMLButtonElement>(".subtabs button[data-subtab]");
  const subpanels = panel.querySelectorAll<HTMLDivElement>(".subpanel[data-subpanel]");
  subtabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.subtab;
      subtabButtons.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      subpanels.forEach((p) => p.classList.toggle("active", p.dataset.subpanel === target));
      if (target === "blocks") {
        if (panelSelector.includes("parts") && partBlockWorkspace) Blockly.svgResize(partBlockWorkspace);
        if (panelSelector.includes("scenes") && sceneBlockWorkspace) Blockly.svgResize(sceneBlockWorkspace);
      }
    });
  });
}
wireSubtabs('[data-panel="parts"]');
wireSubtabs('[data-panel="scenes"]');

let lastBuiltRom: Uint8Array | null = null;
/** Create エクスプローラ（後段で mount）。ビルド前 flush 用。 */
let createExplorerHandle: CreateExplorerHandle | null = null;

function refreshCartridgeLabel(): void {
  renderCartridgeLabel(cartCanvas!, {
    title: cartTitleInput!.value,
    author: cartAuthorInput!.value,
  });
}

// build文脈のロード結果: 「実際に動いているか」を表すstatusEl文言だけを非同期に反映する。
// lastBuiltRom保存・ダウンロードボタン活性化・カートリッジラベル更新・localStorage保存は
// 「コンパイル済みバイト列に対する処理」であり実機起動の成否とは独立なので、
// buildAndRun()内でloadRomInWorker()送信直後に楽観的に同期実行する。
loadRomResultHandlers.build = (ok, message) => {
  statusEl!.textContent = ok ? "" : `プロジェクトの実行に失敗しました: ${message}`;
};

function buildAndRun(): void {
  syncCurrentPartFromEditors();
  syncCurrentSceneFromEditors();
  createExplorerHandle?.flush();

  buildError!.hidden = true;
  buildError!.textContent = "";
  try {
    // Create v3 を正とし、ビルド経路は既存の v2 コンパイラへ落とす
    if (createExplorerHandle) {
      const v3 = createExplorerHandle.getProject();
      project = projectV3ToV2(v3);
      if (v3.title) cartTitleInput!.value = v3.title;
      if (v3.author) cartAuthorInput!.value = v3.author;
      refreshPartSelect();
      refreshSceneSelect();
    }

    const source = buildProjectSource(project);
    buildSourcePreview!.value = source;
    const assets = buildProjectAssets(project);
    const { rom } = compile(source, assets);
    loadRomInWorker(rom, "build");
    lastBuiltRom = rom;
    downloadBtn!.disabled = false;
    standaloneExportBtn!.disabled = false;
    buildStatus!.textContent = "ビルド成功";
    refreshCartridgeLabel();

    project.title = cartTitleInput!.value;
    project.author = cartAuthorInput!.value;
    saveProjectToLocalStorage(project);
    if (createExplorerHandle) {
      saveProjectV3ToLocalStorage(createExplorerHandle.getProject());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    buildError!.hidden = false;
    buildError!.textContent = message;
    buildStatus!.textContent = "ビルド失敗";
    if (err instanceof ProjectV3BuildError || err instanceof ProjectBuildError) {
      // already shown
    }
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
  exportStandaloneHtml(lastBuiltRom, buildProjectSource(project), `${cartTitleInput!.value || "game"}.html`)
    .then(() => {
      standaloneExportStatus!.textContent = "書き出し完了";
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      standaloneExportStatus!.textContent = message;
    });
});

// --- 起動時: プロジェクトの読み込み ---
// 優先順位: (1) スタンドアロン書き出し版として開かれた場合の埋め込みROM
//           (2) localStorageに保存された前回のプロジェクト
//           (3) 組み込みのデフォルトプロジェクト（サンプル）
interface EmbeddedData {
  rom: string | null;
  source: string | null;
}
const embeddedDataEl = document.querySelector<HTMLScriptElement>("#embedded-data");
let embeddedRomB64: string | null = null;
if (embeddedDataEl?.textContent) {
  try {
    const parsed = JSON.parse(embeddedDataEl.textContent) as EmbeddedData;
    embeddedRomB64 = parsed.rom;
  } catch {
    // 埋め込みデータが壊れている場合は通常起動にフォールバック
  }
}

loadRomResultHandlers.embedded = (ok, message) => {
  if (!ok) statusEl!.textContent = t("status.embeddedFail", { message: message ?? "" });
};

if (embeddedRomB64) {
  const rom = fromBase64(embeddedRomB64);
  loadRomInWorker(rom, "embedded");
  lastBuiltRom = rom;
  downloadBtn.disabled = false;
  standaloneExportBtn.disabled = false;
  statusEl.textContent = t("status.embeddedOk");
} else {
  const savedProject = loadProjectFromLocalStorage();
  if (savedProject) project = savedProject;
  seedDefaultProjectBlocks(project);
  if (project.title) cartTitleInput.value = project.title;
  if (project.author) cartAuthorInput.value = project.author;
}

// --- Create v3 エクスプローラ ---
let projectV3 = loadProjectV3FromLocalStorage() ?? migrateProjectV2toV3(project);
if (ensureV3SampleBlocks(projectV3)) {
  saveProjectV3ToLocalStorage(projectV3);
}
const createExplorerRoot = document.querySelector<HTMLElement>("#create-explorer-root");
if (createExplorerRoot) {
  createExplorerHandle = mountCreateExplorer(
    createExplorerRoot,
    projectV3,
    (next) => {
      projectV3 = next;
      saveProjectV3ToLocalStorage(next);
    },
    { onBuild: () => buildAndRun() },
  );
  // サンプルがあれば最初に Player のブロックを見せる
  const playerId = projectV3.characterOrder.find((id) => projectV3.characters[id]?.name === "Player");
  if (playerId) createExplorerHandle.selectCharacter(playerId);
}

refreshPartSelect();
refreshSceneSelect();
if (project.parts.length > 0) selectPart(0);
if (project.scenes.length > 0) selectScene(0);
if (!embeddedRomB64) {
  // Play はカセットなし＝内蔵ブート画面。Create のサンプルはビルドボタンで流す。
  loadBootRom();
}
reloadBtn.addEventListener("click", loadBootRom);

// --- プロジェクトのエクスポート/インポート（JSON） ---
const projectExportBtn = document.querySelector<HTMLButtonElement>("#project-export-btn");
const projectImportInput = document.querySelector<HTMLInputElement>("#project-import-input");
const projectIoStatus = document.querySelector<HTMLSpanElement>("#project-io-status");

projectExportBtn?.addEventListener("click", () => {
  syncCurrentPartFromEditors();
  syncCurrentSceneFromEditors();
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
      project = parseProject(text);
      currentPartIndex = -1;
      currentSceneIndex = -1;
      if (project.title) cartTitleInput.value = project.title;
      if (project.author) cartAuthorInput.value = project.author;
      refreshPartSelect();
      refreshSceneSelect();
      if (project.parts.length > 0) selectPart(0);
      if (project.scenes.length > 0) selectScene(0);
      buildAndRun();
      projectIoStatus.textContent = `「${file.name}」を読み込みました`;
    })
    .catch((err: unknown) => {
      const message =
        err instanceof ProjectFormatError ? err.message : err instanceof Error ? err.message : String(err);
      projectIoStatus.textContent = `読み込み失敗: ${message}`;
    });
});

// --- 外部ROM（カセット）の挿抜・リセット ---
const romUploadInput = document.querySelector<HTMLInputElement>("#rom-upload-input");
const romUploadStatus = document.querySelector<HTMLParagraphElement>("#rom-upload-status");
const cassetteInsertBtn = document.querySelector<HTMLButtonElement>("#cassette-insert-btn");
const cassetteEjectBtn = document.querySelector<HTMLButtonElement>("#cassette-eject-btn");
const cassetteResetBtn = document.querySelector<HTMLButtonElement>("#cassette-reset-btn");
const cassetteBody = document.querySelector<HTMLDivElement>("#cassette-body");
const cassetteTitle = document.querySelector<HTMLParagraphElement>("#cassette-title");
const cassetteSub = document.querySelector<HTMLParagraphElement>("#cassette-sub");
const cassetteSlot = document.querySelector<HTMLDivElement>("#cassette-slot");
const controlsHelpBtn = document.querySelector<HTMLButtonElement>("#controls-help-btn");
const controlsHelpDialog = document.querySelector<HTMLDialogElement>("#controls-help-dialog");
const screenshotBtn = document.querySelector<HTMLButtonElement>("#screenshot-btn");
const recordBtn = document.querySelector<HTMLButtonElement>("#record-btn");

/** Play用に刺さっているカセット。null のときは内蔵ブート ROM。 */
let insertedCassette: {
  name: string;
  bytes: Uint8Array;
  /** 収録ソフト（都度DL）。GitHub 倉庫には保存しない */
  fromSample?: boolean;
} | null = null;

function formatCassetteMeta(bytes: Uint8Array): string {
  try {
    const rom = parseINes(bytes);
    const prgKb = Math.round(rom.prgRom.length / 1024);
    const chrLabel = rom.chrIsRam ? "CHR-RAM" : `${Math.round(rom.chrRom.length / 1024)}KB CHR`;
    return `Mapper ${rom.mapperId} / ${prgKb}KB PRG / ${chrLabel} / ${rom.mirroring}`;
  } catch {
    return t("cassette.insertedMetaFallback");
  }
}

function setCassetteUi(inserted: { name: string; meta?: string } | null, status = ""): void {
  if (cassetteBody) cassetteBody.dataset.inserted = inserted ? "true" : "false";
  if (cassetteTitle) cassetteTitle.textContent = inserted ? inserted.name : t("cassette.none");
  if (cassetteSub) {
    cassetteSub.textContent = inserted
      ? (inserted.meta ?? t("cassette.insertedMetaFallback"))
      : t("cassette.emptySub");
  }
  if (cassetteEjectBtn) cassetteEjectBtn.disabled = !inserted;
  if (romUploadStatus) romUploadStatus.textContent = status;
}

function insertCassette(
  name: string,
  bytes: Uint8Array,
  statusOnOk = t("cassette.insertedOk"),
  opts?: { fromSample?: boolean },
): void {
  const meta = formatCassetteMeta(bytes);
  insertedCassette = { name, bytes, fromSample: opts?.fromSample === true };
  loadRomResultHandlers.upload = (ok, message) => {
    if (ok) {
      lastBuiltRom = bytes;
      downloadBtn!.disabled = false;
      standaloneExportBtn!.disabled = false;
      statusEl!.textContent = t("cassette.running", { name });
      setCassetteUi({ name, meta }, statusOnOk);
    } else {
      insertedCassette = null;
      setCassetteUi(null, t("cassette.insertFailed", { message: message ?? "" }));
    }
  };
  loadRomInWorker(bytes, "upload");
}

function ejectCassette(): void {
  insertedCassette = null;
  setCassetteUi(null, t("cassette.ejected"));
  loadBootRom();
  statusEl!.textContent = t("cassette.ejectedStatus");
}

function resetConsole(): void {
  if (insertedCassette) {
    loadRomInWorker(insertedCassette.bytes, "upload");
    statusEl!.textContent = t("cassette.resetNamed", { name: insertedCassette.name });
    setCassetteUi(
      { name: insertedCassette.name, meta: formatCassetteMeta(insertedCassette.bytes) },
      t("cassette.resetOk"),
    );
    return;
  }
  loadBootRom();
  setCassetteUi(null, t("cassette.resetBoot"));
}

function loadNesFile(file: File): void {
  void resolveRomFromFile(file)
    .then((rom) => {
      const status = rom.note
        ? rom.note
        : rom.fromZip
          ? t("cassette.zipInserted", { name: rom.name })
          : t("cassette.insertedOk");
      insertCassette(rom.name, rom.bytes, status, { fromSample: false });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setCassetteUi(insertedCassette ? { name: insertedCassette.name } : null, t("cassette.loadFailed", { message }));
    });
}

const sampleRomSelect = document.querySelector<HTMLSelectElement>("#sample-rom-select");
const sampleRomPlayBtn = document.querySelector<HTMLButtonElement>("#sample-rom-play-btn");
const sampleRomBlurb = document.querySelector<HTMLElement>("#sample-rom-blurb");
const sampleRomSummary = document.querySelector<HTMLElement>("#sample-rom-summary");
const sampleRomHowto = document.querySelector<HTMLElement>("#sample-rom-howto");
const sampleRomAuthor = document.querySelector<HTMLElement>("#sample-rom-author");
const sampleRomLicense = document.querySelector<HTMLElement>("#sample-rom-license");
const sampleRomCopyright = document.querySelector<HTMLElement>("#sample-rom-copyright");
const sampleRomCopyrightRow = document.querySelector<HTMLElement>("#sample-rom-copyright-row");
const sampleRomUrl = document.querySelector<HTMLElement>("#sample-rom-url");
const sampleRomUrlRow = document.querySelector<HTMLElement>("#sample-rom-url-row");
let sampleRomEntries: SampleRomEntry[] = [];

type SampleKind = NonNullable<SampleRomEntry["kind"]>;

const KIND_ORDER: SampleKind[] = ["game", "demo", "tool", "template", "test"];

function kindOf(entry: SampleRomEntry): SampleKind {
  if (entry.kind) return entry.kind;
  if (entry.group === "test") return "test";
  const t = entry.title.toLowerCase();
  if (t.includes("template")) return "template";
  if (t.includes("editor")) return "tool";
  if (t.includes("demo") || t.includes("new year") || t.includes("zap")) return "demo";
  return "game";
}

function kindLabel(kind: SampleKind): string {
  if (kind === "game") return t("sample.kind.game");
  if (kind === "demo") return t("sample.kind.demo");
  if (kind === "tool") return t("sample.kind.tool");
  if (kind === "template") return t("sample.kind.template");
  return t("sample.kind.test");
}

function kindTag(kind: SampleKind): string {
  if (kind === "game") return t("sample.tag.game");
  if (kind === "demo") return t("sample.tag.demo");
  if (kind === "tool") return t("sample.tag.tool");
  if (kind === "template") return t("sample.tag.template");
  return t("sample.tag.test");
}

function updateSampleRomBlurb(): void {
  const id = sampleRomSelect?.value ?? "";
  const entry = sampleRomEntries.find((e) => e.id === id);
  if (!entry || !sampleRomBlurb || !sampleRomSummary || !sampleRomHowto) {
    sampleRomBlurb?.setAttribute("hidden", "");
    return;
  }
  const kind = kindOf(entry);
  const en = getPlayLocale() === "en";
  const summary =
    (en ? entry.summaryEn : entry.summary)?.trim() ||
    entry.summaryEn?.trim() ||
    entry.summary?.trim() ||
    t("sample.fallbackSummary", {
      kind: kindLabel(kind),
      author: entry.author,
      license: entry.license,
      mapper: entry.mapper,
    });
  const howto =
    (en ? entry.howtoEn : entry.howto)?.trim() ||
    entry.howtoEn?.trim() ||
    entry.howto?.trim() ||
    t("sample.fallbackHowto");
  sampleRomSummary.textContent = `【${kindTag(kind)}】${summary}`;
  sampleRomHowto.textContent = howto;

  if (sampleRomAuthor) sampleRomAuthor.textContent = entry.author;
  if (sampleRomLicense) {
    sampleRomLicense.textContent = `${entry.license} · ${t("sample.metaMapper")} ${entry.mapper}`;
  }
  if (sampleRomCopyright && sampleRomCopyrightRow) {
    const credit = entry.copyright?.trim() ?? "";
    sampleRomCopyright.textContent = credit;
    sampleRomCopyrightRow.hidden = credit.length === 0;
  }
  if (sampleRomUrl && sampleRomUrlRow) {
    const href = entry.url?.trim() ?? "";
    sampleRomUrl.replaceChildren();
    if (href) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = href.replace(/^https?:\/\//, "");
      sampleRomUrl.appendChild(a);
      sampleRomUrlRow.hidden = false;
    } else {
      sampleRomUrlRow.hidden = true;
    }
  }

  sampleRomBlurb.removeAttribute("hidden");
}

function populateSampleRomSelect(entries: SampleRomEntry[]): void {
  if (!sampleRomSelect) return;
  sampleRomEntries = entries;
  sampleRomSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("sample.pick");
  sampleRomSelect.appendChild(placeholder);

  for (const kind of KIND_ORDER) {
    const inKind = entries.filter((e) => kindOf(e) === kind);
    if (inKind.length === 0) continue;
    const og = document.createElement("optgroup");
    og.label = kindLabel(kind);
    for (const e of inKind) {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.title} — ${e.author}`;
      og.appendChild(opt);
    }
    sampleRomSelect.appendChild(og);
  }
  sampleRomSelect.disabled = entries.length === 0;
  if (sampleRomPlayBtn) sampleRomPlayBtn.disabled = entries.length === 0;
  updateSampleRomBlurb();
}

void loadSampleCatalog()
  .then((cat) => populateSampleRomSelect(cat.roms))
  .catch((err: unknown) => {
    if (sampleRomSelect) {
      sampleRomSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = t("sample.fetchFailed");
      sampleRomSelect.appendChild(opt);
      sampleRomSelect.disabled = true;
    }
    if (sampleRomPlayBtn) sampleRomPlayBtn.disabled = true;
    sampleRomBlurb?.setAttribute("hidden", "");
    setCassetteUi(
      insertedCassette ? { name: insertedCassette.name } : null,
      err instanceof Error ? err.message : String(err),
    );
  });

sampleRomSelect?.addEventListener("change", () => {
  updateSampleRomBlurb();
});

sampleRomPlayBtn?.addEventListener("click", () => {
  const id = sampleRomSelect?.value;
  const entry = sampleRomEntries.find((e) => e.id === id);
  if (!entry) {
    setCassetteUi(insertedCassette ? { name: insertedCassette.name } : null, t("sample.pickPlease"));
    return;
  }
  sampleRomPlayBtn.disabled = true;
  setCassetteUi(insertedCassette ? { name: insertedCassette.name } : null, t("sample.downloading", { title: entry.title }));
  void fetchSampleRomBytes(entry)
    .then((bytes) => {
      // メモリ上だけで刺す。永続化・倉庫保存はしない（fromSample）
      insertCassette(entry.title, bytes, t("sample.inserted", { title: entry.title }), {
        fromSample: true,
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setCassetteUi(
        insertedCassette ? { name: insertedCassette.name } : null,
        t("sample.loadFailed", { message }),
      );
    })
    .finally(() => {
      sampleRomPlayBtn.disabled = sampleRomEntries.length === 0;
    });
});


controlsHelpBtn?.addEventListener("click", () => {
  controlsHelpDialog?.showModal();
});

// 背景（dialog本体の外側）クリックで閉じる
controlsHelpDialog?.addEventListener("click", (e) => {
  if (e.target === controlsHelpDialog) controlsHelpDialog.close();
});

cassetteInsertBtn?.addEventListener("click", () => {
  romUploadInput?.click();
});

cassetteEjectBtn?.addEventListener("click", () => {
  ejectCassette();
});

cassetteResetBtn?.addEventListener("click", () => {
  resetConsole();
});

romUploadInput?.addEventListener("change", () => {
  const file = romUploadInput.files?.[0];
  if (!file) return;
  loadNesFile(file);
  romUploadInput.value = "";
});

if (cassetteSlot) {
  cassetteSlot.addEventListener("dragenter", (e) => {
    e.preventDefault();
    cassetteSlot.classList.add("drag-over");
  });
  cassetteSlot.addEventListener("dragover", (e) => {
    e.preventDefault();
    cassetteSlot.classList.add("drag-over");
  });
  cassetteSlot.addEventListener("dragleave", (e) => {
    if (e.target === cassetteSlot) cassetteSlot.classList.remove("drag-over");
  });
  cassetteSlot.addEventListener("drop", (e) => {
    e.preventDefault();
    cassetteSlot.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) loadNesFile(file);
  });
}

setCassetteUi(null);

// --- GitHub クラウド（Device Flow + auth-relay） ---
const githubCloudPanel = document.querySelector<HTMLElement>("#github-cloud-panel");
const githubLoginBtn = document.querySelector<HTMLButtonElement>("#github-login-btn");
const githubLogoutBtn = document.querySelector<HTMLButtonElement>("#github-logout-btn");
const githubUserLabel = document.querySelector<HTMLParagraphElement>("#github-user-label");
const githubAuthStatus = document.querySelector<HTMLParagraphElement>("#github-auth-status");
const githubDeviceHint = document.querySelector<HTMLDivElement>("#github-device-hint");
const githubUserCodeEl = document.querySelector<HTMLElement>("#github-user-code");
const githubVerifyLink = document.querySelector<HTMLAnchorElement>("#github-verify-link");
const githubCloudControls = document.querySelector<HTMLDivElement>("#github-cloud-controls");
const githubRomSelect = document.querySelector<HTMLSelectElement>("#github-rom-select");
const githubProjectSelect = document.querySelector<HTMLSelectElement>("#github-project-select");
const githubRomLoadBtn = document.querySelector<HTMLButtonElement>("#github-rom-load-btn");
const githubRomSaveBtn = document.querySelector<HTMLButtonElement>("#github-rom-save-btn");
const githubRomRefreshBtn = document.querySelector<HTMLButtonElement>("#github-rom-refresh-btn");
const githubProjectLoadBtn = document.querySelector<HTMLButtonElement>("#github-project-load-btn");
const githubProjectSaveBtn = document.querySelector<HTMLButtonElement>("#github-project-save-btn");
const githubProjectRefreshBtn = document.querySelector<HTMLButtonElement>("#github-project-refresh-btn");

let githubToken: string | null = null;
let githubUser: GithubUser | null = null;
let githubRepo: { owner: string; repo: string } | null = null;
let githubLoginAbort: AbortController | null = null;

function setGithubAuthStatus(text: string): void {
  if (githubAuthStatus) githubAuthStatus.textContent = text;
}

function fillCloudSelect(select: HTMLSelectElement | null, entries: CloudFileEntry[], emptyLabel: string): void {
  if (!select) return;
  select.innerHTML = "";
  if (entries.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = emptyLabel;
    select.appendChild(opt);
    return;
  }
  for (const e of entries) {
    const opt = document.createElement("option");
    opt.value = e.path;
    opt.textContent = e.name;
    select.appendChild(opt);
  }
}

async function refreshCloudLists(): Promise<void> {
  if (!githubToken || !githubRepo) return;
  const [roms, projects] = await Promise.all([
    listCloudRoms(githubToken, githubRepo.owner, githubRepo.repo),
    listCloudProjects(githubToken, githubRepo.owner, githubRepo.repo),
  ]);
  fillCloudSelect(githubRomSelect, roms, t("github.noRoms"));
  fillCloudSelect(githubProjectSelect, projects, t("github.noProjects"));
}

async function activateGithubSession(token: string): Promise<void> {
  githubToken = token;
  githubUser = await fetchGithubUser(token);
  githubRepo = await ensureCloudRepo(token, githubUser.login);
  if (githubUserLabel) githubUserLabel.textContent = `@${githubUser.login}`;
  if (githubLoginBtn) githubLoginBtn.hidden = true;
  if (githubLogoutBtn) githubLogoutBtn.hidden = false;
  if (githubCloudControls) githubCloudControls.hidden = false;
  if (githubDeviceHint) githubDeviceHint.hidden = true;
  setGithubAuthStatus(t("github.usingRepo", { owner: githubRepo.owner, repo: githubRepo.repo }));
  await refreshCloudLists();
}

function clearGithubSession(): void {
  githubLoginAbort?.abort();
  githubLoginAbort = null;
  githubToken = null;
  githubUser = null;
  githubRepo = null;
  clearStoredToken();
  if (githubUserLabel) githubUserLabel.textContent = t("github.loggedOut");
  if (githubLoginBtn) githubLoginBtn.hidden = false;
  if (githubLogoutBtn) githubLogoutBtn.hidden = true;
  if (githubCloudControls) githubCloudControls.hidden = true;
  if (githubDeviceHint) githubDeviceHint.hidden = true;
  setGithubAuthStatus("");
}

if (!isGithubCloudConfigured()) {
  if (githubCloudPanel) githubCloudPanel.hidden = true;
} else {
  const existing = loadStoredToken();
  if (existing) {
    activateGithubSession(existing).catch((err: unknown) => {
      clearGithubSession();
      setGithubAuthStatus(err instanceof Error ? err.message : String(err));
    });
  }

  githubLoginBtn?.addEventListener("click", () => {
    githubLoginAbort?.abort();
    githubLoginAbort = new AbortController();
    setGithubAuthStatus(t("github.loginPreparing"));
    if (githubDeviceHint) githubDeviceHint.hidden = true;
    loginWithDeviceFlow((info) => {
      if (githubUserCodeEl) githubUserCodeEl.textContent = info.userCode;
      if (githubVerifyLink) {
        githubVerifyLink.href = info.verificationUri;
        githubVerifyLink.textContent = info.verificationUri;
      }
      if (githubDeviceHint) githubDeviceHint.hidden = false;
      setGithubAuthStatus(t("github.enterCode"));
    }, githubLoginAbort.signal)
      .then((token) => activateGithubSession(token))
      .catch((err: unknown) => {
        if (err instanceof GithubAuthError && /cancel|キャンセル/i.test(err.message)) {
          setGithubAuthStatus(t("github.loginCancelled"));
        } else {
          setGithubAuthStatus(err instanceof Error ? err.message : String(err));
        }
        if (githubDeviceHint) githubDeviceHint.hidden = true;
      });
  });

  githubLogoutBtn?.addEventListener("click", () => {
    clearGithubSession();
    setGithubAuthStatus(t("github.loggedOutStatus"));
  });

  githubRomRefreshBtn?.addEventListener("click", () => {
    refreshCloudLists()
      .then(() => setGithubAuthStatus(t("github.listRefreshed")))
      .catch((err: unknown) => setGithubAuthStatus(err instanceof Error ? err.message : String(err)));
  });

  githubProjectRefreshBtn?.addEventListener("click", () => {
    refreshCloudLists()
      .then(() => setGithubAuthStatus(t("github.listRefreshed")))
      .catch((err: unknown) => setGithubAuthStatus(err instanceof Error ? err.message : String(err)));
  });

  githubRomLoadBtn?.addEventListener("click", () => {
    const path = githubRomSelect?.value;
    if (!path || !githubToken || !githubRepo) return;
    setGithubAuthStatus(t("github.fetchingRom"));
    loadCloudFileBytes(githubToken, githubRepo.owner, githubRepo.repo, path)
      .then((bytes) => {
        const name = path.split("/").pop()?.replace(/\.nes$/i, "") || "cloud";
        insertCassette(name, bytes);
        setGithubAuthStatus(t("github.romInserted", { name }));
      })
      .catch((err: unknown) => setGithubAuthStatus(err instanceof Error ? err.message : String(err)));
  });

  githubRomSaveBtn?.addEventListener("click", () => {
    if (!githubToken || !githubRepo) return;
    if (insertedCassette?.fromSample) {
      setGithubAuthStatus(t("github.sampleNoSave"));
      return;
    }
    const bytes = insertedCassette?.bytes ?? lastBuiltRom;
    const name = insertedCassette?.name || cartTitleInput.value.trim() || "game";
    if (!bytes) {
      setGithubAuthStatus(t("github.nothingToSave"));
      return;
    }
    setGithubAuthStatus(t("github.savingRom"));
    saveCloudRom(githubToken, githubRepo.owner, githubRepo.repo, name, bytes)
      .then(() => refreshCloudLists())
      .then(() => setGithubAuthStatus(t("github.romSaved", { name })))
      .catch((err: unknown) => setGithubAuthStatus(err instanceof Error ? err.message : String(err)));
  });

  githubProjectLoadBtn?.addEventListener("click", () => {
    const path = githubProjectSelect?.value;
    if (!path || !githubToken || !githubRepo) return;
    setGithubAuthStatus(t("github.fetchingProject"));
    loadCloudFileText(githubToken, githubRepo.owner, githubRepo.repo, path)
      .then((text) => {
        project = parseProject(text);
        currentPartIndex = -1;
        currentSceneIndex = -1;
        if (project.title) cartTitleInput.value = project.title;
        if (project.author) cartAuthorInput.value = project.author;
        refreshPartSelect();
        refreshSceneSelect();
        if (project.parts.length > 0) selectPart(0);
        if (project.scenes.length > 0) selectScene(0);
        refreshSoundList();
        buildAndRun();
        setGithubAuthStatus(t("github.projectOpened"));
      })
      .catch((err: unknown) => setGithubAuthStatus(err instanceof Error ? err.message : String(err)));
  });

  githubProjectSaveBtn?.addEventListener("click", () => {
    if (!githubToken || !githubRepo) return;
    syncCurrentPartFromEditors();
    syncCurrentSceneFromEditors();
    project.title = cartTitleInput.value;
    project.author = cartAuthorInput.value;
    const name = project.title.trim() || "project";
    setGithubAuthStatus(t("github.savingProject"));
    saveCloudProject(githubToken, githubRepo.owner, githubRepo.repo, name, serializeProject(project))
      .then(() => refreshCloudLists())
      .then(() => setGithubAuthStatus(t("github.projectSaved", { name })))
      .catch((err: unknown) => setGithubAuthStatus(err instanceof Error ? err.message : String(err)));
  });
}

// --- スクリーンショット / 録画 ---
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

screenshotBtn?.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) {
      statusEl!.textContent = t("status.screenshotFail");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadBlob(blob, `famijs-${stamp}.png`);
    statusEl!.textContent = t("status.screenshotOk");
  }, "image/png");
});

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

function pickRecorderMime(): string | undefined {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

function stopRecording(): void {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  mediaRecorder.stop();
}

recordBtn?.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    stopRecording();
    return;
  }
  if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
    statusEl!.textContent = t("status.recordUnsupported");
    return;
  }
  const mime = pickRecorderMime();
  const stream = canvas.captureStream(60);
  try {
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch {
    statusEl!.textContent = t("status.recordStartFail");
    return;
  }
  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "video/webm" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadBlob(blob, `famijs-${stamp}.webm`);
    recordedChunks = [];
    mediaRecorder = null;
    recordBtn?.classList.remove("recording");
    if (recordBtn) recordBtn.textContent = "⏺";
    statusEl!.textContent = t("status.recordSaved");
    for (const track of stream.getTracks()) track.stop();
  };
  mediaRecorder.start(250);
  recordBtn.classList.add("recording");
  recordBtn.textContent = "⏹";
  statusEl!.textContent = t("status.recording");
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
  latestChannelSnapshots.forEach((s, i) => {
    const el = meterEls[i];
    if (!el) return;
    el.fill.style.width = `${s.enabled ? (s.volume / 15) * 100 : 0}%`;
    el.freq.textContent = s.enabled ? `${Math.round(s.frequencyHz)}Hz` : "-";
  });
}

// Workerから届いた最新のフレームバッファをベストエフォートで描画するだけ。
// Worker側の実際の描画/音声ペースとは無関係で、初回フレーム到着前は何も描かない。
let gamepadPrev: GamepadButtonState = {
  a: false,
  b: false,
  start: false,
  select: false,
  dir: { up: false, down: false, left: false, right: false },
};
const gamepadStatusEl = document.querySelector<HTMLParagraphElement>("#gamepad-status");

function frame(): void {
  if (latestFramebuffer) {
    imageData.data.set(latestFramebuffer);
    ctx!.putImageData(imageData, 0, 0);
  }
  updateChannelMeters();

  const gp = pollGamepad(gamepadPrev, setLocalButton);
  gamepadPrev = gp.state;
  if (gamepadStatusEl) {
    gamepadStatusEl.textContent = gp.connected
      ? t("controls.gamepadConnected", { id: gp.id ?? "unknown" })
      : t("controls.gamepadDisconnected");
  }

  requestAnimationFrame(frame);
}
// requestAnimationFrame は setLocalButton 定義後に開始する（下参照）

// --- 音源タブ: 試聴 + 名前付きサウンドアセットの保存 ---
const toneChannelSelect = document.querySelector<HTMLSelectElement>("#tone-channel");
const toneNoteSelect = document.querySelector<HTMLSelectElement>("#tone-note");
const toneDurationInput = document.querySelector<HTMLInputElement>("#tone-duration");
const tonePlayBtn = document.querySelector<HTMLButtonElement>("#tone-play-btn");
const soundNameInput = document.querySelector<HTMLInputElement>("#sound-name-input");
const soundSaveBtn = document.querySelector<HTMLButtonElement>("#sound-save-btn");
const soundSaveStatus = document.querySelector<HTMLSpanElement>("#sound-save-status");
const soundListEl = document.querySelector<HTMLUListElement>("#sound-list");

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

function refreshSoundList(): void {
  if (!soundListEl) return;
  soundListEl.innerHTML = "";
  project.sounds.forEach((sound, i) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${sound.name} (ch${sound.channel}, note${sound.note}, ${sound.duration}f)`;
    li.appendChild(label);

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "編集/試聴";
    loadBtn.addEventListener("click", () => {
      if (toneChannelSelect) toneChannelSelect.value = String(sound.channel);
      refreshToneNoteOptions();
      if (toneNoteSelect) toneNoteSelect.value = String(sound.note);
      if (toneDurationInput) toneDurationInput.value = String(sound.duration);
      if (soundNameInput) soundNameInput.value = sound.name;
    });
    li.appendChild(loadBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      project.sounds.splice(i, 1);
      refreshSoundList();
    });
    li.appendChild(deleteBtn);

    soundListEl.appendChild(li);
  });
}
refreshSoundList();

if (toneChannelSelect && toneNoteSelect && tonePlayBtn) {
  refreshToneNoteOptions();
  toneChannelSelect.addEventListener("change", refreshToneNoteOptions);
  tonePlayBtn.addEventListener("click", () => {
    startAudioOnce();
    const channel = Number(toneChannelSelect.value) as 0 | 1 | 2 | 3;
    const noteIndex = Number(toneNoteSelect.value);
    const duration = Number(toneDurationInput?.value) || 20;
    audio.previewTone(channel, noteIndex, duration);
  });
}

soundSaveBtn?.addEventListener("click", () => {
  if (!toneChannelSelect || !toneNoteSelect || !soundNameInput || !soundSaveStatus) return;
  const name = soundNameInput.value.trim();
  if (!VALID_NAME_RE.test(name)) {
    soundSaveStatus.textContent = "名前は英字/アンダースコアで始まる英数字にしてください";
    return;
  }
  const channel = Number(toneChannelSelect.value) as 0 | 1 | 2 | 3;
  const note = Number(toneNoteSelect.value);
  const duration = Number(toneDurationInput?.value) || 20;
  const existingIndex = project.sounds.findIndex((s) => s.name === name);
  if (existingIndex >= 0) {
    project.sounds[existingIndex] = { name, channel, note, duration };
  } else {
    project.sounds.push({ name, channel, note, duration });
  }
  refreshSoundList();
  soundSaveStatus.textContent = `「${name}」を保存しました。コードから playSound(${name}) で呼び出せます`;
});

// --- 入力（キーボード/仮想パッド共通）。
//     streamゲスト: ホストへボタン送信 / lockstep: ローカル生入力をセッションへ ---
let netplayGuestActive = false;
let lockstepHostActive = false;
let lockstepGuestActive = false;
let guestButtons = 0;

function setLocalButton(name: ButtonName, pressed: boolean): void {
  const bit = BUTTON[name];
  if (netplayGuestActive || lockstepGuestActive || lockstepHostActive) {
    if (pressed) guestButtons |= 1 << bit;
    else guestButtons &= ~(1 << bit);
    if (netplayGuestActive) netplayGuest.sendButtons(guestButtons);
    if (lockstepHostActive) lockstepHost.setLocalButtons(guestButtons);
    if (lockstepGuestActive) lockstepGuest.setLocalButtons(guestButtons);
    if (lockstepHostActive || lockstepGuestActive) return;
    if (netplayGuestActive) return;
  }
  nesWorker.postMessage({ type: "button", controller: 1, bit, pressed });
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

// --- 仮想パッド: 8方向スティック + SELECT/START/A/B ---
const stickRoot = document.querySelector<HTMLElement>("#virtual-stick");
const stickKnob = document.querySelector<HTMLElement>("#virtual-stick-knob");
const EMPTY_DIR: DirState = { up: false, down: false, left: false, right: false };
let stickDir: DirState = { ...EMPTY_DIR };
let dpadDir: DirState = { ...EMPTY_DIR };
let combinedDir: DirState = { ...EMPTY_DIR };

function syncVirtualDirs(): void {
  const next: DirState = {
    up: stickDir.up || dpadDir.up,
    down: stickDir.down || dpadDir.down,
    left: stickDir.left || dpadDir.left,
    right: stickDir.right || dpadDir.right,
  };
  applyDirDiff(combinedDir, next, setLocalButton);
  combinedDir = next;
}

if (stickRoot && stickKnob) {
  // 十字の中央に収めるミニスティック（移動量も小さめ）
  bindVirtualStick(
    stickRoot,
    stickKnob,
    (next) => {
      stickDir = next;
      syncVirtualDirs();
    },
    14,
  );
}

const dpadButtons = document.querySelectorAll<HTMLButtonElement>("#virtual-dpad button[data-dir]");
dpadButtons.forEach((el) => {
  const dir = el.dataset.dir;
  if (dir !== "UP" && dir !== "DOWN" && dir !== "LEFT" && dir !== "RIGHT") return;
  const key = dir.toLowerCase() as keyof DirState;

  const setPressed = (pressed: boolean) => (ev: Event) => {
    ev.preventDefault();
    if (dpadDir[key] === pressed) return;
    dpadDir = { ...dpadDir, [key]: pressed };
    syncVirtualDirs();
  };

  el.addEventListener("pointerdown", setPressed(true));
  el.addEventListener("pointerup", setPressed(false));
  el.addEventListener("pointerleave", setPressed(false));
  el.addEventListener("pointercancel", setPressed(false));
});

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

const padWrap = document.querySelector<HTMLDivElement>(".pad-wrap");
const padToggleBtn = document.querySelector<HTMLButtonElement>("#pad-toggle-btn");

/** 全画面プレイ時、ツールバー/ステータス/パッド分を差し引いて画面を最大化する */
function updatePlayChromeHeight(): void {
  const app = document.querySelector<HTMLDivElement>(".app");
  if (!app || !padWrap) return;
  if (!app.classList.contains("play-mode")) {
    app.style.removeProperty("--play-chrome-h");
    return;
  }
  const toolbar = document.querySelector<HTMLElement>(".screen-toolbar");
  const status = document.querySelector<HTMLElement>("#status");
  const pane = document.querySelector<HTMLElement>(".screen-pane");
  const gap = pane ? Number.parseFloat(getComputedStyle(pane).gap) || 12 : 12;
  const chrome =
    (toolbar?.offsetHeight ?? 0) +
    (status?.offsetHeight ?? 0) +
    padWrap.offsetHeight +
    gap * 3 +
    24;
  app.style.setProperty("--play-chrome-h", `${Math.ceil(chrome)}px`);
}

function setPadCollapsed(collapsed: boolean): void {
  if (!padWrap || !padToggleBtn) return;
  padWrap.classList.toggle("pad-collapsed", collapsed);
  padToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  padToggleBtn.textContent = collapsed ? t("pad.toggleOpen") : t("pad.toggleClose");
  requestAnimationFrame(() => updatePlayChromeHeight());
}

padToggleBtn?.addEventListener("click", () => {
  setPadCollapsed(!padWrap?.classList.contains("pad-collapsed"));
});

window.addEventListener("resize", () => {
  if (document.querySelector(".app.play-mode")) updatePlayChromeHeight();
});

// --- Play / Create モード切替 + Create 内サブタブ ---
const modeButtons = document.querySelectorAll<HTMLButtonElement>(".mode-tabs button[data-mode]");
const modePanels = document.querySelectorAll<HTMLDivElement>(".mode-panel[data-mode-panel]");

function setMode(mode: "play" | "create"): void {
  modeButtons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
  modePanels.forEach((p) => {
    const active = p.dataset.modePanel === mode;
    p.classList.toggle("active", active);
    p.hidden = !active;
  });
  document.querySelector(".app")?.classList.toggle("create-mode-active", mode === "create");
  if (mode === "create") {
    requestAnimationFrame(() => createExplorerHandle?.resizeBlocks());
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
    const mode = btn.dataset.mode;
    if (mode === "play" || mode === "create") setMode(mode);
  });
});

const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tabs button[data-tab]");
const panels = document.querySelectorAll<HTMLDivElement>(".panel[data-panel]");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
    if (target === "parts" && partBlockWorkspace) Blockly.svgResize(partBlockWorkspace);
    if (target === "scenes" && sceneBlockWorkspace) Blockly.svgResize(sceneBlockWorkspace);
  });
});

requestAnimationFrame(frame);

// --- プレイモード（PC向け全画面プレイ。エディタ部分を隠して画面プレビューだけ表示する） ---
const appEl = document.querySelector<HTMLDivElement>(".app");
const playModeBtn = document.querySelector<HTMLButtonElement>("#play-mode-btn");
const exitPlayModeBtn = document.querySelector<HTMLButtonElement>("#exit-play-mode-btn");

function setPlayMode(enabled: boolean): void {
  appEl?.classList.toggle("play-mode", enabled);
  if (exitPlayModeBtn) exitPlayModeBtn.hidden = !enabled;
  // レイアウト確定後にクロム高さを測る
  requestAnimationFrame(() => updatePlayChromeHeight());
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

// --- オンライン対戦（WebRTC） ---
const netplayHost = new NetplayHost();
const netplayGuest = new NetplayGuest();
const lockstepHost = new LockstepHost();
const lockstepGuest = new LockstepGuest();

const netplayOpenBtn = document.querySelector<HTMLButtonElement>("#netplay-open-btn");
const netplayDialog = document.querySelector<HTMLDialogElement>("#netplay-dialog");
const netplayDialogClose = document.querySelector<HTMLButtonElement>("#netplay-dialog-close");
const netplayBadge = document.querySelector<HTMLSpanElement>("#netplay-badge");
const netplayRolePicker = document.querySelector<HTMLDivElement>("#netplay-role-picker");
const netplayRoleBack = document.querySelector<HTMLButtonElement>("#netplay-role-back");
const netplayHostPanel = document.querySelector<HTMLElement>('[data-netplay-panel="host"]');
const netplayGuestPanel = document.querySelector<HTMLElement>('[data-netplay-panel="guest"]');

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

function setNetplayBadge(text: string, active = false): void {
  if (!netplayBadge) return;
  const idle = !text || text === t("netplay.badgeDisconnected");
  netplayBadge.hidden = idle && !active;
  if (!idle || active) {
    netplayBadge.hidden = false;
    netplayBadge.textContent = text || t("netplay.badgeConnected");
  }
  netplayBadge.dataset.active = active ? "true" : "false";
}

function setNetplayRole(role: "host" | "guest" | null): void {
  if (netplayRolePicker) netplayRolePicker.hidden = role !== null;
  if (netplayRoleBack) netplayRoleBack.hidden = role === null;
  if (netplayHostPanel) netplayHostPanel.hidden = role !== "host";
  if (netplayGuestPanel) netplayGuestPanel.hidden = role !== "guest";
}

function syncNetplayBadgeFromStatuses(): void {
  const hostText = netplayHostStatusEl?.textContent?.trim() ?? "";
  const guestText = netplayGuestStatusEl?.textContent?.trim() ?? "";
  const connected =
    /connected|接続済|対戦中|running|in match|rom synced|lockstep running|ROM 同期完了|ロックステップ運転中/i.test(
      hostText,
    ) ||
    /connected|接続済|対戦中|running|in match|rom synced|lockstep running|ROM 同期完了|ロックステップ運転中/i.test(
      guestText,
    );
  const busy =
    netplayGuestActive ||
    lockstepGuestActive ||
    lockstepHostActive ||
    /生成中|接続中|発行|転送|待機|generating|connecting|invite|transfer|waiting/i.test(hostText) ||
    /生成中|接続中|発行|転送|待機|generating|connecting|invite|transfer|waiting/i.test(guestText);
  if (connected) {
    setNetplayBadge(t("netplay.badgePlaying"), true);
  } else if (busy) {
    const msg = hostText !== t("netplay.badgeDisconnected") && hostText ? hostText : guestText;
    setNetplayBadge(msg.length > 24 ? `${msg.slice(0, 24)}…` : msg, false);
  } else {
    setNetplayBadge(t("netplay.badgeDisconnected"), false);
  }
}

const setNetplayHostStatus = (text: string) => {
  if (netplayHostStatusEl) netplayHostStatusEl.textContent = text;
  syncNetplayBadgeFromStatuses();
};
const setNetplayGuestStatus = (text: string) => {
  if (netplayGuestStatusEl) netplayGuestStatusEl.textContent = text;
  syncNetplayBadgeFromStatuses();
};

netplayOpenBtn?.addEventListener("click", () => {
  netplayDialog?.showModal();
});
netplayDialogClose?.addEventListener("click", () => {
  netplayDialog?.close();
});
netplayDialog?.addEventListener("click", (e) => {
  if (e.target === netplayDialog) netplayDialog.close();
});

document.querySelectorAll<HTMLButtonElement>("[data-netplay-role]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const role = btn.dataset.netplayRole === "guest" ? "guest" : "host";
    setNetplayRole(role);
  });
});
netplayRoleBack?.addEventListener("click", () => {
  setNetplayRole(null);
});
setNetplayRole(null);

function selectedNetplayMode(): "stream" | "lockstep" {
  const checked = document.querySelector<HTMLInputElement>('input[name="netplay-mode"]:checked');
  return checked?.value === "lockstep" ? "lockstep" : "stream";
}

function applyGuestButtons(byte: number): void {
  for (let bit = 0; bit < 8; bit++) {
    nesWorker.postMessage({ type: "button", controller: 2, bit, pressed: (byte & (1 << bit)) !== 0 });
  }
}

function loadRomForNetplay(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    loadRomResultHandlers.netplay = (ok, message) => {
      delete loadRomResultHandlers.netplay;
      if (ok) resolve();
      else reject(new Error(message ?? t("netplay.romLoadFailed")));
    };
    // コピーを渡して転送後も呼び出し側バッファを残す
    const copy = bytes.slice();
    nesWorker.postMessage({ type: "loadRom", bytes: copy, context: "netplay" }, [copy.buffer]);
  });
}

function enableLockstepWorker(enabled: boolean): void {
  nesWorker.postMessage({ type: "lockstepEnable", enabled });
}

function makeLockstepHooks(setStatus: (message: string) => void) {
  return {
    onStatus: (state: RTCPeerConnectionState) => {
      setStatus(t("netplay.connectionState", { state }));
    },
    onLog: (message: string) => {
      setStatus(message);
    },
    onRom: async (bytes: Uint8Array, name: string) => {
      enableLockstepWorker(true);
      await loadRomForNetplay(bytes);
      lastBuiltRom = bytes;
      setStatus(t("netplay.romLoadedLockstep", { name }));
    },
    onStep: (frame: number, p1: number, p2: number) => {
      nesWorker.postMessage({ type: "stepFrame", p1, p2, frame });
    },
    onDesync: (frame: number, localHash: number, remoteHash: number) => {
      setStatus(t("netplay.desync", { frame, localHash, remoteHash }));
      enableLockstepWorker(false);
      lockstepHostActive = false;
      lockstepGuestActive = false;
    },
  };
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
    const mode = selectedNetplayMode();
    netplayGuestActive = false;
    lockstepGuestActive = false;
    lockstepHost.close();
    netplayHost.close();

    if (mode === "lockstep") {
      const rom = insertedCassette?.bytes ?? lastBuiltRom;
      if (!rom) {
        setNetplayHostStatus(t("netplay.needRom"));
        return;
      }
      lockstepHostActive = true;
      guestButtons = 0;
      lockstepHost.setLocalButtons(0);
      setNetplayHostStatus(t("netplay.hostOfferGeneratingLockstep"));
      lockstepHost
        .start(rom, insertedCassette?.name ?? "game.nes", makeLockstepHooks(setNetplayHostStatus))
        .then((offerCode) => {
          netplayHostOfferEl.value = offerCode;
          setNetplayHostStatus(t("netplay.hostOfferReadyLockstep"));
        })
        .catch((err: unknown) => {
          lockstepHostActive = false;
          enableLockstepWorker(false);
          setNetplayHostStatus(err instanceof Error ? err.message : String(err));
        });
      return;
    }

    lockstepHostActive = false;
    enableLockstepWorker(false);
    setNetplayHostStatus(t("netplay.hostOfferGenerating"));
    netplayHost
      .start(
        canvas,
        (buttons) => applyGuestButtons(buttons),
        (state) => {
          setNetplayHostStatus(t("netplay.connectionState", { state }));
        },
      )
      .then((offerCode) => {
        netplayHostOfferEl.value = offerCode;
        setNetplayHostStatus(t("netplay.hostOfferReady"));
      })
      .catch((err: unknown) => {
        setNetplayHostStatus(err instanceof Error ? err.message : String(err));
      });
  });

  netplayHostConnectBtn.addEventListener("click", () => {
    const mode = selectedNetplayMode();
    const complete =
      mode === "lockstep"
        ? lockstepHost.completeConnection(netplayHostAnswerEl.value)
        : netplayHost.completeConnection(netplayHostAnswerEl.value);
    complete
      .then(() => {
        setNetplayHostStatus(t("netplay.hostAnswerApplied"));
      })
      .catch((err: unknown) => {
        setNetplayHostStatus(err instanceof Error ? err.message : String(err));
      });
  });

  netplayGuestJoinBtn.addEventListener("click", () => {
    const mode = selectedNetplayMode();
    netplayGuestActive = false;
    lockstepHostActive = false;
    lockstepGuest.close();
    netplayGuest.close();

    if (mode === "lockstep") {
      lockstepGuestActive = true;
      guestButtons = 0;
      lockstepGuest.setLocalButtons(0);
      setNetplayGuestStatus(t("netplay.guestAnswerGeneratingLockstep"));
      lockstepGuest
        .join(netplayGuestOfferEl.value, makeLockstepHooks(setNetplayGuestStatus))
        .then((answerCode) => {
          netplayGuestAnswerEl.value = answerCode;
          setNetplayGuestStatus(t("netplay.guestAnswerReadyLockstep"));
        })
        .catch((err: unknown) => {
          lockstepGuestActive = false;
          enableLockstepWorker(false);
          setNetplayGuestStatus(err instanceof Error ? err.message : String(err));
        });
      return;
    }

    lockstepGuestActive = false;
    enableLockstepWorker(false);
    setNetplayGuestStatus(t("netplay.guestAnswerGenerating"));
    netplayGuest
      .join(
        netplayGuestOfferEl.value,
        netplayGuestVideoEl,
        (state) => {
          setNetplayGuestStatus(t("netplay.connectionState", { state }));
        },
      )
      .then((answerCode) => {
        netplayGuestAnswerEl.value = answerCode;
        setNetplayGuestStatus(t("netplay.guestAnswerReady"));
        netplayGuestActive = true;
      })
      .catch((err: unknown) => {
        setNetplayGuestStatus(err instanceof Error ? err.message : String(err));
      });
  });
}
