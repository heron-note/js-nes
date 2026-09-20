# へろコン Play 説明動画

- 出力: [`herocon-play-guide.mp4`](./herocon-play-guide.mp4)（390×844・スマホ縦）
- 対象: https://herocon-xi.vercel.app/ の Play のみ
- ナレーション: VOICEVOX Engine（ずんだもん ノーマル / style id 3）
- 映像: Playwright による静止画スライド + ffmpeg 結合

## 再生手順（再生成）

1. `D:\voicevox_engine\windows-cpu\run.exe` を起動（API `http://127.0.0.1:50021`）
2. `py docs/promo-video/synthesize.py`
3. `node docs/promo-video/capture.mjs`（要 Chromium: `npx playwright install chromium`）
4. `py docs/promo-video/compose.py`

## シーン

| # | 内容 | 画像 |
|---|---|---|
| 1 | イントロ | intro |
| 2 | 仮想コントローラ | pad |
| 3 | スクショ／録画 | capture |
| 4 | カセットを刺す | cassette |
| 5 | 収録ソフト（ライセンス安全な同梱） | samples |
| 6 | Lawn Mower プレイ | lawn |
| 7 | GitHub 連携 | github |
| 8 | 締め | end |

台本は `script.json`。撮影時にローカル `roms/` を使うことがあっても、説明文・ナレーションには出さない。
