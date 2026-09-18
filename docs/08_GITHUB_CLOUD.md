# GitHub クラウド保存（Device Flow + Cloudflare Workers 中継）

正式公開が GitHub Pages でも Vercel でも、認証中継は既存の Cloudflare Workers を使う。

## 必要なもの

1. GitHub OAuth App（Device Flow 有効、スコープに `repo`）
2. 稼働中の auth-relay Worker（`GITHUB_CLIENT_ID` を Worker 側 env に設定済み）
3. フロントのビルド環境変数:

```bash
# apps/web/.env または CI / Vercel の Environment Variables
VITE_GITHUB_AUTH_RELAY_URL=https://your-auth-relay.workers.dev
```

未設定の場合、Play 画面の「GitHub 倉庫」パネルは非表示になる。

## 動き

1. 「GitHub でログイン」→ Device Flow（ユーザーコードを github.com/login/device に入力）
2. 初回は Private リポジトリ `famijs-studio-data` を自動作成
3. `roms/*.nes` と `projects/*.famijs.json` を Contents API で読み書き
4. トークンは `sessionStorage` のみ（タブを閉じると消える）

バイナリはユーザーブラウザ ↔ GitHub 間のみ。Pages / Vercel / Workers のディスクには残らない。
