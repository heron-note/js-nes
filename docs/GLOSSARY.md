# 用語集

| 用語 | 説明 |
|---|---|
| NES | Nintendo Entertainment System。国内向けは「ファミリーコンピュータ（ファミコン）」。 |
| iNES | `.nes` ファイルの標準フォーマット。先頭16バイトのヘッダーにPRG-ROM/CHR-ROMのサイズやMapper番号等を格納する。 |
| PRG-ROM | Program ROM。CPU（6502）が実行するプログラムコードを格納する領域。 |
| CHR-ROM | Character ROM。背景・スプライトのグラフィックデータ（タイルパターン）を格納する領域。 |
| Mapper | カートリッジ内のバンク切り替え回路の種別。Mapper 0（NROM）はバンク切り替えなしの最もシンプルな構成。本エミュレータはMapper 0/1(MMC1)/2(UxROM)/3(CNROM)/4(MMC3)/7(AxROM)の6種に対応（[04_EMULATOR_SPEC.md](04_EMULATOR_SPEC.md)）。 |
| NROM（Mapper 0） | バンク切り替え非対応の最小構成マッパー。PRG-ROM 16/32KB、CHR-ROM 8KB程度の小規模ゲーム向け。 |
| CPU（6502 / Ricoh 2A03） | ファミコンの中央処理装置。MOS 6502互換で、約1.79MHzで動作。 |
| PPU（Picture Processing Unit / Ricoh 2C02） | 画面描画専用チップ。背景・スプライトの合成、スキャンライン単位の描画を担う。 |
| APU（Audio Processing Unit） | 音源チップ。矩形波×2、三角波×1、ノイズ×1、DMC×1の計5チャンネル。 |
| OAM | Object Attribute Memory。スプライトの座標・パターン・属性を格納するPPU内メモリ。 |
| ゼロページ | メモリアドレス `$00`〜`$FF` の256バイト領域。アクセスが高速なため頻繁に使う変数を配置する。 |
| NMI | Non-Maskable Interrupt（ノンマスカブル割り込み）。ファミコンでは毎秒60回、垂直帰線期間（V-Blank）に発生し、画面更新のタイミング同期に使われる。 |
| 2bpp（2 bits per pixel） | ファミコンのグラフィック形式。1ピクセルを2ビット（4階調＝透明+3色）で表現し、「Plane 0」「Plane 1」という2枚のビットプレーンで構成する。 |
| スキャンライン | 画面を構成する水平1ライン分の描画単位。PPUの実装ではサイクル単位ではなくスキャンライン単位で処理することが多い。 |
| デューティ比 | 矩形波における「ON時間の割合」。ファミコンAPUの矩形波チャンネルは12.5%/25%/50%/75%の4種を持ち、音色の違いを生む。 |
| iNESヘッダー | `.nes` ファイル先頭16バイトのメタデータ。マジックナンバー(`NES<EOF>`)、PRG/CHRサイズ、Mapper番号、ミラーリング設定等を含む。 |
| WebRTC DataChannel | ブラウザ間でサーバーを介さずP2P通信を行うためのWeb標準API。[06_NETPLAY_SPEC.md](06_NETPLAY_SPEC.md) のオンライン対戦で使用。 |
| STUN | NAT越えのためのアドレス解決プロトコル/サーバー。WebRTCのP2P接続確立時に利用する。 |
| nestest.nes | CPU実装の正しさを検証するための有名なテストROM。公式ログとの突合に使う想定だが、本プロジェクトでは`tools/nestest-diff/`自体が未着手で、実際の照合検証はまだ行っていない（[04_EMULATOR_SPEC.md](04_EMULATOR_SPEC.md)の「未実装・既知の制約」参照）。 |

## 関連ドキュメント

- コンセプト: [00_CONCEPT.md](00_CONCEPT.md)
- エミュレータ仕様: [04_EMULATOR_SPEC.md](04_EMULATOR_SPEC.md)
