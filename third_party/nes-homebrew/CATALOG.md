# 同梱 ROM カタログ

エミュ対応マッパー: **0 / 1 / 2 / 3 / 4 / 7**（本リポジトリ現状）。

> **免責**: 各作者・配布物のライセンス表記を優先する。公開前に `licenses/` と公式ページを再確認すること。
> 本カタログは法律助言ではない。

アプリ UI では「収録ソフト」として各 ROM に `kind`（game / demo / tool / template / test）と日本語の `summary` / `howto` を付与する（`apps/web/scripts/sync-sample-roms.mjs`）。
自作デモではなく、再配布可能なホームブリュー等をすぐ遊べるよう同梱している。ゲーム以外（デモ・ツール・テンプレ・検証）も含む。

## A. 商用同梱向き（寛容ライセンス）

| ファイル | 種別 | なにものか | 作者 | ライセンス | Mapper |
|---|---|---|---|---|---|
| `Lawn_Mower.nes` | ゲーム | 芝刈りアクション | Shiru | **CC0** | 0 |
| `Lan_Master.nes` | ゲーム | LAN 接続パズル | Shiru | **CC0** | 0 |
| `Chase.nes` | ゲーム | C 入門記事用の小さな追っかけ | Shiru | **Public Domain** | 0 |
| `Zooming_Secretary.nes` | ゲーム | オフィスアクション（帰属必須） | PinWizz + Shiru | **CC-BY** | 0 |
| `Hype.nes` | ゲーム | 短いホームブリュー | Shiru | フリーウェア | 0 |
| `NY2011.nes` | デモ | 年賀デモ 2011 | Shiru | フリーウェア | 0 |
| `NY2020.nes` | デモ | 年賀デモ 2020 | Shiru | フリーウェア | **4** |
| `Russian_Roulette.nes` | デモ | Zapper トリガー読み取り | Damian Yerrick | **GNU All-Permissive** | 0 |
| `Zap_Ruder.nes` | 検証 | Zapper 精度テスト | Damian Yerrick | **GNU All-Permissive** | 0 |
| `RHDE_Furniture_Fight.nes` | ゲーム | 家具対戦ミニゲーム | Damian Yerrick | **GNU All-Permissive** | 0 |
| `Password_Save_Demo.nes` | デモ | パスワードセーブの仕組み | Damian Yerrick | All-Permissive 系 | 0 |
| `NROM_Template.nes` | テンプレ | Mapper 0 開発スケルトン | Damian Yerrick | テンプレ | 0 |
| `Graphics_Editor.nes` | ツール | 画面上グラフィック編集 | Damian Yerrick | ツール ROM | **1** |
| `Sound_Effects_Editor.nes` | ツール | 効果音エディタ | Damian Yerrick | ツール ROM | **1** |
| `SNROM_Template.nes` | テンプレ | Mapper 1 開発スケルトン | Damian Yerrick | テンプレ | **1** |
| `UOROM_Template.nes` | テンプレ | Mapper 2 開発スケルトン | Damian Yerrick | テンプレ | **2** |
| `SuBoard.nes` | デモ | Famiclone キーボード向け | Shiru | フリーウェア | 0 |

**CC-BY**: UI／README に「Zooming Secretary © PinWizz & Shiru」等のクレジットを入れる。

## B. GPL（再配布可・手続きあり）

バイナリ同梱は可能だが、ライセンス全文の同梱とソース入手手段の明示が必要。
Concentration Room は「正確な iNES バイナリをソースなしで配布してよい」特別例外あり（配布物の README）。

| ファイル | 種別 | なにものか | 作者 | ライセンス | Mapper |
|---|---|---|---|---|---|
| `Concentration_Room.nes` | ゲーム | 神経衰弱 | Damian Yerrick | **GPLv3** + binary exception | 0 |
| `Thwaite.nes` | ゲーム | ミサイル防衛風 | Damian Yerrick | **GPL** | 0 |

`licenses/Concentration_Room-GPLv3.txt` を参照。ソース: https://pineight.com/nes/ / GitHub pinobatch。

## C. テスト専用（マッパー検証）

| ファイル | 種別 | 備考 | Mapper |
|---|---|---|---|
| `HolyDiver_M0.nes` … `HolyDiver_M7.nes` | 検証 | Holy Diver Batman マッパー検出デモ（対応マッパー分）。All-Permissive | 0/1/2/3/4/7 |

## 意図的に入れていない／配布しないもの

| 作品 | 理由 |
|---|---|
| **Blade Buster** (HLC) | 作者サイトは無料ダウンロードのみ。**第三者再配布・商用同梱の明示許可なし**。TASVideos 等の「PD」表記はコミュニティ側。加えて作者自身が音楽の権利を懸念しており、BGM が他作品由来の可能性あり → **本リポジトリのサンプル選択・同梱配布から除外**。MMC3 検証はローカル `/roms/` のみ |
| Alter Ego (Shiru) | 移植元都合でライセンスが曖昧 |
| HEOHdemo (Shiru) | readme に Mario スプライト言及 → 第三者 IP リスク |
| Super Tilt Bro. | WTFPL だが Mapper 30 → エミュ非対応 |
| Galactor 等 itch 限定配布 | 自動化取得不可（手動追加候補） |
| Flappy Paratroopa | MIT でも Nintendo キャラ由来の見た目リスク |
| NC 付き作品 | 商用不可 |

## クレジット（最低限）

アプリの About／README に例えば次を載せる:

- NES homebrew samples by Shiru (https://shiru.untergrund.net)
- NES software by Damian Yerrick / Pin Eight (https://pineight.com/nes/)
- Zooming Secretary by PinWizz & Shiru (CC-BY)

## 件数

現在 **25** 本（Blade Buster 除外後。Holy Diver マッパー別含む）。
