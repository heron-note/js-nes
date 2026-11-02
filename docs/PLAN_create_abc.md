# Create 初心者向け A〜C 計画（2026-11-02 策定）

目的： 「テンプレートを選んだら基本は出来上がる」「画像をアップロードしたらビットマップ化でき、UIでサイズ・位置を微調整できる」体験を、初心者がブロックで改造できるところまで持っていく。

## 0. 現状（コード確認済み）

- テンプレートは8種（`apps/web/src/createTemplates.ts`）。選べば完成プロジェクトが生成される。
  ただしブロックの種が入っているのは `starter` のみ（`seedStarterBlocks`）。
  他7種はキャラ／シーンとも `legacyCode`（DSLコード文字列）で初期化され、ブロックを置くとコード全体が置き換わる。
- 画像→ビットマップ変換は実装済み（`bitmapRaster.ts` / `bitmapEditorV3.ts`）。
  NESパレット減色（現パレット固定／パレット自動抽出）、サイズはプリセット＋タイル数指定が可能。
  ただしサンプリングは「画像全体を枠へ引き伸ばし」のみで、縦横比保持・切り取り位置・拡大率の調整ができない。
- テンプレートのDSLコードには `&&` / `||` / ループ / 乱数は使われていない。
  当たり判定は `dslHitBox`（`gameKit.ts`）生成で、ブロック側にも等価の `fjs_on_overlap` がある。
- DSL制約： `+=` / `-=` の右辺は数値リテラルのみ（`packages/dsl-compiler/src/codegen.ts`）。
  つまり `self.x += self.speed` のような「速度をフィールドで持つ」書き方は現状できない。
- 既知の別件： dsl-compiler の golden テスト2件が素の develop でも失敗する（fixture drift 疑い）。Phase B2 着手前に切り分ける。

## Phase A： 画像取り込みの微調整（中）

ゴール： アップロードした画像を、プレビューを見ながら位置と拡大率を調整してからビットマップ化できる。

- `bitmapRaster.ts`： `rasterToBitmapPixels` に transform 引数を追加する。
  - `mode: "stretch"`（現行・既定）／ `"fit"`（縦横比を保って全体を収める。余白はスロット0）／ `"fill"`（枠いっぱいに拡大し、はみ出しを切り取る）
  - `offsetX` / `offsetY`（fill 時の切り取り位置）、`scale`（拡大率）
  - 既定値は現行挙動と同一にして後方互換を保つ。
- `bitmapEditorV3.ts`： ファイル選択で即確定せず、調整パネルを開く。
  - 元画像のデコード結果（RGBA）をメモリに保持し、変換結果をプレビューにリアルタイム表示する。
  - 操作： モード選択、位置（スライダーまたはドラッグ）、拡大スライダー、「取り込む」「やめる」。
  - 現パレット／パレット自動抽出の両取り込みモードで共通にする。
- 受け入れ基準： プレビューと確定結果が一致する／既存テストが全部通る／
  新規単体テスト（fit の余白がスロット0になる、offset で取り込み位置が変わる、fill の中央切り取り）。
- 対象ファイル： `bitmapRaster.ts`、`bitmapEditorV3.ts`、`style.css`、`bitmapRaster.test.ts`。
- 対象外： シーン配置のドラッグ調整（配置 x/y は現状の数値入力のまま。将来候補として別件）。

## Phase B： テンプレートの「かんたん調整」

### B1： ウィザード時の選択肢（小〜中）— 先にやる

ゴール： 作る時点で「速さ・難しさ」を選べる。値は生成コードに焼き込む（`ProjectV3` の変更なし）。

- テンプレート生成関数に opts を追加する。既存パターン（`dslHeroPlatformerMove({ groundY })`）の拡張。
- 対象パラメータ（コード確認済みの実在する数値）：
  - platformer / side_scroll： 歩く速さ（2／ダッシュ3）、ジャンプの長さ（`jumpLeft = 10`）、上昇3／下降2、無敵時間（`hero.hurt = 45`）
  - shmup： 自機の速さ（2）、弾・敵の落下速度
  - fighter： HP（`field hp = 5`）
  - rpg： 移動の間引き（`cool = 8`）
  - chase： 移動ステップ
- ウィザードに「ゲームの調整（任意）」欄を追加し、テンプレートごとに効く項目だけ出す（3択セレクト中心）。

### B2： 作った後の再調整（中〜大）— 必要が残れば

前提として DSL 拡張が要る。

- dsl-compiler： `+=` / `-=` の右辺に自フィールド参照（`self.speed` 等）を許可する。codegen の該当2箇所＋テスト追加。
  ROM 回帰は golden テストで確認する（既存2件の失敗を先に切り分けておくこと）。
- ブロック： `fjs_self_field_add` / `sub` にフィールド参照の入力を持たせる。
- テンプレート： `dslHeroPlatformerMove` 等を `field speed = 2;` のようなパラメータフィールド化する。
- UI： `ProjectV3` に `templateId?: string` を追加（任意フィールドなので後方互換）し、
  プロジェクト画面に「ゲームの調整」フォームを出す。値は legacyCode の `field` 宣言行と、
  ブロックがある場合は `fjs_field_decl` の値を同期して書き換える。
- 適用範囲は platformer / side_scroll（gameKit 共有部品）から。他テンプレは様子を見て広げる。

## Phase C： テンプレートのブロック化（大・本丸）

ゴール： どのテンプレートで作っても、全キャラ／全シーンがブロックで開けて、そのまま編集・ビルドできる。

- 土台： starter の `seedStarterBlocks` と `capturePartBlockState` / `captureSceneBlockState` を汎用化し、
  テンプレートごとに seed 関数を追加する。seed が生成するコードが従来の legacyCode と一致（または同等）なことを
  `createTemplates.test.ts` で検証する（コード比較＋ビルド成功）。capture はブラウザDOM必須のため、
  検証は単体テストと Preview 実機の二段構えにする。
- 表現可能性の照合結果： 現行ブロックでほぼ全て表現可能。
  唯一の例外は fighter の `hitNearX`（X方向のみの近接判定）で、対応ブロックが無い。
  → 対処として専用ブロック `fjs_on_overlap_x` を追加する（テンプレ側の挙動は変えない）。
- 実施順（易しい順、1テンプレ＝1コミット単位）：
  1. platformer（Hero は gameKit 共有、Goomba／Coin／Ground は単純）
  2. side_scroll（platformer と部品共有）
  3. shmup（弾の active 管理）
  4. chase
  5. rpg
  6. fighter（`fjs_on_overlap_x` 追加を含む）

## 全体の順序

A → B1 → C（platformer から順に）→ B2（必要性が残れば）

各フェーズの完了時点で develop Preview で実地確認する。
master への PR（本番反映）はフェーズごと・都度、へろんの判断で別途行う。
