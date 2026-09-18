import { BUTTON, buildSmokeRom, type ButtonName, type ChannelSnapshot } from "@js-nes/emulator-core";
import { compile } from "@js-nes/dsl-compiler";
import { downloadRom } from "@js-nes/rom-builder";
import { getTiles, initSpriteEditor, setTiles } from "./spriteEditor.js";
import { AudioEngine, noteIndexToLabel } from "./audio.js";
import { downloadCanvasAsPng, renderCartridgeLabel } from "./cartridgeLabel.js";
import { exportStandaloneHtml } from "./standaloneExport.js";
import { NetplayGuest, NetplayHost } from "./netplay.js";
import NesWorkerCtor from "./nesWorker.ts?worker&inline";
import type { LoadRomContext, NesWorkerOutboundMessage } from "./nesWorkerProtocol.js";
import { pollGamepad, type GamepadButtonState } from "./gamepad.js";
import { applyDirDiff, bindVirtualStick, type DirState } from "./virtualStick.js";
import * as Blockly from "blockly/core";
import { generatePartBody, generateSceneBody, initBlockEditor } from "./blocks/blockEditor.js";
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
import { buildProjectAssets, buildProjectSource, ProjectBuildError } from "./projectBuild.js";

const canvas = document.querySelector<HTMLCanvasElement>("#screen");
const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const reloadBtn = document.querySelector<HTMLButtonElement>("#reload-btn");
const buildBtn = document.querySelector<HTMLButtonElement>("#build-btn");
const downloadBtn = document.querySelector<HTMLButtonElement>("#download-btn");
const buildStatus = document.querySelector<HTMLSpanElement>("#build-status");
const buildError = document.querySelector<HTMLPreElement>("#build-error");
const buildSourcePreview = document.querySelector<HTMLTextAreaElement>("#build-source-preview");
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

let audioStarted = false;
function startAudioOnce(): void {
  if (audioStarted) return;
  audioStarted = true;
  audio.resume();
}
window.addEventListener("pointerdown", startAudioOnce, { once: true });
window.addEventListener("keydown", startAudioOnce, { once: true });

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
      break;
    case "loadRomResult":
      loadRomResultHandlers[msg.context]?.(msg.ok, msg.message);
      break;
    case "fatalError":
      statusEl!.textContent = `エミュレーターが異常終了しました: ${msg.message}（ページを再読み込みしてください）`;
      break;
  }
};
nesWorker.onerror = (ev: ErrorEvent) => {
  statusEl!.textContent = `エミュレーターWorkerでエラーが発生しました: ${ev.message}（ページを再読み込みしてください）`;
};

function loadRomInWorker(bytes: Uint8Array, context: LoadRomContext): void {
  nesWorker.postMessage({ type: "loadRom", bytes, context });
}

