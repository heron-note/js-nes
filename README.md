# FamiJS Studio（仮称）

**公開URL: https://heron-note.github.io/js-nes/**

**JS風コードでファミコン（NES）の本物の ROM（.nes）を作れる、ブラウザ完結の統合開発環境。**

読者・利用者はブラウザ上で JavaScript 風の DSL・ドット絵・チップチューンを作るだけで、裏側では
「自作 6502/NES エミュレータ」がそのまま実機・他社エミュレータでも動く本物の `.nes` バイナリを
生成する。開発環境のインストールは一切不要。できたゲームはブラウザでそのまま遊べるほか、
`.nes` としてダウンロードし、note / BOOTH / itch.io 等で配布・販売できる。

> 本プロジェクトは、以下の Gemini との会話で固まった構想を実現するために立ち上げた。
> https://share.gemini.google/rfSfsy6ClKsF （「ブラウザでのファミコンエミュレータ実装ガイド」）

## コンセプトの要点

- **本物の NES バイナリを吐く** — ROM 抜き取りではなく完全自作アセット・自作コンパイラなので著作権の懸念がゼロ。堂々と配布・販売できる。
- **NES エミュレータ本体は「舞台装置」** — CPU/PPU の泥臭い解説はしない。「動いて当然」の裏方に徹し、記事や体験の主役は「JS風コードが本物の ROM に化ける」ところに置く。
- **アセットもブラウザで作る** — コード・ドット絵（CHR-ROM）・チップチューン（APU）をタブ1つで編集し、ビルドで 1 本の `.nes` に統合する。
- **お遊び精神を刺激する仕掛け** — カートリッジ風パッケージ画像の自動生成、コード埋め込みシェア URL、ゼロページ枯渇やスプライト超過を「実機の制約」として楽しく可視化する警告など。
- **将来的に NAT 超え対戦** — WebRTC DataChannel でブラウザ同士を直接つなぎ、1コン/2コンをオンライン対戦化する（ストレッチゴール）。

詳細な意思決定の経緯は [docs/00_CONCEPT.md](docs/00_CONCEPT.md) を参照。

## ドキュメント一覧

| # | ドキュメント | 内容 |
|---|---|---|
| 00 | [CONCEPT.md](docs/00_CONCEPT.md) | プロジェクトの目的・ゴール・非ゴール |
| 01 | [ARCHITECTURE.md](docs/01_ARCHITECTURE.md) | システム全体構成・技術スタック・リポジトリ構成 |
| 02 | [ROADMAP.md](docs/02_ROADMAP.md) | 開発マイルストーン & note 連載ロードマップ |
| 03 | [DSL_SPEC.md](docs/03_DSL_SPEC.md) | JS風 DSL の言語仕様（v0 ドラフト） |
| 04 | [EMULATOR_SPEC.md](docs/04_EMULATOR_SPEC.md) | NES エミュレータ本体（CPU/PPU/APU/Mapper）の実装方針 |
| 05 | [ASSET_EDITOR_SPEC.md](docs/05_ASSET_EDITOR_SPEC.md) | ドット絵エディタ・APU トラッカーの仕様 |
| 06 | [NETPLAY_SPEC.md](docs/06_NETPLAY_SPEC.md) | WebRTC オンライン対戦の設計（ストレッチゴール） |
| 07 | [CONTENT_PLAN.md](docs/07_CONTENT_PLAN.md) | note 連載・配布・販売の運用計画 |
| 08 | [GITHUB_CLOUD.md](docs/08_GITHUB_CLOUD.md) | GitHub Device Flow によるクラウド保存（Workers 中継） |
| - | [GLOSSARY.md](docs/GLOSSARY.md) | NES 関連用語集 |

## 現在のステータス

