/**
 * Create v3 エクスプローラ。
 * ツリーで資産を辿り、パレット／ビットマップ／キャラ・シーンのブロックを編集する。
 */

import * as Blockly from "blockly/core";
import {
  CREATE_MAPPER_IDS,
  createEmptyBitmap,
  createEmptyProjectV3,
  findOrCreatePalette,
  newAssetId,
  parseProjectAnyToV3,
  serializeProjectV3,
  type CreateMapperId,
  type ProjectV3,
  type ScenePlacement,
} from "./projectV3.js";
import { mountBitmapEditor, type BitmapEditorHandle } from "./bitmapEditorV3.js";
import { nesIndexToCss } from "./bitmapRaster.js";
import { DEFAULT_BITMAP_TILES } from "./bitmapSizePresets.js";
import {
  PROVIDED_ASSET_PACKS,
  countImportedFontGlyphs,
  importFontJpBasicIntoProject,
} from "./providedAssets.js";
import { bitmapsForRomBuild, collectUsedAssetIds } from "./collectUsedAssets.js";
import {
  generatePartBody,
  generateSceneBody,
  initBlockEditor,
  isEmptyBlockState,
  loadDefaultMainSceneBlocks,
  loadDefaultMoverPartBlocks,
  loadDefaultPlayerPartBlocks,
} from "./blocks/blockEditor.js";
import { partToolboxForMapper, sceneToolboxForMapper } from "./blocks/toolbox.js";
import { listMapperCapabilities, MAPPER_CAPABILITIES } from "./mapperCapabilities.js";

export type ExplorerSelection =
  | { kind: "project" }
  | { kind: "wizard" }
  | { kind: "folder"; folder: "palettes" | "bitmaps" | "characters" | "sounds" | "scenes" }
  | { kind: "palette"; id: string }
  | { kind: "bitmap"; id: string }
  | { kind: "character"; id: string }
  | { kind: "sound"; id: string }
  | { kind: "scene"; id: string };

export type CreateExplorerHandle = {
  getProject: () => ProjectV3;
  setProject: (project: ProjectV3) => void;
  refresh: () => void;
  /** 編集中 Blockly を資産へ書き戻す（ビルド前に呼ぶ） */
  flush: () => void;
  resizeBlocks: () => void;
  /** ツリー選択を変更（例: サンプルの Player を開く） */
  selectCharacter: (id: string) => void;
  selectScene: (id: string) => void;
};

export type CreateExplorerOptions = {
  onBuild?: () => void;
};

