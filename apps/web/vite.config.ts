import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };

/**
 * Vercel の新 UI では VITE_ 付きを Secret にするとクライアントへ渡せない／空になることがある。
 * Config の VITE_* に加え、プレフィックスなし GITHUB_AUTH_RELAY_URL もビルド時に読み込む。
 */
function resolveAuthRelayUrl(mode: string): string {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const raw =
    process.env.VITE_GITHUB_AUTH_RELAY_URL ||
    process.env.GITHUB_AUTH_RELAY_URL ||
    fileEnv.VITE_GITHUB_AUTH_RELAY_URL ||
    fileEnv.GITHUB_AUTH_RELAY_URL ||
    "";
  return String(raw).trim().replace(/\/$/, "");
}

// worker.format のデフォルトは 'iife'。IIFEだとクラスフィールドが Object.defineProperty
// 経由に落ち、ネイティブ class fields の ESM Worker（dev）より本番だけ遅くなる。
// ES2022 + format:'es' で揃える。
export default defineConfig(({ mode }) => {
  const authRelayUrl = resolveAuthRelayUrl(mode);

  return {
    base: "./",
    server: {
      host: true,
      port: 5173,
    },
    define: {
      "import.meta.env.VITE_GITHUB_AUTH_RELAY_URL": JSON.stringify(authRelayUrl),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    },
    build: {
      target: "es2022",
    },
    esbuild: {
      target: "es2022",
    },
    worker: {
      format: "es",
    },
  };
});
