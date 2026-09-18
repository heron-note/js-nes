# NES ホームブリュー同梱パック

商用再配布可能な（または同等に寛容な）ホームブリュー／デモ ROM を集めたものです。
公式吸い出し ROM は含みません。

## アプリでの使い方

Play 画面の「サンプル」セレクトから選ぶ → **選んで遊ぶ**。

- その都度 `public/sample-roms/`（ビルド成果）から HTTP 取得してメモリ上でロードする
- 端末への永続保存や GitHub `herocon-data` への保存はしない（提供カタログのため）
- 正本バイナリは本ディレクトリ。`npm run sync-sample-roms`（dev/build 前に自動）で Web 公開用へコピー

## 使い方（開発者）

- Shiru: https://shiru.untergrund.net/software.shtml
- Damian Yerrick (Pin Eight): https://pineight.com/nes/
- Blade Buster: High Level Challenge!（テスト用 MMC3）

再取得スクリプトは用意していません。Shiru 公式は User-Agent 付き `curl` が必要なことがあります。
