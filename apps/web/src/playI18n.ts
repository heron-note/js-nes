/**
 * Play 画面の簡易 i18n。
 * ブラウザ locale が日本語（ja*）なら日本語、それ以外は英語。
 */

export type PlayLocale = "ja" | "en";

const messages = {
  ja: {
    "html.lang": "ja",
    "toolbar.fullscreen": "▶ 全画面",
    "toolbar.exitFullscreen": "✕ 全画面を終了",
    "status.loading": "読み込み中...",
    "screen.aria": "NES画面プレビュー",
    "pad.toggleClose": "パッドを閉じる",
    "pad.toggleOpen": "パッドを開く",
    "pad.aria": "仮想コントローラ",
    "pad.dpadAria": "十字キーと中央スティック",
    "pad.up": "上",
    "pad.left": "左",
    "pad.right": "右",
    "pad.down": "下",
    "pad.stickAria": "中央の8方向スティック",
    "pad.screenshot": "スクリーンショット",
    "pad.record": "録画",
    "modeTabs.aria": "Play または Create",
    "create.tabTitle": "作る",
    "create.tabLabel": "Create",
    "controls.helpTitle": "操作方法",
    "controls.helpHeading": "操作方法",
    "controls.close": "閉じる",
    "controls.keyboard": "キーボード",
    "controls.keyboardDpad": "十字（中央スティックで斜めも可）",
    "controls.gamepad": "ゲームパッド（Standard）",
    "controls.gamepadMove": "左スティック / 十字",
    "controls.gamepadMoveAction": "移動（8方向）",
    "controls.gamepadDisconnected": "ゲームパッド: 未接続",
    "controls.gamepadConnected": "ゲームパッド: 接続中（{id}）",
    "controls.onScreen": "画面上のコントローラ",
    "controls.onScreenHint":
      "左のスティックは8方向（斜め対応）。SELECT / START / A / B はボタンです。",
    "cassette.deckAria": "カセットデッキ",
    "cassette.none": "カセットなし",
    "cassette.emptySub": "スロットは空いています。.nes / .zip をドロップしても刺せます",
    "cassette.insertedMetaFallback": "スロットにカセットが刺さっています",
    "cassette.insert": "カセットを刺す",
    "cassette.eject": "カセットを抜く",
    "cassette.reset": "リセット",
    "cassette.insertedOk": "カセットを刺しました",
    "cassette.insertFailed": "刺せませんでした: {message}",
    "cassette.ejected": "カセットを抜きました",
    "cassette.ejectedStatus": "カセットを抜きました（内蔵画面）",
    "cassette.resetNamed": "リセット: 「{name}」",
    "cassette.resetBoot": "リセットしました（内蔵画面）",
    "cassette.resetOk": "リセットしました",
    "cassette.running": "カセット「{name}」を実行中",
    "cassette.loadFailed": "読み込み失敗: {message}",
    "cassette.zipInserted": "ZIP から「{name}.nes」を刺しました",
    "netplay.open": "対戦",
    "netplay.badgeDisconnected": "未接続",
    "netplay.badgeConnected": "接続中",
    "netplay.badgePlaying": "対戦中",
    "netplay.title": "オンライン対戦",
    "netplay.lead":
      "P2P（WebRTC）の 2コン対戦。メイン画面は閉じたまま遊べます。招待のやり取りはまだ手動です。",
    "netplay.roleAria": "役割",
    "netplay.hostPick": "部屋を作る（1コン）",
    "netplay.guestPick": "部屋に入る（2コン）",
    "netplay.roleBack": "← 役割を選び直す",
    "netplay.modeSummary": "同期方式（上級）",
    "netplay.modeLegend": "同期方式",
    "netplay.modeStream": "画面共有（Phase1・映像配信）",
    "netplay.modeLockstep": "ロックステップ（実験・ROM転送＋双方エミュ）",
    "netplay.modeHint":
      "画面共有: ゲストは ROM 不要。映像遅延あり。ロックステップ: 接続時に ROM を渡し、入力数バイトだけ同期。",
    "netplay.hostHeading": "ホスト（1コン）",
    "netplay.hostStart": "ホストとして開始",
    "netplay.hostOfferLabel": "① 招待コードをコピーしてゲストに送る",
    "netplay.hostOfferPlaceholder": "ここに招待コードが表示されます",
    "netplay.hostAnswerLabel": "② ゲストから届いた応答コードを貼り付けて接続",
    "netplay.hostAnswerPlaceholder": "ゲストの応答コードを貼り付け",
    "netplay.hostConnect": "応答コードで接続",
    "netplay.guestHeading": "ゲスト（2コン）",
    "netplay.guestOfferLabel": "① ホストから届いた招待コードを貼り付け",
    "netplay.guestOfferPlaceholder": "ホストの招待コードを貼り付け",
    "netplay.guestJoin": "参加して応答コードを生成",
    "netplay.guestAnswerLabel": "② 生成された応答コードをホストに送る",
    "netplay.guestAnswerPlaceholder": "ここに応答コードが表示されます",
    "netplay.needRom": "ロックステップには先に ROM（ビルド or カセット）が必要です",
    "netplay.hostOfferGeneratingLockstep": "招待コードを生成中（ロックステップ）...",
    "netplay.hostOfferReadyLockstep":
      "招待コードを発行しました（ロックステップ）。ゲストに送ってください。",
    "netplay.hostOfferGenerating": "招待コードを生成中...",
    "netplay.hostOfferReady": "招待コードを発行しました。ゲストに送ってください。",
    "netplay.connectionState": "接続状態: {state}",
    "netplay.hostAnswerApplied": "応答コードを適用しました。接続中...",
    "netplay.guestAnswerGeneratingLockstep": "応答コードを生成中（ロックステップ）...",
    "netplay.guestAnswerReadyLockstep":
      "応答コードを発行しました（ロックステップ）。ホストに送り、ROM 受信を待ってください。",
    "netplay.guestAnswerGenerating": "応答コードを生成中...",
    "netplay.guestAnswerReady": "応答コードを発行しました。ホストに送ってください。",
    "netplay.romLoadFailed": "ROMの読み込みに失敗しました",
    "netplay.romLoadedLockstep": "ROM「{name}」をロードしました（ロックステップ）",
    "netplay.desync": "デシンク frame={frame}（local={localHash} remote={remoteHash}）",
    "sample.aria": "収録ソフト",
    "sample.label": "収録ソフト",
    "sample.loading": "読み込み中…",
    "sample.load": "読み込む",
    "sample.pick": "収録ソフトを選ぶ…",
    "sample.fetchFailed": "収録ソフト一覧を取得できません",
    "sample.pickPlease": "収録ソフトを選んでください",
    "sample.downloading": "「{title}」をダウンロード中…",
    "sample.inserted": "「{title}」を刺しました",
    "sample.loadFailed": "読み込み失敗: {message}",
    "sample.kind.game": "ゲーム（遊べる）",
    "sample.kind.demo": "デモ（見る／試す）",
    "sample.kind.tool": "開発ツール",
    "sample.kind.template": "テンプレ（開発用・遊べない）",
    "sample.kind.test": "検証（マッパー／周辺機器）",
    "sample.tag.game": "ゲーム",
    "sample.tag.demo": "デモ",
    "sample.tag.tool": "ツール",
    "sample.tag.template": "テンプレ",
    "sample.tag.test": "検証",
    "sample.fallbackSummary":
      "{kind}。作者 {author} / {license} / Mapper {mapper}",
    "sample.fallbackHowto":
      "操作はソフト内の案内に従ってください。テンプレ・検証ROMは遊ぶ要素がないことがあります。",
    "sample.metaAuthor": "作者",
    "sample.metaLicense": "ライセンス",
    "sample.metaCopyright": "著作権",
    "sample.metaUrl": "公式／配布",
    "sample.metaMapper": "Mapper",
    "github.panelAria": "GitHubクラウド",
    "github.heading": "GitHub 倉庫",
    "github.loggedOut": "未ログイン",
    "github.introHtml":
      "自分の Private リポジトリ（<code>herocon-data</code>）にカセットとプロジェクトを保存できます。",
    "github.login": "GitHub でログイン",
    "github.logout": "ログアウト",
    "github.deviceBefore": "GitHub を開き、コード",
    "github.deviceAfter": "を入力してください。",
    "github.verifyLink": "認証ページを開く",
    "github.romsHeading": "倉庫のカセット",
    "github.romsAria": "倉庫のカセット",
    "github.romLoad": "刺す",
    "github.romSave": "今のカセットを保存",
    "github.refresh": "更新",
    "github.projectsHeading": "倉庫のプロジェクト",
    "github.projectsAria": "倉庫のプロジェクト",
    "github.projectLoad": "開く",
    "github.projectSave": "今のプロジェクトを保存",
    "github.noRoms": "（カセットなし）",
    "github.noProjects": "（プロジェクトなし）",
    "github.usingRepo": "倉庫 {owner}/{repo} を利用中",
    "github.loginPreparing": "ログイン準備中…",
    "github.enterCode": "GitHub でコードを入力してください",
    "github.loginCancelled": "ログインをキャンセルしました",
    "github.loggedOutStatus": "ログアウトしました",
    "github.listRefreshed": "一覧を更新しました",
    "github.fetchingRom": "カセットを取得中…",
    "github.romInserted": "「{name}」を倉庫から刺しました",
    "github.sampleNoSave":
      "収録ソフトは倉庫に保存できません。自分の .nes を刺してから保存してください。",
    "github.nothingToSave": "保存するカセットがありません（先に刺すかビルドしてください）",
    "github.savingRom": "カセットを保存中…",
    "github.romSaved": "「{name}.nes」を倉庫に保存しました",
    "github.fetchingProject": "プロジェクトを取得中…",
    "github.projectOpened": "倉庫のプロジェクトを開きました",
    "github.savingProject": "プロジェクトを保存中…",
    "github.projectSaved": "「{name}」を倉庫に保存しました",
    "status.bootOk": "内蔵画面（カセットなし）",
    "status.bootFail": "内蔵 ROM の読み込みに失敗しました: {message}",
    "status.workerCrash":
      "エミュレーターが異常終了しました: {message}（ページを再読み込みしてください）",
    "status.workerError":
      "エミュレーターWorkerでエラーが発生しました: {message}（ページを再読み込みしてください）",
    "status.embeddedFail": "配布用HTMLに同梱されたROMの実行に失敗しました: {message}",
    "status.embeddedOk": "配布用HTMLに同梱されたROMを実行中",
    "status.screenshotFail": "スクリーンショットに失敗しました",
    "status.screenshotOk": "スクリーンショットを保存しました",
    "status.recordUnsupported": "このブラウザでは録画に対応していません",
    "status.recordStartFail": "録画の開始に失敗しました",
    "status.recordSaved": "録画を保存しました",
    "status.recording": "録画中…",
  },
  en: {
    "html.lang": "en",
    "toolbar.fullscreen": "▶ Fullscreen",
    "toolbar.exitFullscreen": "✕ Exit fullscreen",
    "status.loading": "Loading...",
    "screen.aria": "NES screen preview",
    "pad.toggleClose": "Hide pad",
    "pad.toggleOpen": "Show pad",
    "pad.aria": "Virtual controller",
    "pad.dpadAria": "D-pad and center stick",
    "pad.up": "Up",
    "pad.left": "Left",
    "pad.right": "Right",
    "pad.down": "Down",
    "pad.stickAria": "8-way center stick",
    "pad.screenshot": "Screenshot",
    "pad.record": "Record",
    "modeTabs.aria": "Play or Create",
    "create.tabTitle": "Create",
    "create.tabLabel": "Create",
    "controls.helpTitle": "Controls",
    "controls.helpHeading": "Controls",
    "controls.close": "Close",
    "controls.keyboard": "Keyboard",
    "controls.keyboardDpad": "D-pad (diagonals via center stick)",
    "controls.gamepad": "Gamepad (Standard)",
    "controls.gamepadMove": "Left stick / D-pad",
    "controls.gamepadMoveAction": "Move (8-way)",
    "controls.gamepadDisconnected": "Gamepad: disconnected",
    "controls.gamepadConnected": "Gamepad: connected ({id})",
    "controls.onScreen": "On-screen controller",
    "controls.onScreenHint":
      "The left stick is 8-way (diagonals supported). SELECT / START / A / B are buttons.",
    "cassette.deckAria": "Cassette deck",
    "cassette.none": "No cassette",
    "cassette.emptySub": "Slot is empty. You can also drop a .nes / .zip file here.",
    "cassette.insertedMetaFallback": "A cassette is inserted",
    "cassette.insert": "Insert cassette",
    "cassette.eject": "Eject",
    "cassette.reset": "Reset",
    "cassette.insertedOk": "Cassette inserted",
    "cassette.insertFailed": "Could not insert: {message}",
    "cassette.ejected": "Cassette ejected",
    "cassette.ejectedStatus": "Cassette ejected (built-in screen)",
    "cassette.resetNamed": "Reset: “{name}”",
    "cassette.resetBoot": "Reset (built-in screen)",
    "cassette.resetOk": "Reset",
    "cassette.running": "Playing cassette “{name}”",
    "cassette.loadFailed": "Load failed: {message}",
    "cassette.zipInserted": "Inserted “{name}.nes” from ZIP",
    "netplay.open": "Versus",
    "netplay.badgeDisconnected": "Offline",
    "netplay.badgeConnected": "Connecting",
    "netplay.badgePlaying": "In match",
    "netplay.title": "Online versus",
    "netplay.lead":
      "P2P (WebRTC) 2-player. You can keep playing with this dialog closed. Invite exchange is still manual.",
    "netplay.roleAria": "Role",
    "netplay.hostPick": "Create room (P1)",
    "netplay.guestPick": "Join room (P2)",
    "netplay.roleBack": "← Choose role again",
    "netplay.modeSummary": "Sync mode (advanced)",
    "netplay.modeLegend": "Sync mode",
    "netplay.modeStream": "Screen share (Phase 1 · video)",
    "netplay.modeLockstep": "Lockstep (experimental · ROM transfer + both emus)",
    "netplay.modeHint":
      "Screen share: guest needs no ROM (video latency). Lockstep: ROM is sent on connect; only input bytes sync.",
    "netplay.hostHeading": "Host (P1)",
    "netplay.hostStart": "Start as host",
    "netplay.hostOfferLabel": "① Copy the invite code and send it to the guest",
    "netplay.hostOfferPlaceholder": "Invite code appears here",
    "netplay.hostAnswerLabel": "② Paste the guest’s answer code to connect",
    "netplay.hostAnswerPlaceholder": "Paste guest answer code",
    "netplay.hostConnect": "Connect with answer code",
    "netplay.guestHeading": "Guest (P2)",
    "netplay.guestOfferLabel": "① Paste the host’s invite code",
    "netplay.guestOfferPlaceholder": "Paste host invite code",
    "netplay.guestJoin": "Join and generate answer code",
    "netplay.guestAnswerLabel": "② Send the generated answer code to the host",
    "netplay.guestAnswerPlaceholder": "Answer code appears here",
    "netplay.needRom": "Lockstep needs a ROM first (build or cassette)",
    "netplay.hostOfferGeneratingLockstep": "Generating invite (lockstep)...",
    "netplay.hostOfferReadyLockstep": "Invite ready (lockstep). Send it to the guest.",
    "netplay.hostOfferGenerating": "Generating invite...",
    "netplay.hostOfferReady": "Invite ready. Send it to the guest.",
    "netplay.connectionState": "Connection: {state}",
    "netplay.hostAnswerApplied": "Answer applied. Connecting...",
    "netplay.guestAnswerGeneratingLockstep": "Generating answer (lockstep)...",
    "netplay.guestAnswerReadyLockstep":
      "Answer ready (lockstep). Send it to the host and wait for the ROM.",
    "netplay.guestAnswerGenerating": "Generating answer...",
    "netplay.guestAnswerReady": "Answer ready. Send it to the host.",
    "netplay.romLoadFailed": "Failed to load ROM",
    "netplay.romLoadedLockstep": "Loaded ROM “{name}” (lockstep)",
    "netplay.desync": "Desync frame={frame} (local={localHash} remote={remoteHash})",
    "sample.aria": "Included software",
    "sample.label": "Included software",
    "sample.loading": "Loading…",
    "sample.load": "Load",
    "sample.pick": "Choose software…",
    "sample.fetchFailed": "Could not load software list",
    "sample.pickPlease": "Please choose software",
    "sample.downloading": "Downloading “{title}”…",
    "sample.inserted": "Inserted “{title}”",
    "sample.loadFailed": "Load failed: {message}",
    "sample.kind.game": "Games (playable)",
    "sample.kind.demo": "Demos (watch / try)",
    "sample.kind.tool": "Dev tools",
    "sample.kind.template": "Templates (dev · not playable)",
    "sample.kind.test": "Tests (mapper / peripherals)",
    "sample.tag.game": "Game",
    "sample.tag.demo": "Demo",
    "sample.tag.tool": "Tool",
    "sample.tag.template": "Template",
    "sample.tag.test": "Test",
    "sample.fallbackSummary":
      "{kind}. Author {author} / {license} / Mapper {mapper}",
    "sample.fallbackHowto":
      "Follow in-software instructions. Templates and test ROMs may have little to play.",
    "sample.metaAuthor": "Author",
    "sample.metaLicense": "License",
    "sample.metaCopyright": "Copyright",
    "sample.metaUrl": "Official / source",
    "sample.metaMapper": "Mapper",
    "github.panelAria": "GitHub cloud",
    "github.heading": "GitHub repo",
    "github.loggedOut": "Not signed in",
    "github.introHtml":
      "Save cassettes and projects to your private repo (<code>herocon-data</code>).",
    "github.login": "Sign in with GitHub",
    "github.logout": "Sign out",
    "github.deviceBefore": "Open GitHub and enter code",
    "github.deviceAfter": ".",
    "github.verifyLink": "Open auth page",
    "github.romsHeading": "Repo cassettes",
    "github.romsAria": "Repo cassettes",
    "github.romLoad": "Insert",
    "github.romSave": "Save current cassette",
    "github.refresh": "Refresh",
    "github.projectsHeading": "Repo projects",
    "github.projectsAria": "Repo projects",
    "github.projectLoad": "Open",
    "github.projectSave": "Save current project",
    "github.noRoms": "(no cassettes)",
    "github.noProjects": "(no projects)",
    "github.usingRepo": "Using {owner}/{repo}",
    "github.loginPreparing": "Preparing sign-in…",
    "github.enterCode": "Enter the code on GitHub",
    "github.loginCancelled": "Sign-in cancelled",
    "github.loggedOutStatus": "Signed out",
    "github.listRefreshed": "List updated",
    "github.fetchingRom": "Fetching cassette…",
    "github.romInserted": "Inserted “{name}” from repo",
    "github.sampleNoSave":
      "Included software can’t be saved to the repo. Insert your own .nes first.",
    "github.nothingToSave": "Nothing to save (insert a cassette or build first)",
    "github.savingRom": "Saving cassette…",
    "github.romSaved": "Saved “{name}.nes” to repo",
    "github.fetchingProject": "Fetching project…",
    "github.projectOpened": "Opened project from repo",
    "github.savingProject": "Saving project…",
    "github.projectSaved": "Saved “{name}” to repo",
    "status.bootOk": "Built-in screen (no cassette)",
    "status.bootFail": "Failed to load built-in ROM: {message}",
    "status.workerCrash": "Emulator crashed: {message} (please reload the page)",
    "status.workerError": "Emulator worker error: {message} (please reload the page)",
    "status.embeddedFail": "Failed to run ROM embedded in standalone HTML: {message}",
    "status.embeddedOk": "Running ROM embedded in standalone HTML",
    "status.screenshotFail": "Screenshot failed",
    "status.screenshotOk": "Screenshot saved",
    "status.recordUnsupported": "Recording is not supported in this browser",
    "status.recordStartFail": "Failed to start recording",
    "status.recordSaved": "Recording saved",
    "status.recording": "Recording…",
  },
} as const;