export function mountCreateExplorer(
  root: HTMLElement,
  initial: ProjectV3,
  onChange: (project: ProjectV3) => void,
  options: CreateExplorerOptions = {},
): CreateExplorerHandle {
  let project = initial;
  let selection: ExplorerSelection = { kind: "project" };
  let bitmapEditor: BitmapEditorHandle | null = null;
  let blockWorkspace: Blockly.WorkspaceSvg | null = null;
  let blockTarget: { kind: "character" | "scene"; id: string } | null = null;

  root.innerHTML = `
    <div class="create-explorer">
      <aside class="create-explorer-tree" aria-label="プロジェクトツリー">
        <div class="create-explorer-tree-head">エクスプローラ</div>
        <ul class="create-tree" id="create-tree-root"></ul>
        <div class="create-explorer-actions">
          <button type="button" id="create-v3-new-btn" class="secondary">新規プロジェクト…</button>
        </div>
      </aside>
      <section class="create-explorer-editor" id="create-explorer-editor">
        <p class="muted">左のツリーから項目を選んでください。</p>
      </section>
    </div>
  `;

  const treeRoot = root.querySelector<HTMLUListElement>("#create-tree-root")!;
  const editor = root.querySelector<HTMLElement>("#create-explorer-editor")!;
  const newBtn = root.querySelector<HTMLButtonElement>("#create-v3-new-btn")!;

  function persist(): void {
    onChange(project);
  }

  function commit(): void {
    persist();
    renderTree();
    renderEditor();
  }

  function softCommit(): void {
    persist();
    renderTree();
  }

  function destroyBitmapEditor(): void {
    bitmapEditor?.destroy();
    bitmapEditor = null;
  }

  function flushBlocks(): void {
    if (!blockWorkspace || !blockTarget) return;
    if (blockTarget.kind === "character") {
      const ch = project.characters[blockTarget.id];
      if (!ch) return;
      ch.behaviorBlocks = Blockly.serialization.workspaces.save(blockWorkspace);
      ch.legacyCode = generatePartBody(blockWorkspace);
    } else {
      const sc = project.scenes[blockTarget.id];
      if (!sc) return;
      sc.logicBlocks = Blockly.serialization.workspaces.save(blockWorkspace);
      sc.legacyCode = generateSceneBody(blockWorkspace);
    }
  }

  function destroyBlockEditor(): void {
    flushBlocks();
    if (blockWorkspace) {
      blockWorkspace.dispose();
      blockWorkspace = null;
    }
    blockTarget = null;
  }

  function mountPartBlocks(host: HTMLElement, characterId: string): void {
    destroyBlockEditor();
    const ch = project.characters[characterId];
    if (!ch) return;
    const workspace = initBlockEditor(host, partToolboxForMapper(project.mapperId));
    blockWorkspace = workspace;
    blockTarget = { kind: "character", id: characterId };

    if (!isEmptyBlockState(ch.behaviorBlocks)) {
      Blockly.serialization.workspaces.load(ch.behaviorBlocks as never, workspace);
    } else if (ch.name === "Player") {
      loadDefaultPlayerPartBlocks(workspace);
      ch.behaviorBlocks = Blockly.serialization.workspaces.save(workspace);
      ch.legacyCode = generatePartBody(workspace);
      softCommit();
    } else if (ch.name === "Mover") {
      loadDefaultMoverPartBlocks(workspace);
      ch.behaviorBlocks = Blockly.serialization.workspaces.save(workspace);
      ch.legacyCode = generatePartBody(workspace);
      softCommit();
    }

    workspace.addChangeListener((ev) => {
      if (ev.isUiEvent) return;
      flushBlocks();
      softCommit();
    });
    requestAnimationFrame(() => {
      if (blockWorkspace) Blockly.svgResize(blockWorkspace);
    });
  }

  function mountSceneBlocks(host: HTMLElement, sceneId: string): void {
    destroyBlockEditor();
    const sc = project.scenes[sceneId];
    if (!sc) return;
    const workspace = initBlockEditor(host, sceneToolboxForMapper(project.mapperId));
    blockWorkspace = workspace;
    blockTarget = { kind: "scene", id: sceneId };

    if (!isEmptyBlockState(sc.logicBlocks)) {
      Blockly.serialization.workspaces.load(sc.logicBlocks as never, workspace);
    } else if (sc.name === "Main") {
      loadDefaultMainSceneBlocks(workspace);
      sc.logicBlocks = Blockly.serialization.workspaces.save(workspace);
      sc.legacyCode = generateSceneBody(workspace);
      softCommit();
    }

    workspace.addChangeListener((ev) => {
      if (ev.isUiEvent) return;
      flushBlocks();
      softCommit();
    });
    requestAnimationFrame(() => {
      if (blockWorkspace) Blockly.svgResize(blockWorkspace);
    });
  }

  function renderTree(): void {
    const rows: string[] = [];
    const sel = (active: boolean) => (active ? ' aria-current="true"' : "");

    const isProject = selection.kind === "project";
    rows.push(
      `<li><button type="button" class="create-tree-item${isProject ? " active" : ""}" data-sel="project"${sel(isProject)}>📦 ${escapeHtml(project.title || "（無題）")}</button></li>`,
    );

    type FolderKey = "palettes" | "bitmaps" | "characters" | "sounds" | "scenes";
    const folderDefs: { key: FolderKey; label: string; order: string[]; nameOf: (id: string) => string }[] = [
      { key: "palettes", label: "パレット", order: project.paletteOrder, nameOf: (id) => project.palettes[id]?.name ?? id },
      { key: "bitmaps", label: "ビットマップ", order: project.bitmapOrder, nameOf: (id) => project.bitmaps[id]?.name ?? id },
      {
        key: "characters",
        label: "キャラクター",
        order: project.characterOrder,
        nameOf: (id) => project.characters[id]?.name ?? id,
      },
      { key: "sounds", label: "音", order: project.soundOrder, nameOf: (id) => project.sounds[id]?.name ?? id },
      { key: "scenes", label: "シーン", order: project.sceneOrder, nameOf: (id) => project.scenes[id]?.name ?? id },
    ];

    for (const folder of folderDefs) {
      const folderSel = selection.kind === "folder" && selection.folder === folder.key;
      rows.push(
        `<li><button type="button" class="create-tree-item create-tree-folder${folderSel ? " active" : ""}" data-sel="folder:${folder.key}"${sel(folderSel)}>📁 ${folder.label}</button>`,
      );
      rows.push("<ul>");
      for (const id of folder.order) {
        const kind =
          folder.key === "palettes"
            ? "palette"
            : folder.key === "bitmaps"
              ? "bitmap"
              : folder.key === "characters"
                ? "character"
                : folder.key === "sounds"
                  ? "sound"
                  : "scene";
        const active = selection.kind === kind && "id" in selection && selection.id === id;
        rows.push(
          `<li><button type="button" class="create-tree-item${active ? " active" : ""}" data-sel="${kind}:${id}"${sel(active)}>　📄 ${escapeHtml(folder.nameOf(id))}</button></li>`,
        );
      }
      rows.push("</ul></li>");
    }

    treeRoot.innerHTML = rows.join("");
    treeRoot.querySelectorAll<HTMLButtonElement>("[data-sel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selection = parseSel(btn.dataset.sel ?? "project");
        renderTree();
        renderEditor();
      });
    });
  }

  function renderEditor(): void {
    destroyBitmapEditor();
    destroyBlockEditor();

    if (selection.kind === "wizard") {
      const caps = listMapperCapabilities();
      editor.innerHTML = `
        <h2>新規プロジェクト</h2>
        <p class="muted">最初にマッパーを選びます。命令セットは当面共通で、容量とビルド可否が変わります。</p>
        <label class="create-field">タイトル
          <input type="text" id="wiz-title" value="新規プロジェクト" />
        </label>
        <fieldset class="mapper-wizard">
          <legend>マッパー</legend>
          ${caps
            .map(
              (c) => `
            <label class="mapper-card${c.buildSupported ? " mapper-card--ready" : ""}">
              <input type="radio" name="wiz-mapper" value="${c.id}"${c.id === 0 ? " checked" : ""} />
              <span class="mapper-card-body">
                <strong>${c.id} — ${escapeHtml(c.name)}</strong>
                <span class="muted">${escapeHtml(c.summary)}</span>
                <span class="muted">PRG ${escapeHtml(c.prgHint)} / CHR ${escapeHtml(c.chrHint)}</span>
                <span class="muted">${escapeHtml(c.blockNote)}</span>
                <span class="mapper-badge">${c.buildSupported ? "ビルド可" : "ビルド準備中（再生用に選択可）"}</span>
              </span>
            </label>`,
            )
            .join("")}
        </fieldset>
        <div class="create-wizard-actions">
          <button type="button" id="wiz-create">このマッパーで作成</button>
          <button type="button" id="wiz-cancel" class="secondary">キャンセル</button>
        </div>
      `;
      editor.querySelector("#wiz-create")!.addEventListener("click", () => {
        const title = editor.querySelector<HTMLInputElement>("#wiz-title")!.value.trim() || "新規プロジェクト";
        const checked = editor.querySelector<HTMLInputElement>('input[name="wiz-mapper"]:checked');
        const mapperId = Number(checked?.value ?? 0) as CreateMapperId;
        project = createEmptyProjectV3(mapperId);
        project.title = title;
        selection = { kind: "project" };
        commit();
      });
      editor.querySelector("#wiz-cancel")!.addEventListener("click", () => {
        selection = { kind: "project" };
        renderTree();
        renderEditor();
      });
      return;
    }

    if (selection.kind === "project") {
      const fontCount = countImportedFontGlyphs(project);
      const used = collectUsedAssetIds(project);
      const buildBmps = bitmapsForRomBuild(project);
      const cap = MAPPER_CAPABILITIES[project.mapperId];
      editor.innerHTML = `
        <h2>プロジェクト</h2>
        <p class="muted">マッパーがプロジェクトの根です。使える標準ブロックは共通で、容量・バンク可否がマッパーごとに変わります。</p>
        <label class="create-field">タイトル
          <input type="text" id="v3-title" value="${escapeAttr(project.title)}" />
        </label>
        <label class="create-field">作者
          <input type="text" id="v3-author" value="${escapeAttr(project.author)}" />
        </label>
        <label class="create-field">マッパー
          <select id="v3-mapper">${mapperOptions(project.mapperId)}</select>
        </label>
        <div class="mapper-cap-box">
          <strong>${cap.id} — ${escapeHtml(cap.name)}</strong>
          <p class="muted">${escapeHtml(cap.summary)}</p>
          <p class="muted">PRG: ${escapeHtml(cap.prgHint)} ／ CHR: ${escapeHtml(cap.chrHint)}</p>
          <p class="muted">${escapeHtml(cap.blockNote)}</p>
          <p class="${cap.buildSupported ? "ok" : "warn"}">${
            cap.buildSupported
              ? "このマッパーは Create から .nes ビルドできます。"
              : "このマッパーはまだ Create ビルド未対応です（NROM 以外は準備中）。"
          }</p>
        </div>
        <p class="muted">バージョン: v${project.version}</p>

        <h3>提供アセット</h3>
        <p class="muted">
          ${PROVIDED_ASSET_PACKS[0]!.title}: ${PROVIDED_ASSET_PACKS[0]!.description}
        </p>
        <p class="muted">取り込み済みグリフ: ${fontCount} 文字</p>
        <button type="button" id="v3-import-font">基本フォントを取り込む</button>
        <p class="muted" id="v3-import-font-status"></p>

        <h3>ビルド時の取り込み見込み</h3>
        <p class="muted">
          シーンから参照中: ビットマップ ${used.bitmapIds.size} / パレット ${used.paletteIds.size} /
          キャラ ${used.characterIds.size}。CHR 候補（使用分のみ）: ${buildBmps.length} 枚。
          取り込んだだけの未使用フォントはバイナリに入りません。
        </p>
        <div class="create-wizard-actions">
          <button type="button" id="v3-build-btn">ビルド&amp;実行</button>
          <span class="muted">NROM(0) のみ。結果は左プレビューへ。</span>
        </div>
        <h3>プロジェクトファイル</h3>
        <div class="create-wizard-actions">
          <button type="button" id="v3-export-btn" class="secondary">JSON を書き出す</button>
          <label class="secondary create-file-label">
            JSON を読み込む
            <input type="file" id="v3-import-input" accept="application/json,.json,.famijs.json" hidden />
          </label>
        </div>
        <p class="muted" id="v3-io-status"></p>
      `;
      editor.querySelector<HTMLInputElement>("#v3-title")!.addEventListener("change", (e) => {
        project = { ...project, title: (e.target as HTMLInputElement).value };
        commit();
      });
      editor.querySelector<HTMLInputElement>("#v3-author")!.addEventListener("change", (e) => {
        project = { ...project, author: (e.target as HTMLInputElement).value };
        commit();
      });
      editor.querySelector<HTMLSelectElement>("#v3-mapper")!.addEventListener("change", (e) => {
        const v = Number((e.target as HTMLSelectElement).value) as CreateMapperId;
        project = { ...project, mapperId: v };
        commit();
      });
      const importStatus = editor.querySelector<HTMLParagraphElement>("#v3-import-font-status")!;
      editor.querySelector("#v3-import-font")!.addEventListener("click", () => {
        importStatus.textContent = "取り込み中…";
        requestAnimationFrame(() => {
          try {
            const result = importFontJpBasicIntoProject(project);
            commit();
            importStatus.textContent = `完了: 追加 ${result.added} / 既存スキップ ${result.skipped}`;
          } catch (err: unknown) {
            importStatus.textContent = err instanceof Error ? err.message : String(err);
          }
        });
      });
      editor.querySelector("#v3-build-btn")?.addEventListener("click", () => {
        flushBlocks();
        persist();
        options.onBuild?.();
      });
      const ioStatus = editor.querySelector<HTMLParagraphElement>("#v3-io-status")!;
      editor.querySelector("#v3-export-btn")!.addEventListener("click", () => {
        flushBlocks();
        const blob = new Blob([serializeProjectV3(project)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project.title || "project"}.herocon.json`;
        a.click();
        URL.revokeObjectURL(url);
        ioStatus.textContent = "書き出しました";
      });
      editor.querySelector<HTMLInputElement>("#v3-import-input")!.addEventListener("change", async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          destroyBitmapEditor();
          destroyBlockEditor();
          project = parseProjectAnyToV3(text);
          selection = { kind: "project" };
          commit();
          ioStatus.textContent = `「${file.name}」を読み込みました`;
        } catch (err: unknown) {
          ioStatus.textContent = err instanceof Error ? err.message : String(err);
        }
        (e.target as HTMLInputElement).value = "";
      });
      return;
    }

    if (selection.kind === "folder") {
      const folderSel = selection;
      const folder = folderSel.folder;
      const labels: Record<typeof folder, string> = {
        palettes: "パレット",
        bitmaps: "ビットマップ",
        characters: "キャラクター",
        sounds: "音",
        scenes: "シーン",
      };
      editor.innerHTML = `
        <h2>${labels[folder]}</h2>
        <p class="muted">フォルダです。下のボタンで追加するか、左の項目を選んで編集します。</p>
        <button type="button" id="v3-add-asset">＋ 追加</button>
      `;
      editor.querySelector("#v3-add-asset")!.addEventListener("click", () => {
        addAsset(folder);
      });
      return;
    }

    if (selection.kind === "palette") {
      const pal = project.palettes[selection.id];
      if (!pal) {
        editor.innerHTML = `<p class="muted">パレットが見つかりません</p>`;
        return;
      }
      const palette = pal;
      editor.innerHTML = `
        <h2>パレット</h2>
        <label class="create-field">名前
          <input type="text" id="v3-pal-name" value="${escapeAttr(palette.name)}" />
        </label>
        <p class="muted">スロット色をクリックすると NES 64色から選べます。C0 は透明扱い推奨。</p>
        <div class="create-palette-swatches" id="v3-pal-swatches"></div>
        <div class="bmp-nes-grid" id="v3-pal-nes" hidden></div>
        <button type="button" id="v3-delete" class="danger">削除</button>
      `;
      let pickingSlot: 0 | 1 | 2 | 3 | null = null;
      const swatchesWrap = editor.querySelector<HTMLDivElement>("#v3-pal-swatches")!;
      const nesWrap = editor.querySelector<HTMLDivElement>("#v3-pal-nes")!;

      function renderPalSwatches(): void {
        swatchesWrap.innerHTML = "";
        for (let i = 0; i < 4; i++) {
          const slot = i as 0 | 1 | 2 | 3;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "bmp-swatch" + (pickingSlot === slot ? " selected" : "");
          btn.textContent = `C${slot}`;
          if (slot === 0) {
            btn.style.background = "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0/10px 10px";
          } else {
            btn.style.background = nesIndexToCss(palette.colors[slot]!);
          }
          btn.addEventListener("click", () => {
            pickingSlot = slot;
            nesWrap.hidden = false;
            renderPalSwatches();
          });
          swatchesWrap.appendChild(btn);
        }
      }

      nesWrap.innerHTML = "";
      for (let i = 0; i < 64; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bmp-nes-cell";
        btn.style.background = nesIndexToCss(i);
        btn.title = `$${i.toString(16).padStart(2, "0")}`;
        btn.addEventListener("click", () => {
          if (pickingSlot === null) return;
          palette.colors[pickingSlot] = i;
          softCommit();
          renderPalSwatches();
        });
        nesWrap.appendChild(btn);
      }
      renderPalSwatches();

      editor.querySelector<HTMLInputElement>("#v3-pal-name")!.addEventListener("change", (e) => {
        palette.name = (e.target as HTMLInputElement).value;
        commit();
      });
      editor.querySelector("#v3-delete")!.addEventListener("click", () => deletePalette(palette.id));
      return;
    }

    if (selection.kind === "bitmap") {
      const bmp = project.bitmaps[selection.id];
      if (!bmp) {
        editor.innerHTML = `<p class="muted">ビットマップが見つかりません</p>`;
        return;
      }
      const pal = project.palettes[bmp.paletteId];
      editor.innerHTML = `
        <h2>ビットマップ</h2>
        <label class="create-field">名前
          <input type="text" id="v3-bmp-name" value="${escapeAttr(bmp.name)}" />
        </label>
        <label class="create-field">パレット
          <select id="v3-bmp-pal">${paletteOptions(project, bmp.paletteId)}</select>
        </label>
        <div id="v3-bmp-editor-host"></div>
        <button type="button" id="v3-delete" class="danger">削除</button>
      `;
      editor.querySelector<HTMLInputElement>("#v3-bmp-name")!.addEventListener("change", (e) => {
        bmp.name = (e.target as HTMLInputElement).value;
        commit();
      });
      editor.querySelector<HTMLSelectElement>("#v3-bmp-pal")!.addEventListener("change", (e) => {
        bmp.paletteId = (e.target as HTMLSelectElement).value;
        commit();
      });
      editor.querySelector("#v3-delete")!.addEventListener("click", () => deleteBitmap(bmp.id));

      const host = editor.querySelector<HTMLElement>("#v3-bmp-editor-host")!;
      if (pal) {
        bitmapEditor = mountBitmapEditor(host, {
          getBitmap: () => bmp,
          getPalette: () => project.palettes[bmp.paletteId] ?? pal,
          resolvePaletteFromImport: (colors, nameHint) => findOrCreatePalette(project, colors, nameHint),
          onChange: () => softCommit(),
          onPaletteChange: () => softCommit(),
        });
      } else {
        host.innerHTML = `<p class="muted">パレットが見つかりません。先にパレットを選んでください。</p>`;
      }
      return;
    }

    if (selection.kind === "character") {
      const ch = project.characters[selection.id];
      if (!ch) {
        editor.innerHTML = `<p class="muted">キャラクターが見つかりません</p>`;
        return;
      }
      if (!ch.paletteId) {
        const bmpRef = project.bitmaps[ch.bitmapId];
        ch.paletteId = bmpRef?.paletteId ?? project.paletteOrder[0] ?? "";
      }
      editor.innerHTML = `
        <h2>キャラクター</h2>
        <label class="create-field">名前
          <input type="text" id="v3-ch-name" value="${escapeAttr(ch.name)}" />
        </label>
        <label class="create-field">ビットマップ
          <select id="v3-ch-bmp">${bitmapOptions(project, ch.bitmapId)}</select>
        </label>
        <label class="create-field">デフォルトパレット（プレビュー・色違い用）
          <select id="v3-ch-pal">${paletteOptions(project, ch.paletteId)}</select>
        </label>
        <canvas id="v3-ch-preview" class="chr-preview-canvas" width="128" height="128"></canvas>
        <h3>振る舞い（ブロック）</h3>
        <p class="muted">左のツールボックスからブロックを置きます。コードはビルド時に自動生成されます。ビットマップが複数タイルのときは、drawSprite の tile 番号を 0,1,2… と並べてください。</p>
        <div id="v3-ch-blocks" class="block-workspace create-v3-blocks"></div>
        <button type="button" id="v3-delete" class="danger">削除</button>
      `;
      const preview = editor.querySelector<HTMLCanvasElement>("#v3-ch-preview")!;
      const redrawPreview = () => {
        const bmp = project.bitmaps[ch.bitmapId];
        const pal = project.palettes[ch.paletteId];
        drawCharacterPreview(preview, bmp, pal);
      };
      redrawPreview();

      editor.querySelector<HTMLInputElement>("#v3-ch-name")!.addEventListener("change", (e) => {
        ch.name = (e.target as HTMLInputElement).value;
        commit();
      });
      editor.querySelector<HTMLSelectElement>("#v3-ch-bmp")!.addEventListener("change", (e) => {
        ch.bitmapId = (e.target as HTMLSelectElement).value;
        const bmp = project.bitmaps[ch.bitmapId];
        if (bmp && !project.palettes[ch.paletteId]) ch.paletteId = bmp.paletteId;
        commit();
      });
      editor.querySelector<HTMLSelectElement>("#v3-ch-pal")!.addEventListener("change", (e) => {
        ch.paletteId = (e.target as HTMLSelectElement).value;
        softCommit();
        redrawPreview();
      });
      editor.querySelector("#v3-delete")!.addEventListener("click", () => deleteCharacter(ch.id));
      mountPartBlocks(editor.querySelector<HTMLElement>("#v3-ch-blocks")!, ch.id);
      return;
    }

    if (selection.kind === "sound") {
      const snd = project.sounds[selection.id];
      if (!snd) {
        editor.innerHTML = `<p class="muted">音が見つかりません</p>`;
        return;
      }
      editor.innerHTML = `
        <h2>音</h2>
        <label class="create-field">名前
          <input type="text" id="v3-snd-name" value="${escapeAttr(snd.name)}" />
        </label>
        <label class="create-field">チャンネル
          <input type="number" id="v3-snd-ch" min="0" max="3" value="${snd.channel}" />
        </label>
        <label class="create-field">音階
          <input type="number" id="v3-snd-note" min="0" max="255" value="${snd.note}" />
        </label>
        <label class="create-field">長さ
          <input type="number" id="v3-snd-dur" min="0" max="255" value="${snd.duration}" />
        </label>
        <button type="button" id="v3-delete" class="danger">削除</button>
      `;
      const bindNum = (id: string, apply: (n: number) => void) => {
        editor.querySelector<HTMLInputElement>(id)!.addEventListener("change", (e) => {
          apply(Number((e.target as HTMLInputElement).value) | 0);
          commit();
        });
      };
      editor.querySelector<HTMLInputElement>("#v3-snd-name")!.addEventListener("change", (e) => {
        snd.name = (e.target as HTMLInputElement).value;
        commit();
      });
      bindNum("#v3-snd-ch", (n) => {
        snd.channel = Math.max(0, Math.min(3, n)) as 0 | 1 | 2 | 3;
      });
      bindNum("#v3-snd-note", (n) => {
        snd.note = Math.max(0, Math.min(255, n));
      });
      bindNum("#v3-snd-dur", (n) => {
        snd.duration = Math.max(0, Math.min(255, n));
      });
      editor.querySelector("#v3-delete")!.addEventListener("click", () => deleteSound(snd.id));
      return;
    }

    if (selection.kind === "scene") {
      const sc = project.scenes[selection.id];
      if (!sc) {
        editor.innerHTML = `<p class="muted">シーンが見つかりません</p>`;
        return;
      }
      const placementRows = sc.placements
        .map(
          (pl) => `
        <li data-pl="${escapeAttr(pl.id)}">
          <select data-field="characterId">${characterOptions(project, pl.characterId)}</select>
          x <input type="number" min="0" max="255" data-field="x" value="${pl.x}" />
          y <input type="number" min="0" max="255" data-field="y" value="${pl.y}" />
          <button type="button" data-remove="${escapeAttr(pl.id)}">削除</button>
        </li>`,
        )
        .join("");
      editor.innerHTML = `
        <h2>シーン</h2>
        <label class="create-field">名前
          <input type="text" id="v3-sc-name" value="${escapeAttr(sc.name)}" />
        </label>
        <label class="create-field">背景ビットマップ（任意）
          <select id="v3-sc-bg">
            <option value="">（なし）</option>
            ${bitmapOptions(project, sc.backgroundBitmapId ?? "")}
          </select>
        </label>
        <h3>配置</h3>
        <ul class="create-placement-list">${placementRows || "<li class='muted'>まだありません</li>"}</ul>
        <button type="button" id="v3-add-placement">＋ 配置を追加</button>
        <h3>ロジック（ブロック）</h3>
        <p class="muted">instance や update をブロックで組みます。サンプル Main には最初からブロックが入っています。</p>
        <div id="v3-sc-blocks" class="block-workspace create-v3-blocks"></div>
        <button type="button" id="v3-delete" class="danger">シーン削除</button>
      `;
      editor.querySelector<HTMLInputElement>("#v3-sc-name")!.addEventListener("change", (e) => {
        sc.name = (e.target as HTMLInputElement).value;
        commit();
      });
      editor.querySelector<HTMLSelectElement>("#v3-sc-bg")!.addEventListener("change", (e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) sc.backgroundBitmapId = v;
        else delete sc.backgroundBitmapId;
        commit();
      });
      editor.querySelector("#v3-add-placement")!.addEventListener("click", () => {
        const firstCh = project.characterOrder[0];
        if (!firstCh) {
          window.alert("先にキャラクターを追加してください");
          return;
        }
        const pl: ScenePlacement = { id: newAssetId("plc"), characterId: firstCh, x: 120, y: 100 };
        sc.placements.push(pl);
        commit();
      });
      editor.querySelectorAll<HTMLElement>("[data-pl]").forEach((row) => {
        const plId = row.dataset.pl!;
        const pl = sc.placements.find((p) => p.id === plId);
        if (!pl) return;
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((el) => {
          el.addEventListener("change", () => {
            const field = el.dataset.field!;
            if (field === "characterId") pl.characterId = el.value;
            if (field === "x") pl.x = Math.max(0, Math.min(255, Number(el.value) | 0));
            if (field === "y") pl.y = Math.max(0, Math.min(255, Number(el.value) | 0));
            softCommit();
          });
        });
        row.querySelector<HTMLButtonElement>("[data-remove]")?.addEventListener("click", () => {
          sc.placements = sc.placements.filter((p) => p.id !== plId);
          commit();
        });
      });
      editor.querySelector("#v3-delete")!.addEventListener("click", () => deleteScene(sc.id));
      mountSceneBlocks(editor.querySelector<HTMLElement>("#v3-sc-blocks")!, sc.id);
    }
  }

  function addAsset(folder: "palettes" | "bitmaps" | "characters" | "sounds" | "scenes"): void {
    if (folder === "palettes") {
      const id = newAssetId("pal");
      project.palettes[id] = { id, name: `パレット${project.paletteOrder.length + 1}`, colors: [0x0f, 0x01, 0x21, 0x30] };
      project.paletteOrder.push(id);
      selection = { kind: "palette", id };
    } else if (folder === "bitmaps") {
      const palId = project.paletteOrder[0];
      if (!palId) {
        window.alert("先にパレットを追加してください");
        return;
      }
      const bmp = createEmptyBitmap(palId, {
        name: `ビットマップ${project.bitmapOrder.length + 1}`,
        ...DEFAULT_BITMAP_TILES,
      });
      project.bitmaps[bmp.id] = bmp;
      project.bitmapOrder.push(bmp.id);
      selection = { kind: "bitmap", id: bmp.id };
    } else if (folder === "characters") {
      let bmpId = project.bitmapOrder[0];
      if (!bmpId) {
        const palId = project.paletteOrder[0];
        if (!palId) {
          window.alert("先にパレットを追加してください");
          return;
        }
        const bmp = createEmptyBitmap(palId, { name: "新規グラフィック", ...DEFAULT_BITMAP_TILES });
        project.bitmaps[bmp.id] = bmp;
        project.bitmapOrder.push(bmp.id);
        bmpId = bmp.id;
      }
      const id = newAssetId("chr");
      const bmp = project.bitmaps[bmpId]!;
      project.characters[id] = {
        id,
        name: `キャラ${project.characterOrder.length + 1}`,
        bitmapId: bmpId,
        paletteId: bmp.paletteId,
      };
      project.characterOrder.push(id);
      selection = { kind: "character", id };
    } else if (folder === "sounds") {
      const id = newAssetId("snd");
      project.sounds[id] = { id, name: `音${project.soundOrder.length + 1}`, channel: 0, note: 24, duration: 10 };
      project.soundOrder.push(id);
      selection = { kind: "sound", id };
    } else {
      const id = newAssetId("scn");
      project.scenes[id] = { id, name: `シーン${project.sceneOrder.length + 1}`, placements: [], soundIds: [] };
      project.sceneOrder.push(id);
      selection = { kind: "scene", id };
    }
    commit();
  }

  function deletePalette(id: string): void {
    if (project.paletteOrder.length <= 1) {
      window.alert("パレットは最低1つ必要です");
      return;
    }
    if (Object.values(project.bitmaps).some((b) => b.paletteId === id)) {
      window.alert("このパレットを参照しているビットマップがあるため削除できません");
      return;
    }
    delete project.palettes[id];
    project.paletteOrder = project.paletteOrder.filter((x) => x !== id);
    selection = { kind: "folder", folder: "palettes" };
    commit();
  }

  function deleteBitmap(id: string): void {
    if (Object.values(project.characters).some((c) => c.bitmapId === id)) {
      window.alert("このビットマップを参照しているキャラクターがあるため削除できません");
      return;
    }
    if (Object.values(project.scenes).some((s) => s.backgroundBitmapId === id)) {
      window.alert("このビットマップを背景に使っているシーンがあるため削除できません");
      return;
    }
    delete project.bitmaps[id];
    project.bitmapOrder = project.bitmapOrder.filter((x) => x !== id);
    selection = { kind: "folder", folder: "bitmaps" };
    commit();
  }

  function deleteCharacter(id: string): void {
    for (const sc of Object.values(project.scenes)) {
      if (sc.placements.some((p) => p.characterId === id)) {
        window.alert("このキャラクターを配置しているシーンがあるため削除できません");
        return;
      }
    }
    delete project.characters[id];
    project.characterOrder = project.characterOrder.filter((x) => x !== id);
    selection = { kind: "folder", folder: "characters" };
    commit();
  }

  function deleteSound(id: string): void {
    for (const sc of Object.values(project.scenes)) {
      if (sc.soundIds.includes(id)) {
        window.alert("この音を参照しているシーンがあるため削除できません");
        return;
      }
    }
    delete project.sounds[id];
    project.soundOrder = project.soundOrder.filter((x) => x !== id);
    selection = { kind: "folder", folder: "sounds" };
    commit();
  }

  function deleteScene(id: string): void {
    if (project.sceneOrder.length <= 1) {
      window.alert("シーンは最低1つ必要です");
      return;
    }
    delete project.scenes[id];
    project.sceneOrder = project.sceneOrder.filter((x) => x !== id);
    selection = { kind: "folder", folder: "scenes" };
    commit();
  }

  newBtn.addEventListener("click", () => {
    selection = { kind: "wizard" };
    renderTree();
    renderEditor();
  });

  renderTree();
  renderEditor();

  return {
    getProject: () => {
      flushBlocks();
      return project;
    },
    setProject: (next) => {
      destroyBitmapEditor();
      destroyBlockEditor();
      project = next;
      selection = { kind: "project" };
      renderTree();
      renderEditor();
    },
    refresh: () => {
      renderTree();
      renderEditor();
    },
    flush: () => {
      flushBlocks();
      persist();
    },
    resizeBlocks: () => {
      if (blockWorkspace) Blockly.svgResize(blockWorkspace);
    },
    selectCharacter: (id: string) => {
      if (!project.characters[id]) return;
      selection = { kind: "character", id };
      renderTree();
      renderEditor();
    },
    selectScene: (id: string) => {
      if (!project.scenes[id]) return;
      selection = { kind: "scene", id };
      renderTree();
      renderEditor();
    },
  };
}

function parseSel(raw: string): ExplorerSelection {
  if (raw === "project") return { kind: "project" };
  if (raw.startsWith("folder:")) {
    const folder = raw.slice(7) as "palettes" | "bitmaps" | "characters" | "sounds" | "scenes";
    return { kind: "folder", folder };
  }
  const [kind, id] = raw.split(":");
  if (
    (kind === "palette" || kind === "bitmap" || kind === "character" || kind === "sound" || kind === "scene") &&
    id
  ) {
    return { kind, id };
  }
  return { kind: "project" };
}

function mapperOptions(selected: CreateMapperId): string {
  return CREATE_MAPPER_IDS.map((id) => {
    const cap = MAPPER_CAPABILITIES[id];
    const ready = cap.buildSupported ? "" : "（ビルド準備中）";
    return `<option value="${id}"${id === selected ? " selected" : ""}>${id} — ${cap.name}${ready}</option>`;
  }).join("");
}

function paletteOptions(project: ProjectV3, selected: string): string {
  return project.paletteOrder
    .map((id) => {
      const p = project.palettes[id]!;
      return `<option value="${escapeAttr(id)}"${id === selected ? " selected" : ""}>${escapeHtml(p.name)}</option>`;
    })
    .join("");
}

function bitmapOptions(project: ProjectV3, selected: string): string {
  return project.bitmapOrder
    .map((id) => {
      const b = project.bitmaps[id]!;
      return `<option value="${escapeAttr(id)}"${id === selected ? " selected" : ""}>${escapeHtml(b.name)}</option>`;
    })
    .join("");
}

function characterOptions(project: ProjectV3, selected: string): string {
  return project.characterOrder
    .map((id) => {
      const c = project.characters[id]!;
      return `<option value="${escapeAttr(id)}"${id === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`;
    })
    .join("");
}

function drawCharacterPreview(
  canvas: HTMLCanvasElement,
  bitmap: ProjectV3["bitmaps"][string] | undefined,
  palette: ProjectV3["palettes"][string] | undefined,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!bitmap || !palette) {
    ctx.fillStyle = "#666";
    ctx.fillText("プレビュー不可", 8, 24);
    return;
  }
  const w = bitmap.tileWidth * 8;
  const h = bitmap.tileHeight * 8;
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / w, canvas.height / h)));
  const ox = Math.floor((canvas.width - w * scale) / 2);
  const oy = Math.floor((canvas.height - h * scale) / 2);
  for (let ty = 0; ty < bitmap.tileHeight; ty++) {
    for (let tx = 0; tx < bitmap.tileWidth; tx++) {
      const base = (ty * bitmap.tileWidth + tx) * 64;
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const slot = (bitmap.pixels[base + py * 8 + px] ?? 0) & 3;
          if (slot === 0) continue;
          ctx.fillStyle = nesIndexToCss(palette.colors[slot]!);
          ctx.fillRect(ox + (tx * 8 + px) * scale, oy + (ty * 8 + py) * scale, scale, scale);
        }
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
