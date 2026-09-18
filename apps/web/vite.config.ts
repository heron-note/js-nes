import { defineConfig } from "vite";

// `npm run build:unoptimized` などで mode=unoptimized を渡すと、minify / CSS圧縮を切る。
// 本番ビルドだけ ticks/sec が落ちる切り分け用。
//
// worker.format のデフォルトは 'iife' で、その場合クラスフィールドが
// Object.defineProperty 経由に落ち、dev（ネイティブ class fields の ESM Worker）だけ
// 速い・ビルド後だけ遅い、という差になりうる。ES2022 + format:'es' で揃える。
export default defineConfig(({ mode }) => {
  const unoptimized = mode === "unoptimized";

  return {
    base: "./",
    server: {
      host: true,
      port: 5173,
    },
    build: {
      target: "es2022",
      minify: unoptimized ? false : "esbuild",
      cssMinify: !unoptimized,
      // DevTools 開いた状態での計測を歪めないよう、切り分けビルドでも sourcemap は出さない
      sourcemap: false,
    },
    esbuild: {
      target: "es2022",
      ...(unoptimized
        ? {
            minifyIdentifiers: false,
            minifySyntax: false,
            minifyWhitespace: false,
          }
        : {}),
    },
    worker: {
      format: "es",
    },
  };
});