loadRomResultHandlers.demo = (ok, message) => {
  statusEl!.textContent = ok
    ? "動作確認用ROM（emulator-core単体の疎通確認用）を実行中"
    : `動作確認用ROMの読み込みに失敗しました: ${message}`;
};
function loadDemoRom(): void {
  loadRomInWorker(buildSmokeRom(), "demo");
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- デフォルトプロジェクト（初回起動時のサンプル） ---
// タイル0番＝自機（キー操作）、タイル1番＝もう1体（自動で左右に往復）の2パーツ構成。
// 「パーツにドット絵+振る舞いをセットで持たせ、シーンに配置する」という
// プロジェクト式そのものをサンプルとして示す。
function createDefaultProject(): Project {
  const project = createEmptyProject();
  project.title = "サンプル";
  project.parts.push({
    name: "Player",
    tiles: [new Array(64).fill(0)],
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
    tiles: [new Array(64).fill(0)],
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
  statusEl!.textContent = ok
    ? "「パーツ」「シーン」タブで組み立てたプロジェクトをコンパイルして実行中"
    : `プロジェクトの実行に失敗しました: ${message}`;
};

function buildAndRun(): void {
  syncCurrentPartFromEditors();
  syncCurrentSceneFromEditors();

  buildError!.hidden = true;
  buildError!.textContent = "";
  try {
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

    // ビルド成功のたびにプロジェクト（パーツ/シーン/サウンド）をlocalStorageへ自動保存する。
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
  if (!ok) statusEl!.textContent = `配布用HTMLに同梱されたROMの実行に失敗しました: ${message}`;
};

if (embeddedRomB64) {
  const rom = fromBase64(embeddedRomB64);
  loadRomInWorker(rom, "embedded");
  lastBuiltRom = rom;
  downloadBtn.disabled = false;
  standaloneExportBtn.disabled = false;
  statusEl.textContent = "配布用HTMLに同梱されたROMを実行中";
} else {
  const savedProject = loadProjectFromLocalStorage();
  if (savedProject) project = savedProject;
  if (project.title) cartTitleInput.value = project.title;
  if (project.author) cartAuthorInput.value = project.author;
}
refreshPartSelect();
refreshSceneSelect();
if (project.parts.length > 0) selectPart(0);
if (project.scenes.length > 0) selectScene(0);
if (!embeddedRomB64) {
  if (project.parts.length > 0 || project.scenes.length > 0) {
    buildAndRun();
  } else {
    loadDemoRom();
  }
}
reloadBtn.addEventListener("click", loadDemoRom);

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
const controlsHelpBtn = document.querySelector<HTMLButtonElement>("#controls-help-btn");
const controlsHelpDialog = document.querySelector<HTMLDialogElement>("#controls-help-dialog");

/** Play用に刺さっているカセット（外部ROM）。null のときはスモークROM扱い。 */
let insertedCassette: { name: string; bytes: Uint8Array } | null = null;

function setCassetteUi(inserted: { name: string } | null, status = ""): void {
  if (cassetteBody) cassetteBody.dataset.inserted = inserted ? "true" : "false";
  if (cassetteTitle) cassetteTitle.textContent = inserted ? inserted.name : "カセットなし";
  if (cassetteSub) {
    cassetteSub.textContent = inserted ? "スロットにカセットが刺さっています" : "スロットは空いています";
  }
  if (cassetteEjectBtn) cassetteEjectBtn.disabled = !inserted;
  if (romUploadStatus) romUploadStatus.textContent = status;
}

function insertCassette(name: string, bytes: Uint8Array): void {
  insertedCassette = { name, bytes };
  loadRomResultHandlers.upload = (ok, message) => {
    if (ok) {
      lastBuiltRom = bytes;
      downloadBtn!.disabled = false;
      standaloneExportBtn!.disabled = false;
      statusEl!.textContent = `カセット「${name}」を実行中`;
      setCassetteUi({ name }, "カセットを刺しました");
    } else {
      insertedCassette = null;
      setCassetteUi(null, `刺せませんでした: ${message}`);
    }
  };
  loadRomInWorker(bytes, "upload");
}

function ejectCassette(): void {
  insertedCassette = null;
  setCassetteUi(null, "カセットを抜きました");
  loadDemoRom();
  statusEl!.textContent = "カセットを抜きました（動作確認用ROM）";
}

function resetConsole(): void {
  if (insertedCassette) {
    loadRomInWorker(insertedCassette.bytes, "upload");
    statusEl!.textContent = `リセット: 「${insertedCassette.name}」`;
    setCassetteUi({ name: insertedCassette.name }, "リセットしました");
    return;
  }
  loadDemoRom();
  setCassetteUi(null, "リセットしました");
}

controlsHelpBtn?.addEventListener("click", () => {
  controlsHelpDialog?.showModal();
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
  file
    .arrayBuffer()
    .then((buf) => {
      insertCassette(file.name.replace(/\.nes$/i, "") || file.name, new Uint8Array(buf));
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setCassetteUi(insertedCassette ? { name: insertedCassette.name } : null, `読み込み失敗: ${message}`);
    })
    .finally(() => {
      romUploadInput.value = "";
    });
});

setCassetteUi(null);

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
      ? `ゲームパッド: 接続中（${gp.id ?? "unknown"}）`
      : "ゲームパッド: 未接続（ボタンを押すと検出されます）";
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
  nesWorker.postMessage({ type: "button", controller: 1, bit: BUTTON[name], pressed });
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
let stickDir: DirState = { up: false, down: false, left: false, right: false };
if (stickRoot && stickKnob) {
  bindVirtualStick(stickRoot, stickKnob, (next) => {
    applyDirDiff(stickDir, next, setLocalButton);
    stickDir = next;
  });
}

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
  if (mode === "create") {
    const selected = document.querySelector<HTMLButtonElement>('.tabs button[data-tab][aria-selected="true"]');
    const target = selected?.dataset.tab;
    if (target === "parts" && partBlockWorkspace) Blockly.svgResize(partBlockWorkspace);
    if (target === "scenes" && sceneBlockWorkspace) Blockly.svgResize(sceneBlockWorkspace);
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
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
    nesWorker.postMessage({ type: "button", controller: 2, bit, pressed: (byte & (1 << bit)) !== 0 });
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