**コアマイルストーン（M1〜M6）完走 + ストレッチゴール一部着手（M7/M8）** — エミュレータコア（CPU/PPU/APU）、
DSLコンパイラ、ROMビルダー/ドット絵エディタ、サウンド、配布機能（カセットラベルPNG生成、配布用スタンドアロンHTML書き出し、
GitHub Pagesへの自動デプロイ）に加え、同梱ゲーム1本目「壁打ちPong」（M7）とWebRTCオンライン対戦Phase1（M8、
2タブ間でのシグナリング/接続確立を確認済み）を実装。詳細は [ROADMAP.md](docs/02_ROADMAP.md) を参照。

GitHub Pagesで実際に公開し、通常のブラウザタブで描画ループ（CPU→PPU→Canvas）が正しく動作することを確認済み。

（M5のサウンド再生ロジックは自動テストで検証済みだが、実際に音が鳴るかどうかの耳での確認は、
開発中に使った自動化ツールの制約（タブを非表示状態として扱うため）によりできていない。
外部エミュレータ（Mesen等）での`.nes`実機動作確認も、本開発環境に外部エミュレータがないため未実施。
詳細は [ROADMAP.md](docs/02_ROADMAP.md) のM5/M6注記を参照）

## セットアップ・開発コマンド

```bash
npm install          # 依存関係のインストール（ルートで一度だけ）
npm run dev           # apps/web の開発サーバーを起動
npm test              # 全ワークスペースのテスト（vitest）を実行
npm run typecheck     # 全ワークスペースの型チェック
npm run build          # 全ワークスペースのビルド
```

## リポジトリ構成（現状）

```
apps/web/                 # Web IDE本体（Vite + TypeScript、レスポンシブUI）
packages/emulator-core/   # NESエミュレータ本体（CPU/PPU/APU/Mapper0/iNESローダー）+ テスト
packages/dsl-compiler/    # JS風DSL → 6502バイナリのコンパイラ + テスト
packages/rom-builder/     # CHR-ROMパッキング・iNES生成・.nesダウンロード + テスト
games/game-01-pong/       # 同梱ゲーム1本目（壁打ちPong）のDSLソース + テスト
```

`apps/web` では「コード」タブでJS風DSLを書き、「ドット絵」タブで8x8タイルを描く。「ビルド&実行」を押すと
`dsl-compiler` のPRG-ROMと `rom-builder` でパッキングしたCHR-ROMを結合した `.nes` を生成し、`emulator-core` 上で実行する。
`drawSprite()` の結果は実際に画面に表示され、キーボード（矢印キー+Z/X+Enter/Shift）または常時表示の仮想パッドで動かせる。
`playTone()` を呼ぶと「音源」タブのチャンネルモニタが反応し、Web Audio経由で実際に音が鳴る。
ビルド後は「ビルド&実行」タブからカセットラベルPNGの生成や、配布用スタンドアロンHTML（本番ビルド後のみ）の書き出しができる。
**既知の制約**: ネームテーブル操作APIがないため背景は常にタイル0番が敷き詰められる、`drawSprite`の属性（フリップ等）は常に0固定、
サウンドのデューティ比/エンベロープ/ノイズ波形はWeb Audio側で簡易近似
（[05_ASSET_EDITOR_SPEC.md](docs/05_ASSET_EDITOR_SPEC.md)・[04_EMULATOR_SPEC.md](docs/04_EMULATOR_SPEC.md)参照）。
仕様は [03_DSL_SPEC.md](docs/03_DSL_SPEC.md) を参照。

`master` へのpushで GitHub Actions（`.github/workflows/deploy-pages.yml`）が自動的にテスト・ビルドし、GitHub Pagesへ配信する。

## 次のアクション（想定、ストレッチゴール）

1. ゲーム2本目、タイルマップ管理、URLシェア機能（M7残課題）
2. 専用の音源トラッカーUI（BGM/SEの打ち込み編集）とアセットのシンボル参照（`SPRITE.xxx`等）
3. WebRTCオンライン対戦（M8/M9）
