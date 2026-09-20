# develop ブランチ

検証用の開発ラインです。

| ブランチ | 用途 |
|---|---|
| `master` | 本番（GitHub Pages） |
| `develop` | 検証（Vercel の Production Branch 推奨） |
| `feature/...` | 作業。完了したら `develop` へ |

## Vercel 設定（推奨）

1. プロジェクトを GitHub の `js-nes` に連携
2. **Production Branch** を `develop` にする
3. `master` は Pages 側のまま（または Vercel では Preview のみ）

これで Create など進行中の UI を Vercel URL で確認し、安定したら `develop` → `master` で本番へ載せます。
