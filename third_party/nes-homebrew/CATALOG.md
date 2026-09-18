# 同梱 ROM カタログ

エミュ対応マッパー: **0 / 1 / 2 / 3 / 4 / 7**（本リポジトリ現状）。

> **免責**: 各作者・配布物のライセンス表記を優先する。公開前に `licenses/` と公式ページを再確認すること。
> 本カタログは法律助言ではない。

## A. 商用同梱向き（寛容ライセンス）

| ファイル | 作者 | ライセンス | Mapper | 出典 |
|---|---|---|---|---|
| `Lawn_Mower.nes` | Shiru | **CC0** | 0 | shiru.untergrund.net / IA |
| `Lan_Master.nes` | Shiru | **CC0** | 0 | 同上 |
| `Chase.nes` | Shiru | **Public Domain**（ソース明記） | 0 | 同上 |
| `Zooming_Secretary.nes` | PinWizz + Shiru | **CC-BY**（帰属必須） | 0 | 同上 |
| `Hype.nes` | Shiru | 作者配布のフリーウェア（再配布慣行あり） | 0 | 同上 |
| `NY2011.nes` | Shiru (+ music Gibson) | フリーウェア／帰属推奨 | 0 | 同上 |
| `NY2020.nes` | Shiru | フリーウェア／帰属推奨 | **4** | 同上 |
| `Russian_Roulette.nes` | Damian Yerrick | **GNU All-Permissive** | 0 | pineight.com |
| `Zap_Ruder.nes` | Damian Yerrick | **GNU All-Permissive** | 0 | pineight.com |
| `RHDE_Furniture_Fight.nes` | Damian Yerrick | **GNU All-Permissive** | 0 | pineight.com |
| `Password_Save_Demo.nes` | Damian Yerrick | All-Permissive 系（README 参照） | 0 | pineight.com |
| `NROM_Template.nes` | Damian Yerrick | テンプレ（README 参照） | 0 | pineight.com |
| `Graphics_Editor.nes` | Damian Yerrick | ツール ROM（README 参照） | **1** | pineight.com |
| `Sound_Effects_Editor.nes` | Damian Yerrick | ツール ROM（README 参照） | **1** | pineight.com |
| `SNROM_Template.nes` | Damian Yerrick | テンプレ | **1** | pineight.com |
| `UOROM_Template.nes` | Damian Yerrick | テンプレ | **2** | pineight.com |
| `SuBoard.nes` | Shiru | フリーウェア（Famiclone キーボード向け） | 0 | shiru |

**CC-BY**: UI／README に「Zooming Secretary © PinWizz & Shiru」等のクレジットを入れる。

## B. GPL（再配布可・手続きあり）

バイナリ同梱は可能だが、ライセンス全文の同梱とソース入手手段の明示が必要。
Concentration Room は「正確な iNES バイナリをソースなしで配布してよい」特別例外あり（配布物の README）。

| ファイル | 作者 | ライセンス | Mapper |
|---|---|---|---|
| `Concentration_Room.nes` | Damian Yerrick | **GPLv3** + binary exception | 0 |
| `Thwaite.nes` | Damian Yerrick | **GPL** | 0 |

`licenses/Concentration_Room-GPLv3.txt` を参照。ソース: https://pineight.com/nes/ / GitHub pinobatch。

## C. テスト専用（マッパー検証）

| ファイル | 作者 | 備考 | Mapper |
|---|---|---|---|
| `HolyDiver_M0.nes` … `HolyDiver_M7.nes` | Damian Yerrick | Holy Diver Batman マッパー検出デモ（対応マッパー分）。All-Permissive | 0/1/2/3/4/7 |

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