export type PlayMessageKey = keyof typeof messages.ja;

export function detectPlayLocale(): PlayLocale {
  const lang = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
  return lang === "ja" || lang.startsWith("ja-") ? "ja" : "en";
}

let currentLocale: PlayLocale = "ja";

export function getPlayLocale(): PlayLocale {
  return currentLocale;
}

export function t(key: PlayMessageKey, vars?: Record<string, string | number>): string {
  const table = messages[currentLocale] ?? messages.en;
  let text: string = table[key] ?? messages.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/** data-i18n / data-i18n-html / data-i18n-aria / data-i18n-title / data-i18n-placeholder を適用 */
export function applyPlayI18n(locale: PlayLocale = detectPlayLocale()): void {
  currentLocale = locale;
  document.documentElement.lang = t("html.lang");

  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const key = el.dataset.i18n as PlayMessageKey | undefined;
    if (!key) continue;
    el.textContent = t(key);
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-html]"))) {
    const key = el.dataset.i18nHtml as PlayMessageKey | undefined;
    if (!key) continue;
    el.innerHTML = t(key);
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-aria]"))) {
    const key = el.dataset.i18nAria as PlayMessageKey | undefined;
    if (!key) continue;
    el.setAttribute("aria-label", t(key));
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-i18n-title]"))) {
    const key = el.dataset.i18nTitle as PlayMessageKey | undefined;
    if (!key) continue;
    el.setAttribute("title", t(key));
  }
  for (const el of Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]"),
  )) {
    const key = el.dataset.i18nPlaceholder as PlayMessageKey | undefined;
    if (!key) continue;
    el.placeholder = t(key);
  }
}
